-- Correcciones de la auditoría de aislamiento (rls-auditor).
--
--  CRÍTICO 1  perfiles_del_segmento sin control de rol: un cliente se bajaba
--             el padrón completo (nombre, email, mascotas de todos).
--  CRÍTICO 2  vincular_tutor_a_mascota daba acceso a la historia clínica de
--             cualquier paciente a cualquier cuenta, con sólo ser personal.
--  ALTO 3     el DELETE directo sobre `mascota` esquivaba las reglas de
--             eliminar_mascota() y arrastraba la historia por CASCADE.
--  MEDIO 4    los cargos de internación no atravesaban mascota_tutor: una
--             ex-titular seguía viendo qué estudios/fármacos se hicieron.
--  BAJO       el token de invitación lo leía cualquier tutor, no sólo el titular.

-- ---------------------------------------------------------------------------
-- CRÍTICO 1 — perfiles_del_segmento sólo desde los wrappers de campaña
--
-- No la llama ninguna app ni Edge Function: sólo previsualizar_campana,
-- crear_campana y despachar_campana, todas SECURITY DEFINER y con su propio
-- guard. Quitarle el execute a `authenticated` cierra el acceso directo por
-- PostgREST sin tocar esas funciones (corren como su dueño).
-- ---------------------------------------------------------------------------

revoke execute on function public.perfiles_del_segmento(jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- CRÍTICO 2 — vincular_tutor_a_mascota exige un contacto previo de ESE paciente
--
-- Ahora sólo vincula a alguien que la clínica ya registró como contacto sin
-- cuenta de esa mascota (mismo email). Sin eso, cualquiera del personal podía
-- dar acceso a la historia de cualquier paciente a cualquier cuenta, hacerse
-- titular de los pacientes sin dueño y transferir/borrar. Se quitan además los
-- parámetros p_telefono/p_dni: escribían sobre el perfil de otra persona.
-- ---------------------------------------------------------------------------

drop function if exists public.vincular_tutor_a_mascota(uuid, uuid, text, text);

create function public.vincular_tutor_a_mascota(
  p_perfil_id  uuid,
  p_mascota_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text;
  v_contacto_id uuid;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal vincula tutores' using errcode = '42501';
  end if;

  select email into v_email from public.perfil where id = p_perfil_id;
  if v_email is null then
    raise exception 'No encontramos esa cuenta' using errcode = 'P0002';
  end if;

  -- El ancla: tiene que existir un contacto sin cuenta de ESTE paciente con
  -- ESTE email. Es lo que ata el vínculo a una acción explícita de la clínica
  -- (haber cargado a esa persona en la ficha del paciente).
  select id into v_contacto_id
    from public.contacto_tutor
   where mascota_id = p_mascota_id
     and vinculado_en is null
     and lower(email) = lower(v_email)
   limit 1;
  if not found then
    raise exception 'Ese paciente no tiene registrada a esa persona como contacto. Cargala primero en la ficha.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.mascota_tutor
     where mascota_id = p_mascota_id and perfil_id = p_perfil_id and revocado_en is null
  ) then
    insert into public.mascota_tutor (mascota_id, perfil_id, rol, invitado_por)
    values (
      p_mascota_id,
      p_perfil_id,
      (case
        when exists (
          select 1 from public.mascota_tutor
           where mascota_id = p_mascota_id and rol = 'titular' and revocado_en is null
        ) then 'tutor'
        else 'titular'
      end)::public.rol_tutor,
      auth.uid()
    );
  end if;

  update public.contacto_tutor
     set vinculado_en = now(), perfil_id = p_perfil_id
   where id = v_contacto_id;
end;
$$;

revoke execute on function public.vincular_tutor_a_mascota(uuid, uuid) from public, anon;
grant execute on function public.vincular_tutor_a_mascota(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ALTO 3 — borrar una mascota es sólo por eliminar_mascota()
--
-- La política de DELETE replicaba una sola de las tres reglas de la RPC
-- (es_titular_de) y el grant la hacía alcanzable directo. Un titular podía
-- DELETE /rest/v1/mascota y el CASCADE se llevaba peso, vacunas, antecedentes,
-- medicación, adjuntos, turnos e internaciones. Va contra la regla no
-- negociable 5. eliminar_mascota() sigue funcionando: corre como su dueño y no
-- necesita ni el grant ni la política.
-- ---------------------------------------------------------------------------

drop policy "titular puede borrar su mascota" on public.mascota;
revoke delete on public.mascota from authenticated;

-- ---------------------------------------------------------------------------
-- MEDIO 4 — la facturación de internación no viaja al tutor
--
-- Las políticas de orden/orden_item/pago resuelven por `cliente_id = auth.uid()`,
-- congelado al abrir la internación. Una ex-titular seguía viendo las líneas
-- ("Estudio: hemograma", "Medicación: dipirona") para siempre, y la titular
-- nueva no veía nada. La internación es panel-only: la orden queda sin cliente.
-- ---------------------------------------------------------------------------

create or replace function public.crear_internacion(
  p_mascota_id   uuid,
  p_motivo       text,
  p_diagnostico  text default null,
  p_ubicacion    text default null,
  p_indicaciones text default null,
  p_tipo         text default 'internacion',
  p_direccion    text default null
)
returns public.internacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internacion public.internacion;
  v_orden_id    uuid;
  v_tipo        text := coalesce(nullif(trim(coalesce(p_tipo, '')), ''), 'internacion');
begin
  if not public.es_veterinario() then
    raise exception 'Abrir una internación o una atención a domicilio es un acto clínico.'
      using errcode = '42501';
  end if;

  if v_tipo not in ('internacion', 'domicilio') then
    raise exception 'Tipo de episodio inválido: %', v_tipo using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Hace falta un motivo' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.internacion
     where mascota_id = p_mascota_id and tipo = v_tipo and estado = 'activa'
  ) then
    raise exception 'Este paciente ya tiene un episodio de ese tipo activo' using errcode = '22023';
  end if;

  -- Sin cliente_id: la orden de una internación la maneja el personal, no
  -- aparece en la app del tutor. Evita que el titular del momento —o un
  -- ex-titular— vea el detalle clínico de los cargos.
  insert into public.orden (cliente_id, canal, estado, total, notas)
  values (
    null, 'mostrador', 'borrador', 0,
    case when v_tipo = 'domicilio' then 'Atención a domicilio' else 'Internación' end
  )
  returning id into v_orden_id;

  insert into public.internacion
    (mascota_id, orden_id, tipo, motivo, diagnostico, ubicacion, direccion, indicaciones)
  values (
    p_mascota_id,
    v_orden_id,
    v_tipo,
    trim(p_motivo),
    nullif(trim(coalesce(p_diagnostico, '')), ''),
    nullif(trim(coalesce(p_ubicacion, '')), ''),
    nullif(trim(coalesce(p_direccion, '')), ''),
    nullif(trim(coalesce(p_indicaciones, '')), '')
  )
  returning * into v_internacion;

  return v_internacion;
end;
$$;

revoke execute on function public.crear_internacion from public, anon;
grant execute on function public.crear_internacion to authenticated;

-- ---------------------------------------------------------------------------
-- BAJO — el token de invitación lo lee sólo el titular
--
-- Gestionar accesos (invitar, revocar, transferir) es exclusivo del titular
-- (puedeGestionarAccesos). Un tutor invitado no tiene por qué leer en claro
-- los tokens de las invitaciones pendientes que creó el titular.
-- ---------------------------------------------------------------------------

drop policy "tutores ven las invitaciones de su mascota" on public.invitacion_tutor;

create policy "el titular ve las invitaciones de su mascota"
  on public.invitacion_tutor for select
  to authenticated
  using (public.es_titular_de(mascota_id));
