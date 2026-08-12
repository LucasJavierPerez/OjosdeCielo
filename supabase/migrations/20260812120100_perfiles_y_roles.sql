-- Identidad, roles y los helpers de RLS que usa todo el resto del esquema.

create type public.rol as enum ('cliente', 'recepcionista', 'veterinario', 'administrador');

create table public.perfil (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null,
  apellido       text not null,
  dni            text,
  telefono       text,
  email          text not null,
  rol            public.rol not null default 'cliente',
  activo         boolean not null default true,
  archivado_en   timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index perfil_rol_idx on public.perfil (rol) where archivado_en is null;
create index perfil_email_idx on public.perfil (lower(email));

create trigger perfil_actualizado_en
  before update on public.perfil
  for each row execute function public.set_actualizado_en();

-- Cambiar un rol es escalada de privilegios: queda auditado.
create trigger perfil_auditoria
  after insert or update or delete on public.perfil
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Helpers de RLS
--
-- Leen el rol del JWT en lugar de consultar la tabla: una subconsulta a perfil
-- dentro de una política se evalúa por fila y se vuelve carísima. El claim lo
-- inyecta el hook de más abajo.
--
-- Todas son STABLE y fijan search_path: una función SECURITY DEFINER sin
-- search_path fijo es un vector clásico de escalada de privilegios en Postgres.
-- ---------------------------------------------------------------------------

create or replace function public.rol_actual()
returns public.rol
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'rol',
    'cliente'
  )::public.rol;
$$;

create or replace function public.es_personal_clinica()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.rol_actual() in ('recepcionista', 'veterinario', 'administrador');
$$;

create or replace function public.es_veterinario()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.rol_actual() = 'veterinario';
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.rol_actual() = 'administrador';
$$;

-- ---------------------------------------------------------------------------
-- Política pendiente de audit_log
--
-- La tabla se creó en la migración anterior con RLS habilitada y sin políticas
-- (cerrada). Recién acá existe es_personal_clinica() para poder abrir lectura.
--
-- Sólo SELECT: las filas las inserta el trigger, que corre como SECURITY
-- DEFINER. Nadie escribe ni borra auditoría desde la API, ni el administrador.
-- ---------------------------------------------------------------------------

create policy "personal lee auditoria"
  on public.audit_log for select
  to authenticated
  using (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- RLS de perfil
-- ---------------------------------------------------------------------------

alter table public.perfil enable row level security;

-- Los GRANT son la primera capa: sin ellos PostgREST devuelve "permission
-- denied" antes de llegar a evaluar RLS. RLS filtra *qué filas*; el GRANT
-- decide si la tabla es accesible. Hacen falta los dos.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.perfil to authenticated;

-- Sólo lectura: la auditoría la escribe el trigger, que corre como SECURITY
-- DEFINER. Ni el administrador puede insertarla o borrarla desde la API.
grant select on public.audit_log to authenticated;

create policy "cada uno ve su perfil"
  on public.perfil for select
  to authenticated
  using (id = auth.uid());

create policy "personal ve todos los perfiles"
  on public.perfil for select
  to authenticated
  using (public.es_personal_clinica());

-- El WITH CHECK impide que alguien se auto-promueva editando su propio perfil.
create policy "cada uno edita su perfil sin cambiar su rol"
  on public.perfil for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rol = public.rol_actual());

create policy "administrador gestiona perfiles"
  on public.perfil for all
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- ---------------------------------------------------------------------------
-- Alta automática del perfil al registrarse
-- ---------------------------------------------------------------------------

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfil (id, nombre, apellido, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    new.email,
    -- Siempre 'cliente'. Los roles de la clínica los asigna un administrador:
    -- tomarlo de metadata dejaría que cualquiera se registre como veterinario.
    'cliente'
  );
  return new;
end;
$$;

create trigger crear_perfil_al_registrarse
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: inyecta el rol en el JWT
--
-- Requiere estar declarado en supabase/config.toml. Sin eso, rol_actual()
-- devuelve siempre 'cliente' y el personal de la clínica no ve nada.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER es imprescindible: GoTrue ejecuta este hook como
-- supabase_auth_admin, que NO bypassa RLS. Sin esto, el SELECT sobre perfil no
-- matchea ninguna política, devuelve cero filas y el coalesce cae a 'cliente'
-- silenciosamente — todo el personal de la clínica queda sin acceso.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol public.rol;
  v_claims jsonb;
begin
  select rol into v_rol
  from public.perfil
  where id = (event ->> 'user_id')::uuid
    and activo
    and archivado_en is null;

  v_claims := event -> 'claims';
  v_claims := jsonb_set(v_claims, '{rol}', to_jsonb(coalesce(v_rol::text, 'cliente')));

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant select on table public.perfil to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
