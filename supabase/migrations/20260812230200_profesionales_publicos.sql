-- Listado de profesionales para elegir al sacar turno.
--
-- Un cliente NO puede leer la tabla `perfil` de otra persona: la política
-- "personal ve todos los perfiles" habilita al personal, no a los clientes.
-- Un join desde el cliente devuelve `perfil: null` y la pantalla queda vacía.
--
-- Igual que con tutores_de_mascota(): RLS filtra filas, no columnas, así que
-- para exponer el nombre de un profesional sin abrir su perfil entero hace
-- falta una función que devuelva exactamente lo necesario.

create or replace function public.profesionales_disponibles()
returns table (
  id           uuid,
  nombre       text,
  apellido     text,
  matricula    text,
  color_agenda text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pr.id, p.nombre, p.apellido, pr.matricula, pr.color_agenda
    from public.profesional pr
    join public.perfil p on p.id = pr.perfil_id
   where pr.acepta_turnos
     and p.activo
     and p.archivado_en is null
   order by p.apellido, p.nombre;
$$;

revoke execute on function public.profesionales_disponibles from public, anon;
grant execute on function public.profesionales_disponibles to authenticated;
