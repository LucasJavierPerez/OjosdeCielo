-- Atención a domicilio: mismo circuito que la internación, para visitas en casa.
--
-- Estructuralmente una visita a domicilio con seguimiento es idéntica a una
-- internación: paciente, diagnóstico, partes de evolución, estudios, medicación
-- que descuenta stock, cargos y cobros por caja, apertura y cierre con
-- comprobante. En lugar de duplicar todo, `internacion` gana un discriminador
-- `tipo` ('internacion' | 'domicilio') y una `direccion` para la visita.
--
-- El personal ve las dos cosas; la carga clínica sigue siendo del veterinario.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------

alter table public.internacion
  add column tipo text not null default 'internacion'
    check (tipo in ('internacion', 'domicilio'));

alter table public.internacion add column direccion text;

comment on column public.internacion.tipo is
  'internacion = el paciente está internado en la clínica; domicilio = atención en la casa.';
comment on column public.internacion.direccion is
  'Dónde se hace la visita a domicilio. Nulo para las internaciones.';

-- Un episodio activo por tipo y por mascota: un paciente puede estar en
-- seguimiento a domicilio y, por un cuadro agudo, internarse.
drop index if exists public.internacion_una_activa_por_mascota;
create unique index internacion_una_activa_por_mascota
  on public.internacion (mascota_id, tipo)
  where estado = 'activa';

-- La dirección del tutor, para proponerla al abrir una visita a domicilio.
-- Sólo en el contacto sin cuenta: en `perfil` no hay dirección y la carga el
-- propio tutor desde su cuenta.
alter table public.contacto_tutor add column direccion text;

-- ---------------------------------------------------------------------------
-- Contactos del paciente: sumar la dirección
-- ---------------------------------------------------------------------------

drop function if exists public.contactos_del_paciente(uuid);

create function public.contactos_del_paciente(p_mascota_id uuid)
returns table (
  id         uuid,
  perfil_id  uuid,
  registrado boolean,
  rol_tutor  public.rol_tutor,
  nombre     text,
  apellido   text,
  email      text,
  telefono   text,
  dni        text,
  direccion  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select mt.id, p.id, true, mt.rol, p.nombre, p.apellido, p.email, p.telefono, p.dni, null::text
    from public.mascota_tutor mt
    join public.perfil p on p.id = mt.perfil_id
   where mt.mascota_id = p_mascota_id
     and mt.revocado_en is null

  union all

  select c.id, null, false, null, c.nombre, c.apellido, c.email, c.telefono, c.dni, c.direccion
    from public.contacto_tutor c
   where c.mascota_id = p_mascota_id
     and c.vinculado_en is null;
end;
$$;

revoke execute on function public.contactos_del_paciente from public, anon;
grant execute on function public.contactos_del_paciente to authenticated;

-- ---------------------------------------------------------------------------
-- Alta de episodio (internación o domicilio)
-- ---------------------------------------------------------------------------

drop function if exists public.crear_internacion(uuid, text, text, text, text);

create function public.crear_internacion(
  p_mascota_id   uuid,
  p_motivo       text,
  p_diagnostico  text default null,
  p_ubicacion    text default null,
  p_indicaciones text default null,
  p_tipo         text default 'internacion',
  p_direccion    text default null
)
returns public.internacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internacion public.internacion;
  v_orden_id    uuid;
  v_cliente_id  uuid;
  v_tipo        text := coalesce(nullif(trim(coalesce(p_tipo, '')), ''), 'internacion');
begin
  if not public.es_veterinario() then
    raise exception 'Abrir una internación o una atención a domicilio es un acto clínico.'
      using errcode = '42501';
  end if;

  if v_tipo not in ('internacion', 'domicilio') then
    raise exception 'Tipo de episodio inválido: %', v_tipo using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Hace falta un motivo' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.internacion
     where mascota_id = p_mascota_id and tipo = v_tipo and estado = 'activa'
  ) then
    raise exception 'Este paciente ya tiene un episodio de ese tipo activo' using errcode = '22023';
  end if;

  -- El titular con cuenta, si lo hay: así la orden queda asociada al cliente y
  -- la ve en la app. Si el dueño todavía no se registró, queda sin cliente.
  select perfil_id into v_cliente_id
    from public.mascota_tutor
   where mascota_id = p_mascota_id and rol = 'titular' and revocado_en is null
   limit 1;

  insert into public.orden (cliente_id, canal, estado, total, notas)
  values (
    v_cliente_id, 'mostrador', 'borrador', 0,
    case when v_tipo = 'domicilio' then 'Atención a domicilio' else 'Internación' end
  )
  returning id into v_orden_id;

  insert into public.internacion
    (mascota_id, orden_id, tipo, motivo, diagnostico, ubicacion, direccion, indicaciones)
  values (
    p_mascota_id,
    v_orden_id,
    v_tipo,
    trim(p_motivo),
    nullif(trim(coalesce(p_diagnostico, '')), ''),
    nullif(trim(coalesce(p_ubicacion, '')), ''),
    nullif(trim(coalesce(p_direccion, '')), ''),
    nullif(trim(coalesce(p_indicaciones, '')), '')
  )
  returning * into v_internacion;

  return v_internacion;
end;
$$;

revoke execute on function public.crear_internacion from public, anon;
grant execute on function public.crear_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Editar el encabezado clínico (ahora también la dirección)
-- ---------------------------------------------------------------------------

drop function if exists public.actualizar_internacion(uuid, text, text, text);

create function public.actualizar_internacion(
  p_id           uuid,
  p_diagnostico  text default null,
  p_ubicacion    text default null,
  p_indicaciones text default null,
  p_direccion    text default null
)
returns public.internacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internacion public.internacion;
begin
  if not public.es_veterinario() then
    raise exception 'Editar el episodio es un acto clínico' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_id;
  if not found then
    raise exception 'No encontramos ese episodio' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'El episodio ya está cerrado' using errcode = '22023';
  end if;

  update public.internacion
     set diagnostico  = nullif(trim(coalesce(p_diagnostico, '')), ''),
         ubicacion    = nullif(trim(coalesce(p_ubicacion, '')), ''),
         direccion    = nullif(trim(coalesce(p_direccion, '')), ''),
         indicaciones = nullif(trim(coalesce(p_indicaciones, '')), '')
   where id = p_id
  returning * into v_internacion;

  return v_internacion;
end;
$$;

revoke execute on function public.actualizar_internacion from public, anon;
grant execute on function public.actualizar_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Lecturas: sumar tipo y dirección, y permitir filtrar por tipo
-- ---------------------------------------------------------------------------

drop function if exists public.resumen_internacion(uuid);

create function public.resumen_internacion(p_internacion_id uuid)
returns table (
  id             uuid,
  mascota_id     uuid,
  mascota        text,
  especie        public.especie,
  orden_id       uuid,
  profesional    text,
  motivo         text,
  diagnostico    text,
  ubicacion      text,
  indicaciones   text,
  estado         public.internacion_estado,
  ingreso_en     timestamptz,
  egreso_en      timestamptz,
  motivo_egreso  text,
  total_cargos   numeric,
  total_pagado   numeric,
  saldo          numeric,
  n_evoluciones  bigint,
  n_estudios     bigint,
  n_medicacion   bigint,
  tipo           text,
  direccion      text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select i.id, i.mascota_id, m.nombre, m.especie, i.orden_id,
         p.nombre || ' ' || p.apellido,
         i.motivo, i.diagnostico, i.ubicacion, i.indicaciones,
         i.estado, i.ingreso_en, i.egreso_en, i.motivo_egreso,
         o.total,
         coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         o.total - coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         (select count(*) from public.internacion_evolucion e where e.internacion_id = i.id),
         (select count(*) from public.internacion_estudio  s where s.internacion_id = i.id),
         (select count(*) from public.internacion_medicacion x where x.internacion_id = i.id),
         i.tipo, i.direccion
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.id = p_internacion_id;
end;
$$;

revoke execute on function public.resumen_internacion from public, anon;
grant execute on function public.resumen_internacion to authenticated;

drop function if exists public.internaciones_activas();

create function public.internaciones_activas(p_tipo text default null)
returns table (
  id           uuid,
  mascota_id   uuid,
  mascota      text,
  especie      public.especie,
  profesional  text,
  motivo       text,
  ubicacion    text,
  ingreso_en   timestamptz,
  total_cargos numeric,
  total_pagado numeric,
  saldo        numeric,
  tipo         text,
  direccion    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select i.id, i.mascota_id, m.nombre, m.especie,
         p.nombre || ' ' || p.apellido,
         i.motivo, i.ubicacion, i.ingreso_en,
         o.total,
         coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         o.total - coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         i.tipo, i.direccion
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.estado = 'activa'
     and (p_tipo is null or i.tipo = p_tipo)
   order by i.ingreso_en asc;
end;
$$;

revoke execute on function public.internaciones_activas from public, anon;
grant execute on function public.internaciones_activas to authenticated;

drop function if exists public.internaciones_con_saldo();

create function public.internaciones_con_saldo(p_tipo text default null)
returns table (
  id           uuid,
  mascota_id   uuid,
  mascota      text,
  especie      public.especie,
  profesional  text,
  egreso_en    timestamptz,
  total_cargos numeric,
  total_pagado numeric,
  saldo        numeric,
  tipo         text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select i.id, i.mascota_id, m.nombre, m.especie,
         p.nombre || ' ' || p.apellido,
         i.egreso_en,
         o.total,
         coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         o.total - coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0),
         i.tipo
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.estado = 'cerrada'
     and (p_tipo is null or i.tipo = p_tipo)
     and o.total - coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0) > 0
   order by i.egreso_en desc;
end;
$$;

revoke execute on function public.internaciones_con_saldo from public, anon;
grant execute on function public.internaciones_con_saldo to authenticated;
