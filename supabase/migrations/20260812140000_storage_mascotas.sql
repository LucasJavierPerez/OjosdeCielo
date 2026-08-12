-- Bucket para fotos de mascotas.
--
-- Privado, como todo lo que pertenece a un cliente. Se sirve con URLs firmadas
-- de vida corta. Un bucket público expondría las fotos a cualquiera que
-- adivine la ruta, y la ruta contiene el id de la mascota.
--
-- Convención de rutas: {mascota_id}/{nombre-archivo}
-- El primer segmento es lo que usan las políticas para resolver el acceso.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mascotas',
  'mascotas',
  false,
  5242880,  -- 5 MB: una foto de celular comprimida entra de sobra
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Helper: extrae el id de mascota del path y verifica que sea un uuid válido.
-- Sin la validación, un path como "cualquier-cosa/foto.jpg" haría fallar el
-- cast dentro de la política y el error se propagaría al usuario.
create or replace function public.mascota_id_del_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_primer_segmento text;
begin
  v_primer_segmento := split_part(p_name, '/', 1);
  if v_primer_segmento !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_primer_segmento::uuid;
end;
$$;

create policy "tutores ven las fotos de su mascota"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'mascotas'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  );

create policy "personal ve las fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'mascotas' and public.es_personal_clinica());

create policy "tutores suben fotos de su mascota"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'mascotas'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  );

create policy "tutores reemplazan la foto de su mascota"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'mascotas'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  )
  with check (
    bucket_id = 'mascotas'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  );

create policy "tutores borran la foto de su mascota"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'mascotas'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  );
