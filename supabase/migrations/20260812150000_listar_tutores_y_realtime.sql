-- Listado de tutores y suscripción en tiempo real.

-- ---------------------------------------------------------------------------
-- Tutores de una mascota
--
-- Va como RPC y no como un join a `perfil` desde el cliente por dos motivos:
--
--   1. Un tutor NO puede leer la tabla perfil de otro tutor (la política sólo
--      permite el propio). Un join simplemente devolvería null.
--   2. RLS filtra filas, no columnas. Abrir perfil a "los demás tutores de mi
--      mascota" expondría también dni y teléfono. Acá se elige exactamente qué
--      se devuelve: nombre, apellido y email — lo mínimo para reconocer a la
--      persona con la que se comparte la mascota.
-- ---------------------------------------------------------------------------

create or replace function public.tutores_de_mascota(p_mascota_id uuid)
returns table (
  id        uuid,
  perfil_id uuid,
  rol       public.rol_tutor,
  desde     timestamptz,
  nombre    text,
  apellido  text,
  email     text,
  soy_yo    boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_tutor_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  return query
  select mt.id, mt.perfil_id, mt.rol, mt.desde,
         p.nombre, p.apellido, p.email,
         mt.perfil_id = auth.uid()
    from public.mascota_tutor mt
    join public.perfil p on p.id = mt.perfil_id
   where mt.mascota_id = p_mascota_id
     and mt.revocado_en is null
   order by mt.desde;
end;
$$;

revoke execute on function public.tutores_de_mascota from public, anon;
grant execute on function public.tutores_de_mascota to authenticated;

-- ---------------------------------------------------------------------------
-- Revocar una invitación todavía no usada
-- ---------------------------------------------------------------------------

create or replace function public.revocar_invitacion(p_invitacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota_id uuid;
begin
  select mascota_id into v_mascota_id
    from public.invitacion_tutor
   where id = p_invitacion_id and aceptada_en is null and revocada_en is null;

  if not found then
    raise exception 'La invitación no existe o ya no está activa' using errcode = '22023';
  end if;

  if not public.es_titular_de(v_mascota_id) then
    raise exception 'Sólo el titular puede revocar invitaciones' using errcode = '42501';
  end if;

  update public.invitacion_tutor set revocada_en = now() where id = p_invitacion_id;
end;
$$;

revoke execute on function public.revocar_invitacion from public, anon;
grant execute on function public.revocar_invitacion to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Respeta RLS: sólo llegan eventos de filas que el usuario ya podría leer.
-- REPLICA IDENTITY FULL hace que los DELETE incluyan la fila anterior; sin eso
-- el cliente recibe el evento pero no puede saber a qué mascota correspondía.
-- ---------------------------------------------------------------------------

alter table public.mascota replica identity full;
alter table public.mascota_tutor replica identity full;

alter publication supabase_realtime add table public.mascota;
alter publication supabase_realtime add table public.mascota_tutor;
