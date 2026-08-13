-- Campañas segmentadas (fase 8).
--
-- El caso que la clínica pidió: "avisale a todos los perros con la antirrábica
-- vencida". La segmentación se resuelve en la base con una sola consulta, no
-- trayendo el padrón al navegador para filtrarlo ahí.
--
-- Dos cosas que no son negociables:
--
-- 1. Se previsualiza antes de mandar. Un push mal segmentado llega a cientos
--    de personas y no se puede deshacer.
-- 2. Respeta preferencia_notificacion del tipo 'campana'. El tutor que
--    silencia lo publicitario sigue recibiendo los recordatorios de su
--    mascota: son cosas distintas, y la ley 25.326 (art. 27) exige poder
--    darse de baja de lo primero.

create type public.estado_campana as enum ('borrador', 'enviando', 'enviada', 'cancelada');

create table public.campana (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(trim(titulo)) between 1 and 80),
  cuerpo        text not null check (length(trim(cuerpo)) between 1 and 300),
  url           text,
  segmento      jsonb not null default '{}'::jsonb,
  estado        public.estado_campana not null default 'borrador',
  destinatarios integer,
  creada_por    uuid not null default auth.uid() references public.perfil(id),
  creada_en     timestamptz not null default now(),
  enviada_en    timestamptz
);

create index campana_estado_idx on public.campana (creada_en desc);

comment on column public.campana.titulo is
  'Máximo 80 caracteres: Android corta el título del push más o menos ahí.';

comment on column public.campana.destinatarios is
  'Se congela al enviar. Recalcularlo después daría otro número —la gente se '
  'vacuna, las mascotas se archivan— y el registro de qué se mandó dejaría de '
  'ser fiel.';

comment on column public.campana.segmento is
  'Criterios: especie, vacuna_vencida_dias, sin_venir_meses, edad_min_meses, '
  'edad_max_meses. Un objeto vacío alcanza a todos los tutores activos.';

-- Un envío por persona y por campaña. La constraint es lo que hace que el job
-- pueda reintentar sin duplicar, igual que en recordatorio.
create table public.campana_envio (
  id          bigserial primary key,
  campana_id  uuid not null references public.campana(id) on delete cascade,
  perfil_id   uuid not null references public.perfil(id) on delete cascade,
  estado      text not null check (estado in ('enviado', 'fallido', 'sin_dispositivo')),
  error       text,
  enviado_en  timestamptz not null default now(),

  constraint campana_envio_unico unique (campana_id, perfil_id)
);

create index campana_envio_campana_idx on public.campana_envio (campana_id);

alter table public.campana enable row level security;
alter table public.campana_envio enable row level security;

grant select on public.campana to authenticated;
grant select on public.campana_envio to authenticated;

create policy "el personal ve las campañas"
  on public.campana for select
  to authenticated
  using (public.es_personal_clinica());

create policy "el personal ve los envíos"
  on public.campana_envio for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- El segmento
--
-- Una sola función resuelve el criterio y la usan las tres: previsualizar,
-- crear y despachar. Si la lógica viviera duplicada, la vista previa podría
-- decir 40 y el envío llegar a 60.
-- ---------------------------------------------------------------------------

create or replace function public.perfiles_del_segmento(p_segmento jsonb)
returns table (
  perfil_id uuid,
  nombre    text,
  apellido  text,
  email     text,
  mascotas  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with criterio as (
    select nullif(p_segmento ->> 'especie', '')::public.especie          as especie,
           nullif(p_segmento ->> 'vacuna_vencida_dias', '')::integer     as vacuna_vencida_dias,
           nullif(p_segmento ->> 'sin_venir_meses', '')::integer         as sin_venir_meses,
           nullif(p_segmento ->> 'edad_min_meses', '')::integer          as edad_min_meses,
           nullif(p_segmento ->> 'edad_max_meses', '')::integer          as edad_max_meses
  ),
  alcanzadas as (
    select m.id, m.nombre
      from public.mascota m, criterio c
     where m.archivado_en is null
       and m.fallecido_en is null
       and (c.especie is null or m.especie = c.especie)
       and (
         c.edad_min_meses is null
         or (m.fecha_nacimiento is not null
             and m.fecha_nacimiento <= current_date - make_interval(months => c.edad_min_meses))
       )
       and (
         c.edad_max_meses is null
         or (m.fecha_nacimiento is not null
             and m.fecha_nacimiento >= current_date - make_interval(months => c.edad_max_meses))
       )
       -- Vacuna vencida hace más de N días. Se mira la última aplicación de
       -- tipo vacuna: una mascota que nunca se vacunó no entra por acá, entra
       -- por sin_venir_meses. Mezclarlas daría un mensaje equivocado.
       and (
         c.vacuna_vencida_dias is null
         or exists (
           select 1 from public.aplicacion a
            where a.mascota_id = m.id
              and a.tipo = 'vacuna'
              and a.proxima_fecha is not null
              and a.proxima_fecha < current_date - make_interval(days => c.vacuna_vencida_dias)
              and not exists (
                select 1 from public.aplicacion a2
                 where a2.mascota_id = m.id
                   and a2.tipo = 'vacuna'
                   and a2.fecha > a.fecha
              )
         )
       )
       and (
         c.sin_venir_meses is null
         or not exists (
           select 1 from public.consulta co
            where co.mascota_id = m.id
              and co.fecha > now() - make_interval(months => c.sin_venir_meses)
         )
       )
  )
  select p.id,
         p.nombre,
         p.apellido,
         p.email,
         string_agg(distinct a.nombre, ', ' order by a.nombre)
    from alcanzadas a
    join public.mascota_tutor mt on mt.mascota_id = a.id and mt.revocado_en is null
    join public.perfil p on p.id = mt.perfil_id
   where p.activo
     and p.archivado_en is null
     and p.rol = 'cliente'
     -- Quien silenció las campañas queda afuera del alcance, no sólo del
     -- envío: el número de la vista previa tiene que ser el real.
     and not exists (
       select 1 from public.preferencia_notificacion pn
        where pn.perfil_id = p.id
          and pn.tipo = 'campana'
          and not pn.habilitado
     )
   group by p.id, p.nombre, p.apellido, p.email;
$$;

revoke execute on function public.perfiles_del_segmento from public, anon;
grant execute on function public.perfiles_del_segmento to authenticated;

-- Vista previa: cuánta gente y quiénes. Se muestra ANTES del botón de enviar.
create or replace function public.previsualizar_campana(p_segmento jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Las campañas son del personal de la clínica.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'muestra', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'nombre', nombre || ' ' || apellido,
                  'mascotas', mascotas))
           from (select * from public.perfiles_del_segmento(p_segmento)
                  order by apellido, nombre limit 10) m),
        '[]'::jsonb)
    )
    from public.perfiles_del_segmento(p_segmento)
  );
end;
$$;

revoke execute on function public.previsualizar_campana from public, anon;
grant execute on function public.previsualizar_campana to authenticated;

-- ---------------------------------------------------------------------------
-- Crear y despachar
-- ---------------------------------------------------------------------------

create or replace function public.crear_campana(
  p_titulo   text,
  p_cuerpo   text,
  p_segmento jsonb default '{}'::jsonb,
  p_url      text default null
)
returns public.campana
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campana public.campana;
begin
  -- Administrador y no todo el personal: un push sale a cientos de personas y
  -- no se puede deshacer. Es una decisión de la clínica, no de un turno.
  if not public.es_administrador() then
    raise exception 'Sólo el administrador crea campañas.' using errcode = '42501';
  end if;

  insert into public.campana (titulo, cuerpo, segmento, url, creada_por)
  values (trim(p_titulo), trim(p_cuerpo), coalesce(p_segmento, '{}'::jsonb),
          nullif(trim(coalesce(p_url, '')), ''), auth.uid())
  returning * into v_campana;

  return v_campana;
end;
$$;

revoke execute on function public.crear_campana from public, anon;
grant execute on function public.crear_campana to authenticated;

-- Marca la campaña como lista para salir y congela a cuánta gente alcanza.
-- El envío lo hace la Edge Function: acá no se pueden abrir conexiones HTTP.
create or replace function public.lanzar_campana(p_campana_id uuid)
returns public.campana
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campana public.campana;
  v_total   integer;
begin
  if not public.es_administrador() then
    raise exception 'Sólo el administrador lanza campañas.' using errcode = '42501';
  end if;

  select * into v_campana from public.campana where id = p_campana_id for update;

  if v_campana.id is null then
    raise exception 'No encontramos esa campaña.' using errcode = 'P0002';
  end if;

  if v_campana.estado <> 'borrador' then
    raise exception 'Esta campaña ya está %.', v_campana.estado using errcode = '22023';
  end if;

  select count(*) into v_total from public.perfiles_del_segmento(v_campana.segmento);

  if v_total = 0 then
    raise exception 'El segmento no alcanza a nadie. Revisá los criterios.'
      using errcode = '22023';
  end if;

  update public.campana
     set estado = 'enviando', destinatarios = v_total, enviada_en = now()
   where id = p_campana_id
  returning * into v_campana;

  return v_campana;
end;
$$;

revoke execute on function public.lanzar_campana from public, anon;
grant execute on function public.lanzar_campana to authenticated;

create or replace function public.cancelar_campana(p_campana_id uuid)
returns public.campana
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campana public.campana;
begin
  if not public.es_administrador() then
    raise exception 'Sólo el administrador cancela campañas.' using errcode = '42501';
  end if;

  update public.campana set estado = 'cancelada'
   where id = p_campana_id and estado = 'borrador'
  returning * into v_campana;

  if v_campana.id is null then
    raise exception 'Sólo se puede cancelar una campaña que todavía no salió.'
      using errcode = '22023';
  end if;

  return v_campana;
end;
$$;

revoke execute on function public.cancelar_campana from public, anon;
grant execute on function public.cancelar_campana to authenticated;

-- Lo que consume la Edge Function con service_role: a quién falta mandarle.
-- Excluye a quien ya recibió, así el job puede reintentar sin duplicar.
create or replace function public.destinatarios_campana(p_campana_id uuid)
returns table (
  perfil_id uuid,
  sub_id    uuid,
  endpoint  text,
  p256dh    text,
  auth_key  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.perfil_id, s.id, s.endpoint, s.p256dh, s.auth
    from public.campana c
    join public.perfiles_del_segmento(c.segmento) d on true
    join public.push_subscription s on s.perfil_id = d.perfil_id
   where c.id = p_campana_id
     and c.estado = 'enviando'
     and not exists (
       select 1 from public.campana_envio e
        where e.campana_id = c.id and e.perfil_id = d.perfil_id
     );
$$;

revoke execute on function public.destinatarios_campana from public, anon, authenticated;
grant execute on function public.destinatarios_campana to service_role;

create or replace function public.cerrar_campana(p_campana_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.campana set estado = 'enviada'
   where id = p_campana_id and estado = 'enviando';
$$;

revoke execute on function public.cerrar_campana from public, anon, authenticated;
grant execute on function public.cerrar_campana to service_role;

-- service_role bypassa RLS pero igual necesita el GRANT: son dos capas
-- distintas y PostgREST rechaza antes de llegar a la política.
grant insert on public.campana_envio to service_role;
grant usage, select on sequence public.campana_envio_id_seq to service_role;
grant update on public.campana to service_role;
