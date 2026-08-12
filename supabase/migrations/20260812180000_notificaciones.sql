-- Recordatorios y notificaciones push (fase 3).
--
-- Los recordatorios se calculan en el servidor, no en el dispositivo: uno de
-- desparasitación a 90 días no puede depender de que el celular tenga la app
-- abierta (docs/stack.md, Decisión 7).

create type public.tipo_notificacion as enum (
  'vacuna',
  'desparasitacion',
  'medicacion',
  'turno'
);

create type public.estado_recordatorio as enum ('pendiente', 'enviado', 'cancelado', 'fallido');

-- ---------------------------------------------------------------------------
-- Suscripciones push
--
-- Un usuario tiene varias: celular, tablet, escritorio. Los endpoints mueren
-- solos cuando el usuario desinstala o limpia datos, así que se dan de baja
-- tras varios fallos seguidos en lugar de reintentar para siempre.
-- ---------------------------------------------------------------------------

create table public.push_subscription (
  id                  uuid primary key default gen_random_uuid(),
  perfil_id           uuid not null default auth.uid() references public.perfil(id) on delete cascade,
  endpoint            text not null unique,
  p256dh              text not null,
  auth                text not null,
  user_agent          text,
  ultima_vez_ok       timestamptz,
  fallos_consecutivos integer not null default 0,
  creado_en           timestamptz not null default now()
);

create index push_subscription_perfil_idx on public.push_subscription (perfil_id);

alter table public.push_subscription enable row level security;
grant select, insert, update, delete on public.push_subscription to authenticated;

create policy "cada uno gestiona sus dispositivos"
  on public.push_subscription for all
  to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Preferencias
--
-- Ausencia de fila = habilitado. Así un tipo de notificación nuevo no queda
-- silenciado para todos los usuarios existentes.
-- ---------------------------------------------------------------------------

create table public.preferencia_notificacion (
  perfil_id  uuid not null default auth.uid() references public.perfil(id) on delete cascade,
  tipo       public.tipo_notificacion not null,
  habilitado boolean not null default true,
  primary key (perfil_id, tipo)
);

alter table public.preferencia_notificacion enable row level security;
grant select, insert, update, delete on public.preferencia_notificacion to authenticated;

create policy "cada uno gestiona sus preferencias"
  on public.preferencia_notificacion for all
  to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Recordatorios programados
--
-- Tabla materializada y no cálculo al vuelo: el job lee qué toca hoy sin
-- reevaluar las reglas de todo el sistema en cada corrida, y queda registro
-- de lo que se programó.
-- ---------------------------------------------------------------------------

create table public.recordatorio (
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascota(id) on delete cascade,
  tipo            public.tipo_notificacion not null,
  programado_para date not null,
  origen_tabla    text not null,
  origen_id       uuid not null,
  titulo          text not null,
  cuerpo          text not null,
  estado          public.estado_recordatorio not null default 'pendiente',
  enviado_en      timestamptz,
  creado_en       timestamptz not null default now(),

  -- Evita duplicar el mismo aviso si el generador corre más de una vez.
  constraint recordatorio_unico unique (origen_tabla, origen_id, programado_para)
);

create index recordatorio_pendientes_idx on public.recordatorio (programado_para)
  where estado = 'pendiente';

alter table public.recordatorio enable row level security;
grant select on public.recordatorio to authenticated;

create policy "tutores ven los recordatorios de su mascota"
  on public.recordatorio for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Registro de envíos
-- ---------------------------------------------------------------------------

create table public.notificacion_log (
  id         bigserial primary key,
  perfil_id  uuid references public.perfil(id) on delete set null,
  tipo       public.tipo_notificacion not null,
  titulo     text not null,
  enviado_en timestamptz not null default now(),
  resultado  text not null,
  error      text
);

create index notificacion_log_perfil_idx on public.notificacion_log (perfil_id, enviado_en desc);

alter table public.notificacion_log enable row level security;
grant select on public.notificacion_log to authenticated;

create policy "cada uno ve sus notificaciones"
  on public.notificacion_log for select
  to authenticated
  using (perfil_id = auth.uid() or public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Generación de recordatorios
--
-- Se apoya en aplicacion.proxima_fecha y en la medicación marcada para
-- recordar. Idempotente: la constraint única deja que corra todos los días
-- sin duplicar.
-- ---------------------------------------------------------------------------

create or replace function public.generar_recordatorios(
  p_dias_antes  integer default 7,
  p_aviso_previo integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creados integer := 0;
begin
  -- Vacunas y desparasitaciones que vencen dentro de la ventana.
  --
  -- El aviso se programa unos días ANTES del vencimiento: enterarse el mismo
  -- día no le da margen al tutor para sacar turno. Si la fecha ya pasó, el
  -- greatest() lo manda para hoy en vez de a una fecha del pasado.
  with nuevos as (
    insert into public.recordatorio (mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo)
    select a.mascota_id,
           case when a.tipo = 'vacuna' then 'vacuna'::public.tipo_notificacion
                else 'desparasitacion'::public.tipo_notificacion end,
           greatest(a.proxima_fecha - p_aviso_previo, current_date),
           'aplicacion',
           a.id,
           case when a.tipo = 'vacuna' then 'Vacuna de ' || m.nombre
                else 'Desparasitación de ' || m.nombre end,
           case when a.tipo = 'vacuna'
                then 'Le toca la vacuna' || coalesce(' (' || a.producto || ')', '') ||
                     ' el ' || to_char(a.proxima_fecha, 'DD/MM') || '.'
                else 'Le toca la desparasitación' || coalesce(' (' || a.producto || ')', '') ||
                     ' el ' || to_char(a.proxima_fecha, 'DD/MM') || '.' end
      from public.aplicacion a
      join public.mascota m on m.id = a.mascota_id
     where a.proxima_fecha is not null
       and a.proxima_fecha between current_date and current_date + p_dias_antes
       and m.archivado_en is null
       and m.fallecido_en is null
    on conflict (origen_tabla, origen_id, programado_para) do nothing
    returning 1
  )
  select count(*) into v_creados from nuevos;

  -- Medicación que termina pronto, para quien pidió que se le recuerde.
  with nuevos as (
    insert into public.recordatorio (mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo)
    select mc.mascota_id,
           'medicacion',
           greatest(mc.hasta - p_aviso_previo, current_date),
           'medicacion_en_curso',
           mc.id,
           'Medicación de ' || m.nombre,
           mc.descripcion || ' termina el ' || to_char(mc.hasta, 'DD/MM') || '.'
      from public.medicacion_en_curso mc
      join public.mascota m on m.id = mc.mascota_id
     where mc.recordar
       and mc.hasta is not null
       and mc.hasta between current_date and current_date + p_dias_antes
       and m.archivado_en is null
       and m.fallecido_en is null
    on conflict (origen_tabla, origen_id, programado_para) do nothing
    returning 1
  )
  select v_creados + count(*) into v_creados from nuevos;

  return v_creados;
end;
$$;

revoke execute on function public.generar_recordatorios from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Destinatarios de un recordatorio
--
-- Un recordatorio de una mascota compartida va a TODOS sus tutores activos,
-- respetando la preferencia de cada uno por separado.
-- ---------------------------------------------------------------------------

create or replace function public.destinatarios_recordatorio(p_recordatorio_id uuid)
returns table (
  perfil_id text,
  endpoint  text,
  p256dh    text,
  auth      text,
  sub_id    uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ps.perfil_id::text, ps.endpoint, ps.p256dh, ps.auth, ps.id
    from public.recordatorio r
    join public.mascota_tutor mt
      on mt.mascota_id = r.mascota_id and mt.revocado_en is null
    join public.push_subscription ps
      on ps.perfil_id = mt.perfil_id
   where r.id = p_recordatorio_id
     and ps.fallos_consecutivos < 5
     and not exists (
       select 1 from public.preferencia_notificacion pn
        where pn.perfil_id = mt.perfil_id
          and pn.tipo = r.tipo
          and not pn.habilitado
     );
$$;

revoke execute on function public.destinatarios_recordatorio from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de la Edge Function
--
-- service_role bypassa RLS, pero igual necesita GRANT de tabla: son dos capas
-- distintas. Sin esto la función falla con "permission denied" antes de llegar
-- a evaluar ninguna política.
-- ---------------------------------------------------------------------------

grant select, update on public.recordatorio to service_role;
grant select, update, delete on public.push_subscription to service_role;
grant insert on public.notificacion_log to service_role;
grant usage, select on sequence public.notificacion_log_id_seq to service_role;
grant select on public.preferencia_notificacion to service_role;
grant select on public.mascota_tutor to service_role;

grant execute on function public.destinatarios_recordatorio to service_role;
grant execute on function public.generar_recordatorios to service_role;

-- ---------------------------------------------------------------------------
-- Programación diaria
--
-- pg_cron corre dentro de la base, así que no depende de que nadie abra la app.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;

-- 09:00 en Buenos Aires es 12:00 UTC. pg_cron trabaja en UTC.
select cron.schedule(
  'generar-recordatorios',
  '0 12 * * *',
  $$select public.generar_recordatorios(7, 3)$$
);
