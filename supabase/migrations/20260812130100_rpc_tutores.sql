-- Operaciones sobre el acceso compartido a una mascota.
--
-- Van como RPC y no como políticas de escritura directa: las reglas quedan en
-- un solo lugar auditable, y no hay forma de que un tutor invitado se
-- auto-promueva a titular manipulando un UPDATE.
--
-- Todas son SECURITY DEFINER con search_path fijo y verifican permisos en la
-- primera línea. Una función SECURITY DEFINER que no valida quién la llama es
-- una puerta trasera.

-- ---------------------------------------------------------------------------
-- Alta de mascota
--
-- Atómica: crea la mascota y el vínculo de titular en la misma transacción.
-- Si fueran dos operaciones desde el cliente, un fallo en la segunda dejaría
-- una mascota sin dueño, invisible para todos y sin forma de recuperarla.
-- ---------------------------------------------------------------------------

create or replace function public.crear_mascota(
  p_nombre           text,
  p_especie          public.especie,
  p_raza             text default null,
  p_sexo             public.sexo_mascota default 'desconocido',
  p_fecha_nacimiento date default null,
  p_castrado         boolean default null,
  p_color            text default null,
  p_microchip        text default null
)
returns public.mascota
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota public.mascota;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión' using errcode = '42501';
  end if;

  insert into public.mascota (nombre, especie, raza, sexo, fecha_nacimiento, castrado, color, microchip)
  values (p_nombre, p_especie, p_raza, p_sexo, p_fecha_nacimiento, p_castrado, p_color, p_microchip)
  returning * into v_mascota;

  insert into public.mascota_tutor (mascota_id, perfil_id, rol)
  values (v_mascota.id, auth.uid(), 'titular');

  return v_mascota;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitar a otro tutor
-- ---------------------------------------------------------------------------

create or replace function public.invitar_tutor(p_mascota_id uuid)
returns public.invitacion_tutor
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitacion public.invitacion_tutor;
begin
  -- Sólo el titular gestiona accesos (docs/stack.md, Decisión 12).
  if not public.es_titular_de(p_mascota_id) then
    raise exception 'Sólo el titular puede invitar tutores' using errcode = '42501';
  end if;

  insert into public.invitacion_tutor (mascota_id, creada_por)
  values (p_mascota_id, auth.uid())
  returning * into v_invitacion;

  return v_invitacion;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceptar una invitación
--
-- La recibe cualquier usuario autenticado con el token. No expone la tabla:
-- si el token no sirve, el mensaje es siempre el mismo, para no filtrar si la
-- invitación existe, venció o ya fue usada.
-- ---------------------------------------------------------------------------

create or replace function public.aceptar_invitacion(p_token text)
returns public.mascota
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitacion public.invitacion_tutor;
  v_mascota    public.mascota;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión' using errcode = '42501';
  end if;

  select * into v_invitacion
  from public.invitacion_tutor
  where token = p_token
    and aceptada_en is null
    and revocada_en is null
    and vence_en > now()
  for update;

  if not found then
    raise exception 'La invitación no es válida o ya venció' using errcode = '22023';
  end if;

  -- Ya es tutor: no es un error para el usuario, simplemente no hace nada.
  if public.es_tutor_de(v_invitacion.mascota_id) then
    select * into v_mascota from public.mascota where id = v_invitacion.mascota_id;
    return v_mascota;
  end if;

  insert into public.mascota_tutor (mascota_id, perfil_id, rol, invitado_por)
  values (v_invitacion.mascota_id, auth.uid(), 'tutor', v_invitacion.creada_por);

  update public.invitacion_tutor
     set aceptada_en = now(), aceptada_por = auth.uid()
   where id = v_invitacion.id;

  select * into v_mascota from public.mascota where id = v_invitacion.mascota_id;
  return v_mascota;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revocar el acceso de un tutor
-- ---------------------------------------------------------------------------

create or replace function public.revocar_tutor(p_mascota_id uuid, p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_titular_de(p_mascota_id) then
    raise exception 'Sólo el titular puede revocar accesos' using errcode = '42501';
  end if;

  -- Dejaría la mascota sin titular y sin nadie que pueda gestionarla.
  -- Para irse, primero hay que transferir la titularidad.
  if p_perfil_id = auth.uid() then
    raise exception 'El titular no puede revocarse a sí mismo. Transferí la titularidad primero.'
      using errcode = '22023';
  end if;

  update public.mascota_tutor
     set revocado_en = now()
   where mascota_id = p_mascota_id
     and perfil_id = p_perfil_id
     and revocado_en is null;

  if not found then
    raise exception 'Esa persona no es tutora de la mascota' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transferir la titularidad
-- ---------------------------------------------------------------------------

create or replace function public.transferir_titularidad(p_mascota_id uuid, p_nuevo_titular uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_titular_de(p_mascota_id) then
    raise exception 'Sólo el titular puede transferir la titularidad' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mascota_tutor
     where mascota_id = p_mascota_id and perfil_id = p_nuevo_titular and revocado_en is null
  ) then
    raise exception 'El nuevo titular tiene que ser tutor de la mascota' using errcode = '22023';
  end if;

  -- El índice único de titular activo es parcial, así que el orden importa:
  -- primero se degrada al actual, después se promueve al nuevo.
  update public.mascota_tutor
     set rol = 'tutor'
   where mascota_id = p_mascota_id and perfil_id = auth.uid() and revocado_en is null;

  update public.mascota_tutor
     set rol = 'titular'
   where mascota_id = p_mascota_id and perfil_id = p_nuevo_titular and revocado_en is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
--
-- Se revoca de `public` y se otorga sólo a authenticated: sin esto, una
-- función SECURITY DEFINER queda accesible para el rol anónimo.
-- ---------------------------------------------------------------------------

revoke execute on function public.crear_mascota            from public, anon;
revoke execute on function public.invitar_tutor            from public, anon;
revoke execute on function public.aceptar_invitacion       from public, anon;
revoke execute on function public.revocar_tutor            from public, anon;
revoke execute on function public.transferir_titularidad   from public, anon;

grant execute on function public.crear_mascota          to authenticated;
grant execute on function public.invitar_tutor          to authenticated;
grant execute on function public.aceptar_invitacion     to authenticated;
grant execute on function public.revocar_tutor          to authenticated;
grant execute on function public.transferir_titularidad to authenticated;
