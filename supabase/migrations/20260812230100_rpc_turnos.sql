-- Cálculo de disponibilidad y operaciones sobre turnos.

/*
 * Slots libres de un profesional para un día.
 *
 * Se calculan al vuelo a partir de la plantilla semanal, restando bloqueos y
 * turnos tomados. Nada de esto se materializa: una grilla almacenada habría que
 * mantenerla sincronizada con cada cambio de horario, vacación o feriado.
 *
 * Todo el cálculo se hace en la zona de la clínica. Un turno de las 9 de la
 * mañana es a las 9 en Buenos Aires, no en UTC.
 */
create or replace function public.slots_disponibles(
  p_profesional_id  uuid,
  p_fecha           date,
  p_duracion_min    integer default null,
  p_especialidad_id uuid default null
)
returns table (inicio timestamptz, fin timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duracion integer;
  v_zona     text := 'America/Argentina/Buenos_Aires';
begin
  v_duracion := coalesce(
    p_duracion_min,
    (select duracion_min from public.especialidad where id = p_especialidad_id),
    30
  );

  return query
  with franjas as (
    select d.hora_inicio, d.hora_fin
      from public.disponibilidad d
      join public.profesional pr on pr.id = d.profesional_id
     where d.profesional_id = p_profesional_id
       and pr.acepta_turnos
       and d.dia_semana = extract(dow from p_fecha)::smallint
       and d.vigente_desde <= p_fecha
       and (d.vigente_hasta is null or d.vigente_hasta >= p_fecha)
  ),
  candidatos as (
    select gs as arranca,
           gs + make_interval(mins => v_duracion) as termina
      from franjas f,
           generate_series(
             ((p_fecha + f.hora_inicio) at time zone v_zona),
             -- Se resta la duración para no ofrecer un turno que se pasa del
             -- horario de atención.
             ((p_fecha + f.hora_fin) at time zone v_zona) - make_interval(mins => v_duracion),
             make_interval(mins => v_duracion)
           ) as gs
  )
  select c.arranca, c.termina
    from candidatos c
   where
     -- No ofrecer turnos en el pasado, ni tan sobre la hora que no se llegue.
     c.arranca > now() + interval '1 hour'
     and not exists (
       select 1 from public.bloqueo_agenda b
        where (b.profesional_id = p_profesional_id or b.profesional_id is null)
          and tstzrange(b.desde, b.hasta) && tstzrange(c.arranca, c.termina)
     )
     and not exists (
       select 1 from public.turno t
        where t.profesional_id = p_profesional_id
          and t.estado not in ('cancelado', 'ausente')
          and tstzrange(t.inicio, t.fin) && tstzrange(c.arranca, c.termina)
     )
   order by c.arranca;
end;
$$;

revoke execute on function public.slots_disponibles from public, anon;
grant execute on function public.slots_disponibles to authenticated;

/*
 * Solicitar un turno.
 *
 * Va por RPC y no por INSERT para validar que el horario pertenezca a un slot
 * real. Con INSERT libre se podrían crear turnos a las 3 de la mañana o fuera
 * de la agenda del profesional.
 *
 * La superposición la sigue atajando la constraint de exclusión: entre la
 * verificación y el insert puede colarse otro pedido, y la base es el único
 * lugar donde eso se resuelve sin condición de carrera.
 */
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
  if not public.es_tutor_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sin acceso a esta mascota' using errcode = '42501';
  end if;

  select duracion_min into v_duracion
    from public.especialidad where id = p_especialidad_id and activa;
  if not found then
    raise exception 'Esa especialidad no está disponible' using errcode = '22023';
  end if;

  v_fin := p_inicio + make_interval(mins => v_duracion);

  -- El personal puede agendar fuera de la grilla (una urgencia, un encaje);
  -- el cliente sólo puede elegir un slot ofrecido.
  if not public.es_personal_clinica() then
    if not exists (
      select 1 from public.slots_disponibles(p_profesional_id, (p_inicio at time zone 'America/Argentina/Buenos_Aires')::date, v_duracion)
       where inicio = p_inicio
    ) then
      raise exception 'Ese horario ya no está disponible' using errcode = '22023';
    end if;
  end if;

  insert into public.turno (
    mascota_id, profesional_id, especialidad_id, inicio, fin, motivo,
    estado
  )
  values (
    p_mascota_id, p_profesional_id, p_especialidad_id, p_inicio, v_fin, p_motivo,
    -- El cast es necesario: sin él el CASE devuelve text y la columna es enum.
    case when public.es_personal_clinica() then 'confirmado' else 'solicitado' end::public.estado_turno
  )
  returning * into v_turno;

  -- Recordatorio 24 h antes, sobre la infraestructura de la fase 3.
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
     -- Sólo si el aviso cae en el futuro: un turno para mañana no genera
     -- recordatorio para ayer.
     and (v_turno.inicio at time zone 'America/Argentina/Buenos_Aires')::date - 1 >= current_date
  on conflict (origen_tabla, origen_id, programado_para) do nothing;

  return v_turno;
end;
$$;

revoke execute on function public.solicitar_turno from public, anon;
grant execute on function public.solicitar_turno to authenticated;

/*
 * Cancelar.
 *
 * Cualquier tutor de la mascota puede cancelar, sin importar quién lo pidió:
 * son dos personas que comparten el cuidado. Queda registrado quién canceló.
 *
 * El plazo mínimo sale de configuracion_clinica y no aplica al personal, que
 * necesita poder reorganizar la agenda ante un imprevisto.
 */
create or replace function public.cancelar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turno public.turno;
  v_horas integer;
begin
  select * into v_turno from public.turno where id = p_turno_id;
  if not found then
    raise exception 'El turno no existe' using errcode = '22023';
  end if;

  if not public.es_tutor_de(v_turno.mascota_id) and not public.es_personal_clinica() then
    raise exception 'Sin acceso a este turno' using errcode = '42501';
  end if;

  if v_turno.estado in ('cancelado', 'atendido') then
    raise exception 'Ese turno ya no se puede cancelar' using errcode = '22023';
  end if;

  if not public.es_personal_clinica() then
    select horas_min_cancelacion into v_horas from public.configuracion_clinica where id = 1;
    if v_turno.inicio < now() + make_interval(hours => coalesce(v_horas, 24)) then
      raise exception
        'Faltan menos de % horas para el turno. Llamá a la clínica para cancelarlo.',
        coalesce(v_horas, 24)
        using errcode = '22023';
    end if;
  end if;

  update public.turno
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = auth.uid()
   where id = p_turno_id;

  update public.recordatorio
     set estado = 'cancelado'
   where origen_tabla = 'turno' and origen_id = p_turno_id and estado = 'pendiente';
end;
$$;

revoke execute on function public.cancelar_turno from public, anon;
grant execute on function public.cancelar_turno to authenticated;

/*
 * Agenda del día para el panel.
 *
 * Devuelve los turnos con el nombre de la mascota y del tutor, para no obligar
 * al panel a cruzar cuatro tablas desde el cliente.
 */
create or replace function public.agenda_dia(p_fecha date, p_profesional_id uuid default null)
returns table (
  id              uuid,
  inicio          timestamptz,
  fin             timestamptz,
  estado          public.estado_turno,
  motivo          text,
  notas_internas  text,
  mascota_id      uuid,
  mascota_nombre  text,
  especie         public.especie,
  tutor_nombre    text,
  tutor_telefono  text,
  profesional_id  uuid,
  profesional     text,
  color_agenda    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal de la clínica ve la agenda' using errcode = '42501';
  end if;

  return query
  select t.id, t.inicio, t.fin, t.estado, t.motivo, t.notas_internas,
         m.id, m.nombre, m.especie,
         coalesce(tut.nombre, ct.nombre),
         coalesce(tut.telefono, ct.telefono),
         pr.id,
         pp.nombre || ' ' || pp.apellido,
         pr.color_agenda
    from public.turno t
    join public.mascota m on m.id = t.mascota_id
    join public.profesional pr on pr.id = t.profesional_id
    join public.perfil pp on pp.id = pr.perfil_id
    left join lateral (
      select p.nombre, p.telefono
        from public.mascota_tutor mt
        join public.perfil p on p.id = mt.perfil_id
       where mt.mascota_id = m.id and mt.revocado_en is null
       order by case when mt.rol = 'titular' then 0 else 1 end
       limit 1
    ) tut on true
    left join lateral (
      select c.nombre, c.telefono
        from public.contacto_tutor c
       where c.mascota_id = m.id
       limit 1
    ) ct on true
   where (t.inicio at time zone v_zona)::date = p_fecha
     and (p_profesional_id is null or t.profesional_id = p_profesional_id)
   order by t.inicio;
end;
$$;

revoke execute on function public.agenda_dia from public, anon;
grant execute on function public.agenda_dia to authenticated;

/* Cambio de estado desde el panel: sala de espera, atendido, ausente. */
create or replace function public.cambiar_estado_turno(
  p_turno_id uuid,
  p_estado   public.estado_turno
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal cambia el estado de un turno' using errcode = '42501';
  end if;

  if p_estado = 'cancelado' then
    raise exception 'Para cancelar usá cancelar_turno()' using errcode = '22023';
  end if;

  update public.turno set estado = p_estado where id = p_turno_id;
end;
$$;

revoke execute on function public.cambiar_estado_turno from public, anon;
grant execute on function public.cambiar_estado_turno to authenticated;
