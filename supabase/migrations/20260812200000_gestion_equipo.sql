-- Gestión del personal de la clínica.
--
-- Cambiar el rol de alguien es escalada de privilegios por definición, así que
-- va por RPC con reglas explícitas en vez de una política de UPDATE. La tabla
-- perfil ya tiene trigger de auditoría, de modo que cada cambio queda
-- registrado con quién lo hizo.

/*
 * Reglas, en orden de importancia:
 *
 *   1. Sólo un administrador puede cambiar roles.
 *   2. Nadie cambia el suyo — ni para subir ni para bajar. Evita tanto la
 *      auto-promoción como que alguien se degrade por error y pierda acceso.
 *   3. Siempre queda al menos un administrador activo. Sin esto la clínica
 *      puede quedarse sin nadie que gestione el sistema, y recuperarlo exige
 *      entrar a la base a mano.
 *
 * La regla 3 es defensa en profundidad: en el flujo actual la regla 2 ya la
 * hace inalcanzable, porque el último administrador no puede degradarse a sí
 * mismo y nadie más tiene permiso para hacerlo. Se deja igual para el día que
 * alguna de las otras reglas se relaje.
 */
create or replace function public.cambiar_rol(p_perfil_id uuid, p_rol public.rol)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol_actual public.rol;
  v_admins_restantes integer;
begin
  if not public.es_administrador() then
    raise exception 'Sólo un administrador puede cambiar roles' using errcode = '42501';
  end if;

  if p_perfil_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol. Pedíselo a otro administrador.'
      using errcode = '22023';
  end if;

  select rol into v_rol_actual from public.perfil where id = p_perfil_id;
  if not found then
    raise exception 'No existe esa persona' using errcode = '22023';
  end if;

  if v_rol_actual = 'administrador' and p_rol <> 'administrador' then
    select count(*) into v_admins_restantes
      from public.perfil
     where rol = 'administrador' and activo and archivado_en is null and id <> p_perfil_id;

    if v_admins_restantes = 0 then
      raise exception 'Es el último administrador activo. Nombrá a otro antes de cambiarle el rol.'
        using errcode = '22023';
    end if;
  end if;

  update public.perfil set rol = p_rol where id = p_perfil_id;
end;
$$;

/*
 * Baja de una persona del equipo.
 *
 * `activo = false` en vez de borrar: la cuenta deja de entrar pero se conserva
 * la trazabilidad de todo lo que registró. Una historia clínica firmada por
 * alguien que ya no trabaja sigue siendo suya.
 */
create or replace function public.cambiar_estado_personal(p_perfil_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol public.rol;
  v_admins_restantes integer;
begin
  if not public.es_administrador() then
    raise exception 'Sólo un administrador puede dar de baja a alguien' using errcode = '42501';
  end if;

  if p_perfil_id = auth.uid() then
    raise exception 'No podés darte de baja a vos mismo' using errcode = '22023';
  end if;

  select rol into v_rol from public.perfil where id = p_perfil_id;
  if not found then
    raise exception 'No existe esa persona' using errcode = '22023';
  end if;

  if v_rol = 'administrador' and not p_activo then
    select count(*) into v_admins_restantes
      from public.perfil
     where rol = 'administrador' and activo and archivado_en is null and id <> p_perfil_id;

    if v_admins_restantes = 0 then
      raise exception 'Es el último administrador activo. Nombrá a otro antes de darlo de baja.'
        using errcode = '22023';
    end if;
  end if;

  update public.perfil set activo = p_activo where id = p_perfil_id;
end;
$$;

/*
 * Listado del equipo.
 *
 * RPC en vez de consulta directa para no exponer el DNI ni el teléfono de
 * todos: RLS filtra filas, no columnas.
 */
create or replace function public.listar_personal()
returns table (
  id        uuid,
  nombre    text,
  apellido  text,
  email     text,
  rol       public.rol,
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
  select p.id, p.nombre, p.apellido, p.email, p.rol, p.activo, p.creado_en,
         p.id = auth.uid()
    from public.perfil p
   where p.rol <> 'cliente'
     and p.archivado_en is null
   order by p.activo desc, p.apellido, p.nombre;
end;
$$;

revoke execute on function public.cambiar_rol              from public, anon;
revoke execute on function public.cambiar_estado_personal  from public, anon;
revoke execute on function public.listar_personal          from public, anon;

grant execute on function public.cambiar_rol             to authenticated;
grant execute on function public.cambiar_estado_personal to authenticated;
grant execute on function public.listar_personal         to authenticated;

-- La Edge Function de invitación lee perfil con service_role para saber si el
-- email ya existe, pero el cambio de rol lo hace con el token del administrador
-- que la invocó: así todas las reglas de cambiar_rol siguen aplicando y
-- service_role nunca puede promover a nadie por su cuenta.
grant select on public.perfil to service_role;

-- ---------------------------------------------------------------------------
-- Un usuario inactivo no debe poder operar
--
-- El hook de acceso ya filtra por `activo`, así que un perfil dado de baja
-- recibe rol 'cliente' en su JWT y pierde todo acceso al panel. Se deja
-- constancia acá porque no es evidente leyendo sólo esta migración.
-- ---------------------------------------------------------------------------
