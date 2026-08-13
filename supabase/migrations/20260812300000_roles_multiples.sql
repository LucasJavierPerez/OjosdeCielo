-- Una persona puede tener varios roles a la vez.
--
-- El modelo de un rol único no describe la realidad: en una veterinaria
-- unipersonal la misma persona atiende, cobra y administra. Con un enum había
-- que elegir cuál de las tres cosas era, y perder las otras dos.
--
-- `perfil.rol` se reemplaza por `perfil.roles`, un conjunto. Una sola fuente
-- de verdad: no queda un "rol principal" derivado al lado, porque dos columnas
-- que dicen lo mismo terminan discrepando.
--
-- Los 32 lugares del esquema que preguntan por permisos no cambian: llaman a
-- es_personal_clinica(), es_veterinario() y es_administrador(), y lo único que
-- se reescribe es el cuerpo de esas tres.

alter table public.perfil add column roles public.rol[];

update public.perfil set roles = array[rol];

alter table public.perfil
  alter column roles set not null,
  alter column roles set default array['cliente']::public.rol[];

-- Un perfil sin roles no podría hacer nada y sería invisible para el hook, que
-- caería silenciosamente en 'cliente'. Mejor que la base lo impida.
alter table public.perfil add constraint perfil_roles_no_vacio
  check (array_length(roles, 1) >= 1);

-- Sin repetidos y siempre en el mismo orden.
--
-- Va como trigger y no como CHECK por dos motivos: Postgres no admite
-- subconsultas en un CHECK, y normalizar es mejor que rechazar. Que
-- {veterinario,cliente} y {cliente,veterinario} sean la misma fila evita que
-- la auditoría registre cambios que no ocurrieron.
create or replace function public.normalizar_roles()
returns trigger
language plpgsql
as $$
begin
  new.roles := (select array_agg(distinct r order by r) from unnest(new.roles) r);
  if new.roles is null or array_length(new.roles, 1) is null then
    raise exception 'Un perfil necesita al menos un rol.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger perfil_normalizar_roles
  before insert or update of roles on public.perfil
  for each row execute function public.normalizar_roles();

comment on column public.perfil.roles is
  'Conjunto de roles. Una misma persona puede ser administradora, veterinaria y '
  'recepcionista: en una clínica unipersonal lo es. `cliente` puede convivir '
  'con los demás — quien trabaja en la clínica también tiene sus propias '
  'mascotas y usa la app como cualquiera.';

drop index if exists perfil_rol_idx;
create index perfil_roles_idx on public.perfil using gin (roles)
  where archivado_en is null;

-- La política que impide auto-promoverse depende de la columna vieja: hay que
-- soltarla para poder borrar la columna. Se recrea más abajo, después de los
-- helpers nuevos — crearla acá fallaría porque roles_actuales() todavía no
-- existe.
drop policy "cada uno edita su perfil sin cambiar su rol" on public.perfil;

alter table public.perfil drop column rol;


-- ---------------------------------------------------------------------------
-- Helpers de RLS
--
-- Siguen leyendo del JWT y no de la tabla, por la misma razón que antes: una
-- subconsulta dentro de una política se evalúa por fila.
-- ---------------------------------------------------------------------------

create or replace function public.roles_actuales()
returns public.rol[]
language sql
stable
set search_path = public, pg_temp
as $$
  -- jsonb_array_elements_text y no jsonb_array_elements: la variante jsonb
  -- devuelve el elemento con sus comillas y el cast al enum falla con
  -- «invalid input value for enum rol: ""cliente""».
  select coalesce(
    (select array_agg(valor::public.rol)
       from jsonb_array_elements_text(
         coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'roles',
           '["cliente"]'::jsonb
         )
       ) as valor),
    array['cliente']::public.rol[]
  );
$$;

create or replace function public.tiene_rol(p_rol public.rol)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_rol = any(public.roles_actuales());
$$;

create or replace function public.es_personal_clinica()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.roles_actuales() && array['recepcionista', 'veterinario', 'administrador']::public.rol[];
$$;

create or replace function public.es_veterinario()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.tiene_rol('veterinario');
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.tiene_rol('administrador');
$$;

-- rol_actual() ya no tiene sentido: no hay un rol, hay un conjunto. Se elimina
-- en vez de dejarla devolviendo "alguno", que sería una respuesta plausible y
-- equivocada en el peor momento.
drop function if exists public.rol_actual();

grant execute on function public.roles_actuales to authenticated;
grant execute on function public.tiene_rol to authenticated;

-- Recién acá existe roles_actuales(). El WITH CHECK impide que alguien se
-- auto-promueva editando su propio perfil: la comparación es de conjuntos y no
-- de arrays con `=`, porque atar una decisión de seguridad al orden de los
-- elementos es frágil de más.
create policy "cada uno edita su perfil sin cambiar sus roles"
  on public.perfil for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and roles @> public.roles_actuales()
    and roles <@ public.roles_actuales()
  );

-- ---------------------------------------------------------------------------
-- Alta y hook
-- ---------------------------------------------------------------------------

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfil (id, nombre, apellido, email, roles)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    new.email,
    -- Siempre 'cliente'. Los roles de la clínica los asigna un administrador:
    -- tomarlos de metadata dejaría que cualquiera se registre como veterinario.
    array['cliente']::public.rol[]
  );
  return new;
end;
$$;

-- SECURITY DEFINER sigue siendo imprescindible: GoTrue ejecuta el hook como
-- supabase_auth_admin, que NO bypassa RLS. Sin esto el SELECT no matchea
-- ninguna política, devuelve cero filas, y todo el personal de la clínica
-- queda con roles ["cliente"] sin ningún error visible.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles public.rol[];
  v_claims jsonb;
begin
  select roles into v_roles
  from public.perfil
  where id = (event ->> 'user_id')::uuid
    and activo
    and archivado_en is null;

  v_claims := event -> 'claims';
  v_claims := jsonb_set(
    v_claims,
    '{roles}',
    to_jsonb(coalesce(v_roles, array['cliente']::public.rol[]))
  );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Gestión del equipo
--
-- Cambia una regla, y no por comodidad: hasta acá nadie podía tocar sus
-- propios roles. En una clínica unipersonal eso deja al administrador único
-- sin poder darse nunca el rol de veterinario, porque no hay otra persona que
-- se lo dé.
--
-- La regla pasa a ser: podés cambiarte los roles mientras no te saques
-- `administrador`. Eso preserva lo que la regla original protegía —que nadie
-- se quede afuera por error— sin bloquear el caso real.
--
-- Efecto secundario que vale la pena decir: la regla del "último
-- administrador" deja de ser inalcanzable. Antes la bloqueaba la regla de no
-- tocarse a uno mismo y era defensa en profundidad; ahora es la única barrera
-- que impide que la clínica se quede sin nadie que administre.
-- ---------------------------------------------------------------------------

drop function if exists public.cambiar_rol(uuid, public.rol);

create or replace function public.cambiar_roles(p_perfil_id uuid, p_roles public.rol[])
returns public.perfil
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles_previos public.rol[];
  v_admins_restantes integer;
  v_perfil public.perfil;
begin
  if not public.es_administrador() then
    raise exception 'Sólo un administrador puede cambiar roles' using errcode = '42501';
  end if;

  if p_roles is null or array_length(p_roles, 1) is null then
    raise exception 'Hace falta al menos un rol.' using errcode = '22023';
  end if;

  select roles into v_roles_previos from public.perfil where id = p_perfil_id;
  if not found then
    raise exception 'No existe esa persona' using errcode = '22023';
  end if;

  if p_perfil_id = auth.uid() and not ('administrador' = any(p_roles)) then
    raise exception 'No podés sacarte a vos mismo el rol de administrador. Pedíselo a otro administrador.'
      using errcode = '22023';
  end if;

  if 'administrador' = any(v_roles_previos) and not ('administrador' = any(p_roles)) then
    select count(*) into v_admins_restantes
      from public.perfil
     where 'administrador' = any(roles)
       and activo and archivado_en is null and id <> p_perfil_id;

    if v_admins_restantes = 0 then
      raise exception 'Es el último administrador activo. Nombrá a otro antes de cambiarle los roles.'
        using errcode = '22023';
    end if;
  end if;

  -- Se ordena y se deduplica acá: así {veterinario,cliente} y
  -- {cliente,veterinario} son la misma fila y la auditoría no muestra cambios
  -- que no existieron.
  update public.perfil
     set roles = (select array_agg(distinct r order by r) from unnest(p_roles) r)
   where id = p_perfil_id
  returning * into v_perfil;

  return v_perfil;
end;
$$;

create or replace function public.cambiar_estado_personal(p_perfil_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles public.rol[];
  v_admins_restantes integer;
begin
  if not public.es_administrador() then
    raise exception 'Sólo un administrador puede dar de baja a alguien' using errcode = '42501';
  end if;

  if p_perfil_id = auth.uid() then
    raise exception 'No podés darte de baja a vos mismo' using errcode = '22023';
  end if;

  select roles into v_roles from public.perfil where id = p_perfil_id;
  if not found then
    raise exception 'No existe esa persona' using errcode = '22023';
  end if;

  if 'administrador' = any(v_roles) and not p_activo then
    select count(*) into v_admins_restantes
      from public.perfil
     where 'administrador' = any(roles)
       and activo and archivado_en is null and id <> p_perfil_id;

    if v_admins_restantes = 0 then
      raise exception 'Es el último administrador activo. Nombrá a otro antes de darlo de baja.'
        using errcode = '22023';
    end if;
  end if;

  update public.perfil set activo = p_activo where id = p_perfil_id;
end;
$$;

-- Cambia la forma de salida, así que no alcanza con `create or replace`.
drop function if exists public.listar_personal();

create function public.listar_personal()
returns table (
  id        uuid,
  nombre    text,
  apellido  text,
  email     text,
  roles     public.rol[],
  activo    boolean,
  creado_en timestamptz,
  soy_yo    boolean
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
  -- Aparece quien tenga algún rol de clínica, aunque además sea cliente: en
  -- una unipersonal la misma persona es las dos cosas.
  select p.id, p.nombre, p.apellido, p.email, p.roles, p.activo, p.creado_en,
         p.id = auth.uid()
    from public.perfil p
   where p.roles && array['recepcionista', 'veterinario', 'administrador']::public.rol[]
     and p.archivado_en is null
   order by p.activo desc, p.apellido, p.nombre;
end;
$$;

revoke execute on function public.cambiar_roles            from public, anon;
revoke execute on function public.cambiar_estado_personal  from public, anon;
revoke execute on function public.listar_personal          from public, anon;

grant execute on function public.cambiar_roles           to authenticated;
grant execute on function public.cambiar_estado_personal to authenticated;
grant execute on function public.listar_personal         to authenticated;

-- ---------------------------------------------------------------------------
-- Campañas: la segmentación leía perfil.rol
--
-- Se recrea con el conjunto. Sin esto la función queda compilada contra una
-- columna que ya no existe y falla recién al ejecutarse, que es el peor
-- momento para enterarse.
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
     -- Quien trabaja en la clínica y además tiene mascotas propias recibe
     -- las campañas como cualquier otro tutor: le sirven igual.
     and 'cliente' = any(p.roles)
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
