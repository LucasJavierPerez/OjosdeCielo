-- Búsqueda de pacientes para el panel de la clínica.
--
-- Va como RPC y no como consulta desde el cliente por dos motivos: el personal
-- necesita buscar por datos del tutor (nombre, teléfono, DNI) que viven en otra
-- tabla, y conviene devolver exactamente las columnas que el panel muestra en
-- vez de abrir `perfil` entero.

create extension if not exists "pg_trgm";

-- Índices de búsqueda por texto parcial: sin esto cada búsqueda es un scan.
create index mascota_nombre_trgm on public.mascota using gin (nombre gin_trgm_ops);
create index perfil_nombre_trgm  on public.perfil  using gin (nombre gin_trgm_ops);
create index perfil_apellido_trgm on public.perfil using gin (apellido gin_trgm_ops);

create or replace function public.buscar_pacientes(p_texto text default '')
returns table (
  mascota_id       uuid,
  nombre           text,
  especie          public.especie,
  raza             text,
  foto_url         text,
  fecha_nacimiento date,
  fallecido_en     date,
  titular_nombre   text,
  titular_apellido text,
  titular_telefono text,
  titular_email    text,
  cantidad_tutores bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal de la clínica puede buscar pacientes'
      using errcode = '42501';
  end if;

  return query
  select m.id,
         m.nombre,
         m.especie,
         m.raza,
         m.foto_url,
         m.fecha_nacimiento,
         m.fallecido_en,
         p.nombre,
         p.apellido,
         p.telefono,
         p.email,
         (select count(*) from public.mascota_tutor mt2
           where mt2.mascota_id = m.id and mt2.revocado_en is null)
    from public.mascota m
    join public.mascota_tutor mt
      on mt.mascota_id = m.id and mt.rol = 'titular' and mt.revocado_en is null
    join public.perfil p on p.id = mt.perfil_id
   where m.archivado_en is null
     and (
       v_texto = ''
       or m.nombre ilike '%' || v_texto || '%'
       or p.nombre ilike '%' || v_texto || '%'
       or p.apellido ilike '%' || v_texto || '%'
       or coalesce(p.telefono, '') ilike '%' || v_texto || '%'
       or coalesce(p.dni, '') ilike '%' || v_texto || '%'
       or coalesce(m.microchip, '') ilike '%' || v_texto || '%'
     )
   order by m.nombre
   limit 50;
end;
$$;

comment on function public.buscar_pacientes is
  'Con texto vacío devuelve los primeros 50 pacientes: el panel arranca mostrando algo en vez de una pantalla en blanco.';

revoke execute on function public.buscar_pacientes from public, anon;
grant execute on function public.buscar_pacientes to authenticated;
