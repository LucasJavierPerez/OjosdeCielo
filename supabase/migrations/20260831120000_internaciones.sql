-- Internación (hospitalización) en el panel de la clínica.
--
-- La veterinaria interna pacientes (post-quirúrgicos, cuadros en observación) y
-- no había dónde registrarlo. Por cada internado se lleva: motivo y diagnóstico,
-- partes de evolución, estudios (sangre, bioquímica, orina…), medicación
-- suministrada, y todos los cargos que eso genera.
--
-- Decisión de arquitectura: para lo económico, una internación es una ORDEN de
-- venta que crece durante la estadía. En lugar de un circuito de caja paralelo,
-- cada cargo es un `orden_item` de una orden en estado `borrador`, cada cobro
-- parcial es un `pago` contra esa orden, y el saldo se deriva
-- (`orden.total − Σ pagos aprobados`). Al alta puede quedar saldo pendiente.
--
-- Único costo: `orden_item.producto_id` pasa a ser nullable para admitir líneas
-- de servicio sin producto de inventario. `vender_mostrador` siempre manda
-- productos, así que no se ve afectado.
--
-- Alcance v1: sólo panel. La lectura es del personal de la clínica; la carga
-- clínica (encabezado, evolución, estudios, medicación) es exclusiva del
-- veterinario; los cargos y cobros los maneja cualquiera del personal.

-- ---------------------------------------------------------------------------
-- Facturación: líneas de servicio sin producto
-- ---------------------------------------------------------------------------

alter table public.orden_item alter column producto_id drop not null;

alter table public.orden_item
  add constraint orden_item_producto_o_descripcion
  check (producto_id is not null or length(trim(descripcion)) > 0);

comment on column public.orden_item.producto_id is
  'Nullable: una línea de internación (día, estudio, procedimiento) es un '
  'servicio sin producto de inventario. Las ventas de mostrador siempre lo traen.';

-- ---------------------------------------------------------------------------
-- Internación
-- ---------------------------------------------------------------------------

create type public.internacion_estado as enum ('activa', 'cerrada');

create table public.internacion (
  id             uuid primary key default gen_random_uuid(),
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  profesional_id uuid not null default auth.uid() references public.perfil(id),
  orden_id       uuid not null references public.orden(id),
  motivo         text not null check (length(trim(motivo)) > 0),
  diagnostico    text,
  ubicacion      text,
  indicaciones   text,
  estado         public.internacion_estado not null default 'activa',
  ingreso_en     timestamptz not null default now(),
  egreso_en      timestamptz,
  motivo_egreso  text,
  archivado_en   timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

-- Una sola internación activa por mascota: no tiene sentido internar dos veces
-- en paralelo, y ambigüaría a qué internación va cada cargo.
create unique index internacion_una_activa_por_mascota
  on public.internacion (mascota_id)
  where estado = 'activa';

create index internacion_mascota_idx on public.internacion (mascota_id, ingreso_en desc);
create index internacion_estado_idx on public.internacion (estado);
create index internacion_orden_idx on public.internacion (orden_id);

create trigger internacion_actualizado_en
  before update on public.internacion
  for each row execute function public.set_actualizado_en();

create trigger internacion_auditoria
  after insert or update or delete on public.internacion
  for each row execute function public.registrar_auditoria();

alter table public.internacion enable row level security;
grant select on public.internacion to authenticated;

create policy "personal ve las internaciones"
  on public.internacion for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Evolución: partes de seguimiento. Append-only, como la historia clínica.
-- ---------------------------------------------------------------------------

create table public.internacion_evolucion (
  id             uuid primary key default gen_random_uuid(),
  internacion_id uuid not null references public.internacion(id) on delete cascade,
  profesional_id uuid not null default auth.uid() references public.perfil(id),
  fecha          timestamptz not null default now(),
  nota           text not null check (length(trim(nota)) > 0),
  temperatura    numeric(4,1) check (temperatura is null or (temperatura > 20 and temperatura < 50)),
  creado_en      timestamptz not null default now()
);

create index internacion_evolucion_idx
  on public.internacion_evolucion (internacion_id, fecha desc);

create or replace function public.internacion_evolucion_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un parte de evolución no se edita ni se borra. Cargá uno nuevo.'
    using errcode = '42501';
end;
$$;

create trigger internacion_evolucion_sin_update
  before update on public.internacion_evolucion
  for each row execute function public.internacion_evolucion_inmutable();

create trigger internacion_evolucion_sin_delete
  before delete on public.internacion_evolucion
  for each row execute function public.internacion_evolucion_inmutable();

alter table public.internacion_evolucion enable row level security;
grant select on public.internacion_evolucion to authenticated;

create policy "personal ve la evolución"
  on public.internacion_evolucion for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Estudios: sangre, bioquímica, orina, etc. El resultado se carga después.
-- ---------------------------------------------------------------------------

create table public.internacion_estudio (
  id             uuid primary key default gen_random_uuid(),
  internacion_id uuid not null references public.internacion(id) on delete cascade,
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  solicitado_por uuid not null default auth.uid() references public.perfil(id),
  tipo           text not null check (length(trim(tipo)) > 0),
  resultado      text,
  fecha          timestamptz not null default now(),
  orden_item_id  uuid references public.orden_item(id) on delete set null,
  creado_en      timestamptz not null default now()
);

create index internacion_estudio_idx
  on public.internacion_estudio (internacion_id, fecha desc);

alter table public.internacion_estudio enable row level security;
grant select on public.internacion_estudio to authenticated;

create policy "personal ve los estudios de internación"
  on public.internacion_estudio for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Medicación suministrada durante la internación
-- ---------------------------------------------------------------------------

create table public.internacion_medicacion (
  id              uuid primary key default gen_random_uuid(),
  internacion_id  uuid not null references public.internacion(id) on delete cascade,
  administrado_por uuid not null default auth.uid() references public.perfil(id),
  descripcion     text not null check (length(trim(descripcion)) > 0),
  dosis           text,
  via             text,
  fecha           timestamptz not null default now(),
  producto_id     uuid references public.producto(id),
  cantidad        integer check (cantidad is null or cantidad > 0),
  orden_item_id   uuid references public.orden_item(id) on delete set null,
  creado_en       timestamptz not null default now()
);

create index internacion_medicacion_idx
  on public.internacion_medicacion (internacion_id, fecha desc);

alter table public.internacion_medicacion enable row level security;
grant select on public.internacion_medicacion to authenticated;

create policy "personal ve la medicación de internación"
  on public.internacion_medicacion for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Adjuntos de estudios: reuso de `adjunto` y del bucket privado `estudios`.
--
-- Convención de path: {mascota_id}/internacion/{internacion_id}/{archivo}.
-- `mascota_id_del_path()` sigue tomando el primer segmento, así que las
-- políticas de storage ya existentes cubren el caso sin cambios.
-- ---------------------------------------------------------------------------

alter table public.adjunto alter column consulta_id drop not null;

alter table public.adjunto
  add column internacion_id uuid references public.internacion(id) on delete cascade;

alter table public.adjunto
  add constraint adjunto_consulta_o_internacion
  check (consulta_id is not null or internacion_id is not null);

create index adjunto_internacion_idx on public.adjunto (internacion_id)
  where internacion_id is not null;

-- ---------------------------------------------------------------------------
-- Helper interno: agrega una línea a la orden de la internación y recalcula el
-- total. No se expone a nadie — sólo lo llaman los RPC de abajo.
-- ---------------------------------------------------------------------------

create or replace function public._internacion_agregar_item(
  p_orden_id  uuid,
  p_concepto  text,
  p_monto     numeric,
  p_cantidad  integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad del cargo tiene que ser mayor a cero' using errcode = '22023';
  end if;
  if p_monto < 0 then
    raise exception 'El monto del cargo no puede ser negativo' using errcode = '22023';
  end if;

  insert into public.orden_item (orden_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
  values (p_orden_id, null, trim(p_concepto), p_cantidad, p_monto, p_monto * p_cantidad)
  returning id into v_id;

  update public.orden
     set total = coalesce((select sum(subtotal) from public.orden_item where orden_id = p_orden_id), 0)
   where id = p_orden_id;

  return v_id;
end;
$$;

revoke execute on function public._internacion_agregar_item from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Alta de internación
-- ---------------------------------------------------------------------------

create or replace function public.crear_internacion(
  p_mascota_id   uuid,
  p_motivo       text,
  p_diagnostico  text default null,
  p_ubicacion    text default null,
  p_indicaciones text default null
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
begin
  if not public.es_veterinario() then
    raise exception 'Internar un paciente es un acto clínico: lo hace el veterinario.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'La internación necesita un motivo' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.internacion
     where mascota_id = p_mascota_id and estado = 'activa'
  ) then
    raise exception 'Este paciente ya tiene una internación activa' using errcode = '22023';
  end if;

  -- El titular con cuenta, si lo hay: así la orden queda asociada al cliente y
  -- la ve en la app. Si el dueño todavía no se registró, queda sin cliente.
  select perfil_id into v_cliente_id
    from public.mascota_tutor
   where mascota_id = p_mascota_id and rol = 'titular' and revocado_en is null
   limit 1;

  insert into public.orden (cliente_id, canal, estado, total, notas)
  values (v_cliente_id, 'mostrador', 'borrador', 0, 'Internación')
  returning id into v_orden_id;

  insert into public.internacion (mascota_id, orden_id, motivo, diagnostico, ubicacion, indicaciones)
  values (
    p_mascota_id,
    v_orden_id,
    trim(p_motivo),
    nullif(trim(coalesce(p_diagnostico, '')), ''),
    nullif(trim(coalesce(p_ubicacion, '')), ''),
    nullif(trim(coalesce(p_indicaciones, '')), '')
  )
  returning * into v_internacion;

  return v_internacion;
end;
$$;

revoke execute on function public.crear_internacion from public, anon;
grant execute on function public.crear_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Editar el encabezado clínico (sólo mientras está activa)
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_internacion(
  p_id           uuid,
  p_diagnostico  text default null,
  p_ubicacion    text default null,
  p_indicaciones text default null
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
    raise exception 'Editar la internación es un acto clínico' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;

  update public.internacion
     set diagnostico  = nullif(trim(coalesce(p_diagnostico, '')), ''),
         ubicacion    = nullif(trim(coalesce(p_ubicacion, '')), ''),
         indicaciones = nullif(trim(coalesce(p_indicaciones, '')), '')
   where id = p_id
  returning * into v_internacion;

  return v_internacion;
end;
$$;

revoke execute on function public.actualizar_internacion from public, anon;
grant execute on function public.actualizar_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Parte de evolución
-- ---------------------------------------------------------------------------

create or replace function public.registrar_evolucion_internacion(
  p_internacion_id uuid,
  p_nota           text,
  p_temperatura    numeric default null
)
returns public.internacion_evolucion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evolucion public.internacion_evolucion;
  v_estado    public.internacion_estado;
begin
  if not public.es_veterinario() then
    raise exception 'Un parte de evolución lo carga el veterinario' using errcode = '42501';
  end if;

  select estado into v_estado from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_nota, ''))) = 0 then
    raise exception 'El parte necesita una nota' using errcode = '22023';
  end if;

  insert into public.internacion_evolucion (internacion_id, nota, temperatura)
  values (p_internacion_id, trim(p_nota), p_temperatura)
  returning * into v_evolucion;

  return v_evolucion;
end;
$$;

revoke execute on function public.registrar_evolucion_internacion from public, anon;
grant execute on function public.registrar_evolucion_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Estudio + su cargo opcional
-- ---------------------------------------------------------------------------

create or replace function public.registrar_estudio_internacion(
  p_internacion_id uuid,
  p_tipo           text,
  p_resultado      text default null,
  p_cargo_concepto text default null,
  p_cargo_monto    numeric default null
)
returns public.internacion_estudio
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estudio     public.internacion_estudio;
  v_internacion public.internacion;
  v_item_id     uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Pedir un estudio es un acto clínico' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_tipo, ''))) = 0 then
    raise exception 'El estudio necesita un tipo' using errcode = '22023';
  end if;

  if p_cargo_monto is not null and p_cargo_monto > 0 then
    v_item_id := public._internacion_agregar_item(
      v_internacion.orden_id,
      coalesce(nullif(trim(coalesce(p_cargo_concepto, '')), ''), 'Estudio: ' || trim(p_tipo)),
      p_cargo_monto,
      1
    );
  end if;

  insert into public.internacion_estudio
    (internacion_id, mascota_id, tipo, resultado, orden_item_id)
  values (
    p_internacion_id,
    v_internacion.mascota_id,
    trim(p_tipo),
    nullif(trim(coalesce(p_resultado, '')), ''),
    v_item_id
  )
  returning * into v_estudio;

  return v_estudio;
end;
$$;

revoke execute on function public.registrar_estudio_internacion from public, anon;
grant execute on function public.registrar_estudio_internacion to authenticated;

create or replace function public.actualizar_resultado_estudio(
  p_estudio_id uuid,
  p_resultado  text
)
returns public.internacion_estudio
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estudio public.internacion_estudio;
  v_estado  public.internacion_estado;
begin
  if not public.es_veterinario() then
    raise exception 'Cargar el resultado de un estudio es un acto clínico' using errcode = '42501';
  end if;

  select i.estado into v_estado
    from public.internacion_estudio e
    join public.internacion i on i.id = e.internacion_id
   where e.id = p_estudio_id;
  if not found then
    raise exception 'No encontramos ese estudio' using errcode = 'P0002';
  end if;
  if v_estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;

  update public.internacion_estudio
     set resultado = nullif(trim(coalesce(p_resultado, '')), '')
   where id = p_estudio_id
  returning * into v_estudio;

  return v_estudio;
end;
$$;

revoke execute on function public.actualizar_resultado_estudio from public, anon;
grant execute on function public.actualizar_resultado_estudio to authenticated;

-- ---------------------------------------------------------------------------
-- Medicación suministrada + descuento de stock + cargo, todo en una transacción
-- ---------------------------------------------------------------------------

create or replace function public.registrar_medicacion_internacion(
  p_internacion_id uuid,
  p_descripcion    text,
  p_dosis          text default null,
  p_via            text default null,
  p_producto_id    uuid default null,
  p_unidades       integer default null,
  p_cargo_concepto text default null,
  p_cargo_monto    numeric default null
)
returns public.internacion_medicacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_medicacion  public.internacion_medicacion;
  v_internacion public.internacion;
  v_item_id     uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Administrar medicación es un acto clínico' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_descripcion, ''))) = 0 then
    raise exception 'La medicación necesita un nombre' using errcode = '22023';
  end if;

  -- Sale del stock de la clínica: se descuenta como uso clínico. registrar_movimiento
  -- serializa contra el producto y rechaza dejar el stock en negativo.
  if p_producto_id is not null and p_unidades is not null and p_unidades > 0 then
    perform public.registrar_movimiento(
      p_producto_id, 'uso_clinico', -p_unidades, null,
      'Uso en internación', v_internacion.mascota_id, null
    );
  end if;

  if p_cargo_monto is not null and p_cargo_monto > 0 then
    v_item_id := public._internacion_agregar_item(
      v_internacion.orden_id,
      coalesce(nullif(trim(coalesce(p_cargo_concepto, '')), ''), 'Medicación: ' || trim(p_descripcion)),
      p_cargo_monto,
      1
    );
  end if;

  insert into public.internacion_medicacion
    (internacion_id, descripcion, dosis, via, producto_id, cantidad, orden_item_id)
  values (
    p_internacion_id,
    trim(p_descripcion),
    nullif(trim(coalesce(p_dosis, '')), ''),
    nullif(trim(coalesce(p_via, '')), ''),
    p_producto_id,
    p_unidades,
    v_item_id
  )
  returning * into v_medicacion;

  return v_medicacion;
end;
$$;

revoke execute on function public.registrar_medicacion_internacion from public, anon;
grant execute on function public.registrar_medicacion_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Cargo manual (día de internación, procedimiento, insumo suelto)
-- ---------------------------------------------------------------------------

create or replace function public.agregar_cargo_internacion(
  p_internacion_id uuid,
  p_concepto       text,
  p_monto          numeric,
  p_cantidad       integer default 1
)
returns public.orden_item
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item        public.orden_item;
  v_internacion public.internacion;
  v_item_id     uuid;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal carga cargos' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'La internación ya está cerrada: no se agregan cargos.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_concepto, ''))) = 0 then
    raise exception 'El cargo necesita un concepto' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del cargo tiene que ser mayor a cero' using errcode = '22023';
  end if;

  v_item_id := public._internacion_agregar_item(
    v_internacion.orden_id, trim(p_concepto), p_monto, coalesce(p_cantidad, 1)
  );

  select * into v_item from public.orden_item where id = v_item_id;
  return v_item;
end;
$$;

revoke execute on function public.agregar_cargo_internacion from public, anon;
grant execute on function public.agregar_cargo_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Cobro parcial. Se puede registrar durante la internación y también después
-- de cerrada mientras quede saldo.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_pago_internacion(
  p_internacion_id uuid,
  p_monto          numeric,
  p_medio          public.medio_pago
)
returns public.pago
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internacion public.internacion;
  v_pago        public.pago;
  v_caja        public.turno_caja;
  v_total       numeric(12,2);
  v_pagado      numeric(12,2);
  v_saldo       numeric(12,2);
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal registra cobros' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago tiene que ser mayor a cero' using errcode = '22023';
  end if;

  select o.total,
         coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0)
    into v_total, v_pagado
    from public.orden o
   where o.id = v_internacion.orden_id;

  v_saldo := v_total - v_pagado;
  if p_monto > v_saldo + 0.005 then
    raise exception 'El pago ($%) supera el saldo pendiente ($%)', p_monto, v_saldo
      using errcode = '22023';
  end if;

  -- La cuenta corriente no toca la caja: queda como deuda del cliente.
  if p_medio <> 'cuenta_corriente' then
    select * into v_caja from public.turno_caja where cerrado_en is null;
    if not found then
      raise exception 'Abrí la caja antes de cobrar' using errcode = '22023';
    end if;
  end if;

  insert into public.pago (orden_id, monto, medio, estado, confirmado_en)
  values (v_internacion.orden_id, p_monto, p_medio, 'aprobado', now())
  returning * into v_pago;

  if p_medio <> 'cuenta_corriente' then
    insert into public.movimiento_caja (turno_caja_id, tipo, monto, medio, concepto, pago_id)
    values (v_caja.id, 'ingreso', p_monto, p_medio, 'Cobro de internación', v_pago.id);
  end if;

  return v_pago;
end;
$$;

revoke execute on function public.registrar_pago_internacion from public, anon;
grant execute on function public.registrar_pago_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Alta / cierre de la internación
-- ---------------------------------------------------------------------------

create or replace function public.cerrar_internacion(
  p_internacion_id uuid,
  p_motivo_egreso  text default null
)
returns table (total numeric, pagado numeric, saldo numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internacion public.internacion;
  v_total       numeric(12,2);
  v_pagado      numeric(12,2);
  v_saldo       numeric(12,2);
  v_numero      bigint;
begin
  if not public.es_veterinario() then
    raise exception 'Dar el alta es un acto clínico' using errcode = '42501';
  end if;

  select * into v_internacion from public.internacion where id = p_internacion_id;
  if not found then
    raise exception 'No encontramos esa internación' using errcode = 'P0002';
  end if;
  if v_internacion.estado <> 'activa' then
    raise exception 'La internación ya está cerrada' using errcode = '22023';
  end if;

  select o.total,
         coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0)
    into v_total, v_pagado
    from public.orden o
   where o.id = v_internacion.orden_id;

  v_saldo := v_total - v_pagado;

  update public.internacion
     set estado = 'cerrada',
         egreso_en = now(),
         motivo_egreso = nullif(trim(coalesce(p_motivo_egreso, '')), '')
   where id = p_internacion_id;

  update public.orden
     set estado = case when v_saldo <= 0 then 'pagada'::public.estado_orden
                       else 'pendiente_pago'::public.estado_orden end
   where id = v_internacion.orden_id;

  -- Comprobante interno correlativo, igual que en vender_mostrador. Sólo si
  -- hubo cargos: una internación sin movimientos no emite comprobante.
  if v_total > 0 then
    select coalesce(max(numero), 0) + 1 into v_numero
      from public.comprobante where punto_venta = 1 and tipo_comprobante = 'interno';

    insert into public.comprobante (orden_id, numero, total)
    values (v_internacion.orden_id, v_numero, v_total);
  end if;

  return query select v_total, v_pagado, v_saldo;
end;
$$;

revoke execute on function public.cerrar_internacion from public, anon;
grant execute on function public.cerrar_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- Lecturas para las pantallas
-- ---------------------------------------------------------------------------

create or replace function public.resumen_internacion(p_internacion_id uuid)
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
  n_medicacion   bigint
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
         (select count(*) from public.internacion_medicacion x where x.internacion_id = i.id)
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.id = p_internacion_id;
end;
$$;

revoke execute on function public.resumen_internacion from public, anon;
grant execute on function public.resumen_internacion to authenticated;

create or replace function public.internaciones_activas()
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
  saldo        numeric
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
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0)
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.estado = 'activa'
   order by i.ingreso_en asc;
end;
$$;

revoke execute on function public.internaciones_activas from public, anon;
grant execute on function public.internaciones_activas to authenticated;

create or replace function public.internaciones_con_saldo()
returns table (
  id           uuid,
  mascota_id   uuid,
  mascota      text,
  especie      public.especie,
  profesional  text,
  egreso_en    timestamptz,
  total_cargos numeric,
  total_pagado numeric,
  saldo        numeric
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
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0)
    from public.internacion i
    join public.mascota m on m.id = i.mascota_id
    join public.perfil  p on p.id = i.profesional_id
    join public.orden   o on o.id = i.orden_id
   where i.estado = 'cerrada'
     and o.total - coalesce((select sum(pg.monto) from public.pago pg
                    where pg.orden_id = o.id and pg.estado = 'aprobado'), 0) > 0
   order by i.egreso_en desc;
end;
$$;

revoke execute on function public.internaciones_con_saldo from public, anon;
grant execute on function public.internaciones_con_saldo to authenticated;
