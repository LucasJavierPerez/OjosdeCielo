-- Vista semanal de la agenda (pendiente de la fase 5).
--
-- La agenda diaria contesta "¿qué tengo hoy?". La semanal contesta otras dos,
-- que son las que aparecen cuando alguien llama por teléfono: "¿cuándo hay un
-- hueco?" y "¿cómo viene la semana del doctor tal?".
--
-- Devuelve exactamente la misma forma que agenda_dia() más la fecha civil del
-- turno, para que la pantalla agrupe sin recalcular zonas horarias.

create or replace function public.agenda_rango(
  p_desde          date,
  p_hasta          date,
  p_profesional_id uuid default null
)
returns table (
  dia             date,
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

  -- Un rango abierto traería años de turnos a una pantalla que muestra siete
  -- días. El tope es del servidor, no de la interfaz.
  if p_hasta < p_desde or (p_hasta - p_desde) > 31 then
    raise exception 'El rango tiene que ser de hasta 31 días.' using errcode = '22023';
  end if;

  return query
  select (t.inicio at time zone v_zona)::date,
         t.id, t.inicio, t.fin, t.estado, t.motivo, t.notas_internas,
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
   where (t.inicio at time zone v_zona)::date between p_desde and p_hasta
     and (p_profesional_id is null or t.profesional_id = p_profesional_id)
   order by t.inicio;
end;
$$;

revoke execute on function public.agenda_rango from public, anon;
grant execute on function public.agenda_rango to authenticated;
