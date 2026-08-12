-- Recetario digital (fase 8).
--
-- Una receta es un acto profesional: la firma un veterinario, vale para una
-- mascota concreta y tiene fecha de vencimiento. Igual que la consulta, no se
-- edita — si hay un error se anula y se emite otra.
--
-- Sobre "firmada": no hay firma digital con certificado. Eso lo tramita el
-- profesional ante su colegio, no la aplicación. Lo que sí hay es un código de
-- verificación público: la farmacia o el agropecuario entran a una página,
-- ponen el código y ven quién la emitió, para qué mascota, qué contiene y si
-- sigue vigente. Contra el riesgo real —una receta fotocopiada, adulterada o
-- vencida— eso sirve; una firma criptográfica que nadie sabe validar, no.

create type public.estado_receta as enum ('vigente', 'dispensada', 'anulada');

create table public.receta (
  id               uuid primary key default gen_random_uuid(),
  mascota_id       uuid not null references public.mascota(id) on delete cascade,
  profesional_id   uuid not null default auth.uid() references public.perfil(id),
  consulta_id      uuid references public.consulta(id),
  emitida_en       timestamptz not null default now(),
  vence_el         date not null,
  diagnostico      text,
  indicaciones     text,
  codigo           text not null unique default upper(encode(gen_random_bytes(6), 'hex')),
  estado           public.estado_receta not null default 'vigente',
  dispensada_en    timestamptz,
  anulada_en       timestamptz,
  motivo_anulacion text,
  creado_en        timestamptz not null default now(),

  constraint receta_vence_despues_de_emitida check (vence_el >= emitida_en::date),
  constraint receta_anulada_con_motivo check (
    (estado = 'anulada') = (anulada_en is not null)
    and (anulada_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
  )
);

create index receta_mascota_idx on public.receta (mascota_id, emitida_en desc);
create index receta_profesional_idx on public.receta (profesional_id, emitida_en desc);

comment on column public.receta.codigo is
  'Aleatorio de 12 caracteres, no correlativo: un número de receta secuencial '
  'permitiría enumerar el recetario entero desde la página pública.';

comment on column public.receta.vence_el is
  'DATE, no timestamptz: "vence el 30 de septiembre" es una fecha civil. '
  'Convertirla a zona horaria la corre un día (ver AGENTS.md, regla 10).';

create table public.receta_item (
  id          uuid primary key default gen_random_uuid(),
  receta_id   uuid not null references public.receta(id) on delete cascade,
  producto_id uuid references public.producto(id),
  descripcion text not null check (length(trim(descripcion)) > 0),
  cantidad    text not null check (length(trim(cantidad)) > 0),
  dosis       text not null check (length(trim(dosis)) > 0),
  duracion    text,
  cronico     boolean not null default false,
  orden       smallint not null default 0
);

create index receta_item_receta_idx on public.receta_item (receta_id, orden);

comment on column public.receta_item.descripcion is
  'Texto congelado al emitir. No se lee de producto: si mañana la clínica '
  'renombra o archiva el producto, la receta ya impresa tiene que seguir '
  'diciendo lo mismo.';

comment on column public.receta_item.producto_id is
  'Opcional. Un veterinario receta drogas que la clínica puede no vender.';

comment on column public.receta_item.cronico is
  'Habilita al tutor a pedir reposición sin volver a la consulta.';

-- ---------------------------------------------------------------------------
-- Inmutabilidad
--
-- La receta admite exactamente dos cambios de estado (dispensada, anulada) y
-- nada más. Los items no cambian nunca.
-- ---------------------------------------------------------------------------

create or replace function public.receta_solo_cambia_estado()
returns trigger
language plpgsql
as $$
begin
  if row(new.mascota_id, new.profesional_id, new.consulta_id, new.emitida_en,
         new.vence_el, new.diagnostico, new.indicaciones, new.codigo)
     is distinct from
     row(old.mascota_id, old.profesional_id, old.consulta_id, old.emitida_en,
         old.vence_el, old.diagnostico, old.indicaciones, old.codigo) then
    raise exception 'Una receta emitida no se edita. Anulala y emití una nueva.'
      using errcode = '42501';
  end if;

  if old.estado <> 'vigente' and new.estado <> old.estado then
    raise exception 'La receta ya está %, no se puede cambiar de nuevo.', old.estado
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.receta_no_se_borra()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Una receta emitida no se borra. Anulala, queda el registro.'
    using errcode = '42501';
end;
$$;

create trigger receta_cambios_acotados
  before update on public.receta
  for each row execute function public.receta_solo_cambia_estado();

create trigger receta_sin_delete
  before delete on public.receta
  for each row execute function public.receta_no_se_borra();

create trigger receta_item_sin_update
  before update on public.receta_item
  for each row execute function public.receta_no_se_borra();

create trigger receta_auditoria
  after insert or update on public.receta
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.receta enable row level security;
alter table public.receta_item enable row level security;

grant select on public.receta to authenticated;
grant select on public.receta_item to authenticated;

-- La escritura pasa toda por RPC: emitir una receta toca dos tablas y hay que
-- garantizar que los items no queden huérfanos si algo falla.

create policy "tutores y personal leen las recetas de la mascota"
  on public.receta for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

create policy "los items siguen a la receta"
  on public.receta_item for select
  to authenticated
  using (
    exists (
      select 1 from public.receta r
       where r.id = receta_id
         and (public.es_tutor_de(r.mascota_id) or public.es_personal_clinica())
    )
  );

-- ---------------------------------------------------------------------------
-- Emitir
-- ---------------------------------------------------------------------------

create or replace function public.emitir_receta(
  p_mascota_id   uuid,
  p_vence_el     date,
  p_items        jsonb,
  p_diagnostico  text default null,
  p_indicaciones text default null,
  p_consulta_id  uuid default null
)
returns public.receta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receta public.receta;
  v_item   jsonb;
  v_orden  smallint := 0;
begin
  if not public.es_veterinario() then
    raise exception 'Sólo un veterinario emite recetas.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La receta necesita al menos un medicamento.' using errcode = '22023';
  end if;

  if p_consulta_id is not null and not exists (
    select 1 from public.consulta c
     where c.id = p_consulta_id and c.mascota_id = p_mascota_id
  ) then
    raise exception 'Esa consulta no es de esta mascota.' using errcode = '22023';
  end if;

  insert into public.receta (
    mascota_id, profesional_id, consulta_id, vence_el, diagnostico, indicaciones
  )
  values (
    p_mascota_id, auth.uid(), p_consulta_id, p_vence_el,
    nullif(trim(coalesce(p_diagnostico, '')), ''),
    nullif(trim(coalesce(p_indicaciones, '')), '')
  )
  returning * into v_receta;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.receta_item (
      receta_id, producto_id, descripcion, cantidad, dosis, duracion, cronico, orden
    )
    values (
      v_receta.id,
      nullif(v_item ->> 'producto_id', '')::uuid,
      v_item ->> 'descripcion',
      v_item ->> 'cantidad',
      v_item ->> 'dosis',
      nullif(trim(coalesce(v_item ->> 'duracion', '')), ''),
      coalesce((v_item ->> 'cronico')::boolean, false),
      v_orden
    );
    v_orden := v_orden + 1;
  end loop;

  return v_receta;
end;
$$;

revoke execute on function public.emitir_receta from public, anon;
grant execute on function public.emitir_receta to authenticated;

-- ---------------------------------------------------------------------------
-- Anular y dispensar
-- ---------------------------------------------------------------------------

create or replace function public.anular_receta(p_receta_id uuid, p_motivo text)
returns public.receta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receta public.receta;
begin
  if not public.es_veterinario() then
    raise exception 'Sólo un veterinario anula una receta.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Anular una receta necesita un motivo.' using errcode = '22023';
  end if;

  update public.receta
     set estado = 'anulada', anulada_en = now(), motivo_anulacion = trim(p_motivo)
   where id = p_receta_id
  returning * into v_receta;

  if v_receta.id is null then
    raise exception 'No encontramos esa receta.' using errcode = 'P0002';
  end if;

  return v_receta;
end;
$$;

revoke execute on function public.anular_receta from public, anon;
grant execute on function public.anular_receta to authenticated;

-- Marcar dispensada la puede hacer cualquiera del mostrador: es un hecho
-- administrativo (se entregó el medicamento), no un acto clínico.
create or replace function public.marcar_receta_dispensada(p_receta_id uuid)
returns public.receta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receta public.receta;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal de la clínica marca una receta como dispensada.'
      using errcode = '42501';
  end if;

  update public.receta
     set estado = 'dispensada', dispensada_en = now()
   where id = p_receta_id
  returning * into v_receta;

  if v_receta.id is null then
    raise exception 'No encontramos esa receta.' using errcode = 'P0002';
  end if;

  return v_receta;
end;
$$;

revoke execute on function public.marcar_receta_dispensada from public, anon;
grant execute on function public.marcar_receta_dispensada to authenticated;

-- ---------------------------------------------------------------------------
-- Verificación pública
--
-- Segundo y último punto del sistema abierto a alguien sin cuenta, después del
-- QR de extravío. Quien tiene el código ya tiene la receta en la mano: lo que
-- devuelve acá es lo mismo que está impreso, para poder contrastarlo. Nada del
-- tutor — ni nombre, ni teléfono, ni que exista.
-- ---------------------------------------------------------------------------

create or replace function public.verificar_receta(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'codigo',         r.codigo,
    'estado',         r.estado,
    'vencida',        r.vence_el < current_date,
    'emitida_en',     r.emitida_en,
    'vence_el',       r.vence_el,
    'diagnostico',    r.diagnostico,
    'indicaciones',   r.indicaciones,
    'motivo_anulacion', r.motivo_anulacion,
    'mascota',        m.nombre,
    'especie',        m.especie,
    'profesional',    p.nombre || ' ' || p.apellido,
    'matricula',      pr.matricula,
    'clinica',        c.nombre,
    'clinica_telefono', c.telefono,
    'items', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'descripcion', i.descripcion,
                  'cantidad',    i.cantidad,
                  'dosis',       i.dosis,
                  'duracion',    i.duracion
                ) order by i.orden)
         from public.receta_item i where i.receta_id = r.id),
      '[]'::jsonb)
  )
    from public.receta r
    join public.mascota m on m.id = r.mascota_id
    join public.perfil p on p.id = r.profesional_id
    left join public.profesional pr on pr.perfil_id = p.id
    cross join public.configuracion_clinica c
   where upper(trim(r.codigo)) = upper(trim(p_codigo));
$$;

grant execute on function public.verificar_receta to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datos para imprimir
--
-- El PDF lo arma el navegador, pero los datos que van en el encabezado —
-- matrícula del profesional, domicilio de la clínica— viven en tablas que el
-- cliente no puede leer. Misma razón que profesionales_disponibles().
-- ---------------------------------------------------------------------------

create or replace function public.receta_para_imprimir(p_receta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  select mascota_id into v_mascota from public.receta where id = p_receta_id;

  if v_mascota is null then
    raise exception 'No encontramos esa receta.' using errcode = 'P0002';
  end if;

  if not public.es_tutor_de(v_mascota) and not public.es_personal_clinica() then
    raise exception 'No tenés acceso a esta receta.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id',             r.id,
      'codigo',         r.codigo,
      'estado',         r.estado,
      'vencida',        r.vence_el < current_date,
      'emitida_en',     r.emitida_en,
      'vence_el',       r.vence_el,
      'diagnostico',    r.diagnostico,
      'indicaciones',   r.indicaciones,
      'mascota',        m.nombre,
      'especie',        m.especie,
      'raza',           m.raza,
      'sexo',           m.sexo,
      'fecha_nacimiento', m.fecha_nacimiento,
      'profesional',    p.nombre || ' ' || p.apellido,
      'matricula',      pr.matricula,
      'clinica',        jsonb_build_object(
        'nombre',    c.nombre,
        'direccion', c.direccion,
        'localidad', c.localidad,
        'telefono',  c.telefono,
        'email',     c.email
      ),
      'items', coalesce(
        (select jsonb_agg(
                  jsonb_build_object(
                    'descripcion', i.descripcion,
                    'cantidad',    i.cantidad,
                    'dosis',       i.dosis,
                    'duracion',    i.duracion,
                    'cronico',     i.cronico
                  ) order by i.orden)
           from public.receta_item i where i.receta_id = r.id),
        '[]'::jsonb)
    )
      from public.receta r
      join public.mascota m on m.id = r.mascota_id
      join public.perfil p on p.id = r.profesional_id
      left join public.profesional pr on pr.perfil_id = p.id
      cross join public.configuracion_clinica c
     where r.id = p_receta_id
  );
end;
$$;

revoke execute on function public.receta_para_imprimir from public, anon;
grant execute on function public.receta_para_imprimir to authenticated;

-- ---------------------------------------------------------------------------
-- Reposición de medicación crónica
--
-- El tutor de un paciente crónico no debería tener que sacar turno cada mes
-- para que le renueven la misma receta. Pide desde la app; un veterinario
-- decide. Nunca se renueva sola: sigue siendo un acto profesional.
-- ---------------------------------------------------------------------------

create type public.estado_solicitud_receta as enum ('pendiente', 'aprobada', 'rechazada');

create table public.solicitud_reposicion (
  id             uuid primary key default gen_random_uuid(),
  receta_item_id uuid not null references public.receta_item(id) on delete cascade,
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  solicitado_por uuid not null default auth.uid() references public.perfil(id),
  solicitado_en  timestamptz not null default now(),
  estado         public.estado_solicitud_receta not null default 'pendiente',
  nota_tutor     text,
  resuelto_por   uuid references public.perfil(id),
  resuelto_en    timestamptz,
  nota_respuesta text,
  receta_nueva_id uuid references public.receta(id)
);

create index solicitud_reposicion_pendientes_idx
  on public.solicitud_reposicion (solicitado_en) where estado = 'pendiente';
create index solicitud_reposicion_mascota_idx
  on public.solicitud_reposicion (mascota_id, solicitado_en desc);

-- Una sola solicitud pendiente por medicamento: si no, el tutor manda cinco y
-- el veterinario ve cinco.
create unique index solicitud_reposicion_una_pendiente
  on public.solicitud_reposicion (receta_item_id) where estado = 'pendiente';

alter table public.solicitud_reposicion enable row level security;
grant select on public.solicitud_reposicion to authenticated;

create policy "tutores y personal ven las solicitudes de la mascota"
  on public.solicitud_reposicion for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

create or replace function public.solicitar_reposicion(
  p_receta_item_id uuid,
  p_nota           text default null
)
returns public.solicitud_reposicion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota  uuid;
  v_cronico  boolean;
  v_estado   public.estado_receta;
  v_solicitud public.solicitud_reposicion;
begin
  select r.mascota_id, i.cronico, r.estado
    into v_mascota, v_cronico, v_estado
    from public.receta_item i
    join public.receta r on r.id = i.receta_id
   where i.id = p_receta_item_id;

  if v_mascota is null then
    raise exception 'No encontramos ese medicamento.' using errcode = 'P0002';
  end if;

  if not public.es_tutor_de(v_mascota) and not public.es_personal_clinica() then
    raise exception 'No tenés acceso a esta receta.' using errcode = '42501';
  end if;

  if not v_cronico then
    raise exception 'Ese medicamento no es de tratamiento crónico: hace falta una consulta.'
      using errcode = '22023';
  end if;

  if v_estado = 'anulada' then
    raise exception 'Esa receta fue anulada.' using errcode = '22023';
  end if;

  insert into public.solicitud_reposicion (
    receta_item_id, mascota_id, solicitado_por, nota_tutor
  )
  values (
    p_receta_item_id, v_mascota, auth.uid(),
    nullif(trim(coalesce(p_nota, '')), '')
  )
  returning * into v_solicitud;

  return v_solicitud;
exception
  when unique_violation then
    raise exception 'Ya pediste la reposición de este medicamento. Te avisamos cuando la revisen.'
      using errcode = '23505';
end;
$$;

revoke execute on function public.solicitar_reposicion from public, anon;
grant execute on function public.solicitar_reposicion to authenticated;

create or replace function public.resolver_reposicion(
  p_solicitud_id  uuid,
  p_aprobar       boolean,
  p_nota          text default null,
  p_receta_nueva_id uuid default null
)
returns public.solicitud_reposicion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solicitud public.solicitud_reposicion;
begin
  if not public.es_veterinario() then
    raise exception 'Sólo un veterinario resuelve una reposición.' using errcode = '42501';
  end if;

  update public.solicitud_reposicion
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end
                  ::public.estado_solicitud_receta,
         resuelto_por = auth.uid(),
         resuelto_en = now(),
         nota_respuesta = nullif(trim(coalesce(p_nota, '')), ''),
         receta_nueva_id = p_receta_nueva_id
   where id = p_solicitud_id
     and estado = 'pendiente'
  returning * into v_solicitud;

  if v_solicitud.id is null then
    raise exception 'Esa solicitud no existe o ya fue resuelta.' using errcode = 'P0002';
  end if;

  return v_solicitud;
end;
$$;

revoke execute on function public.resolver_reposicion from public, anon;
grant execute on function public.resolver_reposicion to authenticated;

-- Lista para el panel: las pendientes, con lo que el veterinario necesita para
-- decidir sin abrir cinco pantallas.
create or replace function public.reposiciones_pendientes()
returns table (
  id            uuid,
  solicitado_en timestamptz,
  nota_tutor    text,
  mascota_id    uuid,
  mascota       text,
  especie       public.especie,
  medicamento   text,
  dosis         text,
  receta_id     uuid,
  receta_codigo text,
  receta_vence_el date,
  solicitante   text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id,
         s.solicitado_en,
         s.nota_tutor,
         m.id,
         m.nombre,
         m.especie,
         i.descripcion,
         i.dosis,
         r.id,
         r.codigo,
         r.vence_el,
         p.nombre || ' ' || p.apellido
    from public.solicitud_reposicion s
    join public.receta_item i on i.id = s.receta_item_id
    join public.receta r on r.id = i.receta_id
    join public.mascota m on m.id = s.mascota_id
    join public.perfil p on p.id = s.solicitado_por
   where s.estado = 'pendiente'
     and public.es_personal_clinica()
   order by s.solicitado_en;
$$;

revoke execute on function public.reposiciones_pendientes from public, anon;
grant execute on function public.reposiciones_pendientes to authenticated;
