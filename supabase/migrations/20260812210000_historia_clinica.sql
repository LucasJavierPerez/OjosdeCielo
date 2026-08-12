-- Historia clínica electrónica y alta de pacientes desde la clínica (fase 6).
--
-- Dos cosas que la app no podía hacer:
--   1. La clínica no podía dar de alta un paciente cuyo dueño no usa la app,
--      que al principio es la mayoría.
--   2. El veterinario no podía registrar una consulta.

-- ---------------------------------------------------------------------------
-- Contacto del tutor sin cuenta
--
-- La clínica atiende gente que no se registró. Se guarda su contacto en una
-- ficha aparte, sin crear usuario ni mandarle mails que no pidió. Cuando esa
-- persona se registra con el mismo email, un trigger la vincula sola y pasa a
-- ver toda la historia que la clínica ya había cargado.
-- ---------------------------------------------------------------------------

create table public.contacto_tutor (
  id           uuid primary key default gen_random_uuid(),
  mascota_id   uuid not null references public.mascota(id) on delete cascade,
  nombre       text not null check (length(trim(nombre)) > 0),
  apellido     text not null default '',
  email        text,
  telefono     text,
  dni          text,
  notas        text,
  vinculado_en timestamptz,
  perfil_id    uuid references public.perfil(id) on delete set null,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz
);

create index contacto_tutor_mascota_idx on public.contacto_tutor (mascota_id);
create index contacto_tutor_email_idx on public.contacto_tutor (lower(email))
  where email is not null and vinculado_en is null;

create trigger contacto_tutor_actualizado_en
  before update on public.contacto_tutor
  for each row execute function public.set_actualizado_en();

alter table public.contacto_tutor enable row level security;
grant select, insert, update, delete on public.contacto_tutor to authenticated;

create policy "personal gestiona contactos"
  on public.contacto_tutor for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

create policy "tutores ven el contacto de su mascota"
  on public.contacto_tutor for select
  to authenticated
  using (public.es_tutor_de(mascota_id));

/*
 * Vincula los contactos pendientes cuando alguien se registra.
 *
 * Corre después de crear el perfil. Si la clínica había cargado el email de
 * esa persona en algún paciente, se le da acceso de titular a esas mascotas.
 */
create or replace function public.vincular_contactos_pendientes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contacto record;
begin
  for v_contacto in
    select id, mascota_id
      from public.contacto_tutor
     where vinculado_en is null
       and email is not null
       and lower(email) = lower(new.email)
  loop
    -- Sólo si la mascota no tiene ya un titular activo: el índice único lo
    -- impediría, y una mascota que ya tiene dueño no debe cambiar de manos
    -- por una coincidencia de email.
    if not exists (
      select 1 from public.mascota_tutor
       where mascota_id = v_contacto.mascota_id
         and rol = 'titular'
         and revocado_en is null
    ) then
      insert into public.mascota_tutor (mascota_id, perfil_id, rol)
      values (v_contacto.mascota_id, new.id, 'titular')
      on conflict do nothing;
    end if;

    update public.contacto_tutor
       set vinculado_en = now(), perfil_id = new.id
     where id = v_contacto.id;
  end loop;

  return new;
end;
$$;

create trigger vincular_contactos_al_registrarse
  after insert on public.perfil
  for each row execute function public.vincular_contactos_pendientes();

-- ---------------------------------------------------------------------------
-- Consulta: la entrada de la historia clínica
--
-- No se edita ni se borra. Una corrección es una consulta nueva que apunta a
-- la anterior con `corrige_a`. Es un requisito profesional, no una preferencia
-- técnica: la historia clínica es un documento legal.
-- ---------------------------------------------------------------------------

create table public.consulta (
  id             uuid primary key default gen_random_uuid(),
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  profesional_id uuid not null default auth.uid() references public.perfil(id),
  fecha          timestamptz not null default now(),
  motivo         text not null check (length(trim(motivo)) > 0),
  anamnesis      text,
  examen_fisico  text,
  diagnostico    text,
  tratamiento    text,
  evolucion      text,
  peso_kg        numeric(6,3) check (peso_kg is null or (peso_kg > 0 and peso_kg < 1000)),
  temperatura    numeric(4,1) check (temperatura is null or (temperatura > 20 and temperatura < 50)),
  corrige_a      uuid references public.consulta(id),
  creado_en      timestamptz not null default now()
);

create index consulta_mascota_idx on public.consulta (mascota_id, fecha desc);
create index consulta_corrige_idx on public.consulta (corrige_a) where corrige_a is not null;

comment on table public.consulta is
  'Append-only. Las correcciones son filas nuevas con corrige_a; nunca UPDATE ni DELETE.';

/*
 * Impide editar o borrar una consulta, incluso a un administrador.
 *
 * Las políticas ya no otorgan UPDATE ni DELETE, pero el trigger cierra también
 * la vía de un cambio futuro en las políticas o de un acceso con más
 * privilegios.
 */
create or replace function public.consulta_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La historia clínica no se modifica. Cargá una consulta nueva que corrija a la anterior.'
    using errcode = '42501';
end;
$$;

create trigger consulta_sin_update
  before update on public.consulta
  for each row execute function public.consulta_es_inmutable();

create trigger consulta_sin_delete
  before delete on public.consulta
  for each row execute function public.consulta_es_inmutable();

create trigger consulta_auditoria
  after insert on public.consulta
  for each row execute function public.registrar_auditoria();

alter table public.consulta enable row level security;
grant select, insert on public.consulta to authenticated;

create policy "tutores leen la historia de su mascota"
  on public.consulta for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

-- Sólo un veterinario registra actos clínicos. Recepción y administración ven
-- pero no escriben.
create policy "el veterinario carga consultas"
  on public.consulta for insert
  to authenticated
  with check (public.es_veterinario() and profesional_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Adjuntos: radiografías, ecografías, laboratorio
-- ---------------------------------------------------------------------------

create type public.tipo_adjunto as enum ('radiografia', 'ecografia', 'laboratorio', 'otro');

create table public.adjunto (
  id             uuid primary key default gen_random_uuid(),
  consulta_id    uuid not null references public.consulta(id) on delete cascade,
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  tipo           public.tipo_adjunto not null default 'otro',
  storage_path   text not null unique,
  nombre_archivo text not null,
  mime           text not null,
  tamano_bytes   bigint not null check (tamano_bytes > 0),
  descripcion    text,
  subido_por     uuid not null default auth.uid() references public.perfil(id),
  creado_en      timestamptz not null default now()
);

create index adjunto_consulta_idx on public.adjunto (consulta_id);
create index adjunto_mascota_idx on public.adjunto (mascota_id, creado_en desc);

alter table public.adjunto enable row level security;
grant select, insert, delete on public.adjunto to authenticated;

create policy "tutores ven los estudios de su mascota"
  on public.adjunto for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

create policy "el veterinario sube estudios"
  on public.adjunto for insert
  to authenticated
  with check (public.es_veterinario());

-- Se permite borrar sólo al profesional que lo subió: un archivo mal cargado
-- (paciente equivocado) tiene que poder sacarse, pero no por cualquiera.
create policy "quien lo subio puede borrarlo"
  on public.adjunto for delete
  to authenticated
  using (subido_por = auth.uid() and public.es_veterinario());

-- ---------------------------------------------------------------------------
-- Bucket de estudios médicos
--
-- Privado y separado del de fotos: son datos de salud, con otra sensibilidad y
-- otro límite de tamaño. Convención de rutas: {mascota_id}/{consulta_id}/{archivo}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estudios',
  'estudios',
  false,
  20971520,  -- 20 MB: una radiografía digital entra holgada
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/tiff',
    'application/pdf', 'application/dicom'
  ]
)
on conflict (id) do nothing;

create policy "tutores ven los archivos de estudios"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'estudios'
    and public.es_tutor_de(public.mascota_id_del_path(name))
  );

create policy "personal ve los archivos de estudios"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'estudios' and public.es_personal_clinica());

create policy "el veterinario sube archivos de estudios"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'estudios' and public.es_veterinario());

create policy "el veterinario borra archivos de estudios"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'estudios' and public.es_veterinario());

-- ---------------------------------------------------------------------------
-- Alta de paciente desde la clínica
--
-- Crea la mascota y la ficha de contacto en una sola transacción. NO deja al
-- veterinario como titular: la mascota queda sin titular con cuenta hasta que
-- el dueño se registre, y mientras tanto sólo la ve el personal.
-- ---------------------------------------------------------------------------

create or replace function public.crear_paciente(
  p_nombre            text,
  p_especie           public.especie,
  p_tutor_nombre      text,
  p_tutor_apellido    text default '',
  p_tutor_email       text default null,
  p_tutor_telefono    text default null,
  p_tutor_dni         text default null,
  p_raza              text default null,
  p_sexo              public.sexo_mascota default 'desconocido',
  p_fecha_nacimiento  date default null,
  p_castrado          boolean default null,
  p_microchip         text default null
)
returns public.mascota
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota public.mascota;
  v_perfil_existente uuid;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal de la clínica puede dar de alta pacientes'
      using errcode = '42501';
  end if;

  insert into public.mascota (nombre, especie, raza, sexo, fecha_nacimiento, castrado, microchip)
  values (p_nombre, p_especie, p_raza, p_sexo, p_fecha_nacimiento, p_castrado, p_microchip)
  returning * into v_mascota;

  insert into public.contacto_tutor (mascota_id, nombre, apellido, email, telefono, dni)
  values (v_mascota.id, p_tutor_nombre, coalesce(p_tutor_apellido, ''),
          nullif(trim(coalesce(p_tutor_email, '')), ''),
          p_tutor_telefono, p_tutor_dni);

  -- Si esa persona ya tiene cuenta, se la vincula de una: no tiene sentido
  -- hacerla esperar a registrarse de nuevo.
  if p_tutor_email is not null and trim(p_tutor_email) <> '' then
    select id into v_perfil_existente
      from public.perfil
     where lower(email) = lower(trim(p_tutor_email))
     limit 1;

    if v_perfil_existente is not null then
      insert into public.mascota_tutor (mascota_id, perfil_id, rol)
      values (v_mascota.id, v_perfil_existente, 'titular');

      update public.contacto_tutor
         set vinculado_en = now(), perfil_id = v_perfil_existente
       where mascota_id = v_mascota.id;
    end if;
  end if;

  return v_mascota;
end;
$$;

revoke execute on function public.crear_paciente from public, anon;
grant execute on function public.crear_paciente to authenticated;

-- ---------------------------------------------------------------------------
-- Historial visible
--
-- Devuelve la última versión de cada consulta: si una fue corregida, se
-- muestra la corrección. La original sigue en la tabla y es consultable.
-- ---------------------------------------------------------------------------

create or replace function public.historial_mascota(p_mascota_id uuid)
returns table (
  id             uuid,
  fecha          timestamptz,
  motivo         text,
  anamnesis      text,
  examen_fisico  text,
  diagnostico    text,
  tratamiento    text,
  evolucion      text,
  peso_kg        numeric,
  temperatura    numeric,
  corrige_a      uuid,
  profesional    text,
  adjuntos       bigint
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
  select c.id, c.fecha, c.motivo, c.anamnesis, c.examen_fisico, c.diagnostico,
         c.tratamiento, c.evolucion, c.peso_kg, c.temperatura, c.corrige_a,
         p.nombre || ' ' || p.apellido,
         (select count(*) from public.adjunto a where a.consulta_id = c.id)
    from public.consulta c
    join public.perfil p on p.id = c.profesional_id
   where c.mascota_id = p_mascota_id
     -- Oculta las que fueron corregidas: se ve la versión vigente.
     and not exists (
       select 1 from public.consulta c2 where c2.corrige_a = c.id
     )
   order by c.fecha desc;
end;
$$;

revoke execute on function public.historial_mascota from public, anon;
grant execute on function public.historial_mascota to authenticated;
