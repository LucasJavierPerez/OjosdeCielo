-- La clínica pasa a controlar la carga: datos de salud y turnos los registra el
-- personal, no el tutor. El tutor conserva la lectura de todo.
--
-- Cambios:
--   1. `buscar_pacientes` lista TODOS los pacientes, incluidos los que la
--      clínica dio de alta con un contacto sin cuenta.
--   2. En las cuatro tablas de salud (peso, aplicaciones, antecedentes,
--      medicación) el tutor deja de poder escribir. Sólo lee. Lo que ya cargó
--      queda (marcado como reportado); la historia clínica no se borra.
--   3. `solicitar_turno` pasa a ser exclusivo del personal.
--   4. `borrar_turno`: el personal puede eliminar un turno por completo.

-- ---------------------------------------------------------------------------
-- 1. El panel ve a todos los pacientes
-- ---------------------------------------------------------------------------

drop function if exists public.buscar_pacientes(text);

create function public.buscar_pacientes(p_texto text default '')
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
  with titular_reg as (
    select mt.mascota_id, p.nombre, p.apellido, p.telefono, p.email, p.dni
      from public.mascota_tutor mt
      join public.perfil p on p.id = mt.perfil_id
     where mt.rol = 'titular' and mt.revocado_en is null
  ),
  contacto as (
    select distinct on (c.mascota_id)
           c.mascota_id, c.nombre, c.apellido, c.telefono, c.email, c.dni
      from public.contacto_tutor c
     where c.vinculado_en is null
     order by c.mascota_id, c.creado_en asc
  )
  select m.id,
         m.nombre,
         m.especie,
         m.raza,
         m.foto_url,
         m.fecha_nacimiento,
         m.fallecido_en,
         coalesce(t.nombre, ct.nombre, 'Sin tutor'),
         coalesce(t.apellido, ct.apellido, ''),
         coalesce(t.telefono, ct.telefono),
         coalesce(t.email, ct.email),
         (select count(*) from public.mascota_tutor mt2
           where mt2.mascota_id = m.id and mt2.revocado_en is null)
    from public.mascota m
    left join titular_reg t on t.mascota_id = m.id
    left join contacto ct on ct.mascota_id = m.id and t.mascota_id is null
   where m.archivado_en is null
     and (
       v_texto = ''
       or m.nombre ilike '%' || v_texto || '%'
       or coalesce(t.nombre, '') ilike '%' || v_texto || '%'
       or coalesce(t.apellido, '') ilike '%' || v_texto || '%'
       or coalesce(t.telefono, '') ilike '%' || v_texto || '%'
       or coalesce(t.dni, '') ilike '%' || v_texto || '%'
       or coalesce(ct.nombre, '') ilike '%' || v_texto || '%'
       or coalesce(ct.apellido, '') ilike '%' || v_texto || '%'
       or coalesce(ct.telefono, '') ilike '%' || v_texto || '%'
       or coalesce(ct.dni, '') ilike '%' || v_texto || '%'
       or coalesce(m.microchip, '') ilike '%' || v_texto || '%'
     )
   order by m.nombre
   limit 50;
end;
$$;

comment on function public.buscar_pacientes is
  'Lista todos los pacientes de la clínica, con titular registrado o con contacto sin cuenta.';

revoke execute on function public.buscar_pacientes from public, anon;
grant execute on function public.buscar_pacientes to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Datos de salud: los carga el veterinario, no el tutor
--
-- Se quitan las políticas de INSERT/UPDATE/DELETE del tutor y se restringen al
-- veterinario (peso, vacunas, alergias y medicación son acto clínico). La
-- lectura ("tutores y personal leen") se mantiene: el tutor sigue viendo todo.
-- Los registros con origen 'tutor' que ya existían quedan inmutables por vía
-- directa; el veterinario los descarta con motivo si hace falta.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso']
  loop
    execute format('drop policy "tutores y personal cargan" on public.%I', t);
    execute format('drop policy "cada uno edita lo suyo" on public.%I', t);
    execute format('drop policy "cada uno borra lo suyo" on public.%I', t);

    execute format($f$create policy "el veterinario carga" on public.%I for insert to authenticated
                      with check (public.es_veterinario())$f$, t);

    execute format($f$create policy "el veterinario edita lo de la clinica" on public.%I for update to authenticated
                      using (origen = 'clinica' and public.es_veterinario())
                      with check (origen = 'clinica' and public.es_veterinario())$f$, t);

    execute format($f$create policy "el veterinario borra lo de la clinica" on public.%I for delete to authenticated
                      using (origen = 'clinica' and public.es_veterinario())$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Los turnos los saca el personal
-- ---------------------------------------------------------------------------

create or replace function public.solicitar_turno(
  p_mascota_id      uuid,
  p_profesional_id  uuid,
  p_especialidad_id uuid,
  p_inicio          timestamptz,
  p_motivo          text default null
)
returns public.turno
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turno    public.turno;
  v_duracion integer;
  v_fin      timestamptz;
begin
  if not public.es_personal_clinica() then
    raise exception 'Los turnos los agenda el personal de la clínica' using errcode = '42501';
  end if;

  select duracion_min into v_duracion
    from public.especialidad where id = p_especialidad_id and activa;
  if not found then
    raise exception 'Esa especialidad no está disponible' using errcode = '22023';
  end if;

  v_fin := p_inicio + make_interval(mins => v_duracion);

  insert into public.turno (
    mascota_id, profesional_id, especialidad_id, inicio, fin, motivo, estado
  )
  values (
    p_mascota_id, p_profesional_id, p_especialidad_id, p_inicio, v_fin, p_motivo,
    'confirmado'::public.estado_turno
  )
  returning * into v_turno;

  insert into public.recordatorio (
    mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo
  )
  select v_turno.mascota_id,
         'turno',
         (v_turno.inicio at time zone 'America/Argentina/Buenos_Aires')::date - 1,
         'turno',
         v_turno.id,
         'Turno de ' || m.nombre,
         'Mañana a las ' ||
           to_char(v_turno.inicio at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') ||
           ' con ' || p.nombre || ' ' || p.apellido || '.'
    from public.mascota m
    cross join public.profesional pr
    join public.perfil p on p.id = pr.perfil_id
   where m.id = v_turno.mascota_id
     and pr.id = v_turno.profesional_id
     and (v_turno.inicio at time zone 'America/Argentina/Buenos_Aires')::date - 1 >= current_date
  on conflict (origen_tabla, origen_id, programado_para) do nothing;

  return v_turno;
end;
$$;

revoke execute on function public.solicitar_turno from public, anon;
grant execute on function public.solicitar_turno to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Borrar un turno
--
-- A diferencia de cancelar (que deja el turno con estado 'cancelado' para el
-- registro), esto lo elimina. Para el turno cargado por error, en el día
-- equivocado. Sólo el personal.
-- ---------------------------------------------------------------------------

create or replace function public.borrar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal borra turnos' using errcode = '42501';
  end if;

  delete from public.recordatorio
   where origen_tabla = 'turno' and origen_id = p_turno_id;

  delete from public.turno where id = p_turno_id;
  if not found then
    raise exception 'No encontramos ese turno' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.borrar_turno from public, anon;
grant execute on function public.borrar_turno to authenticated;
