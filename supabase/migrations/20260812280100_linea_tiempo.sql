-- Línea de tiempo unificada de la salud (pendiente de la fase 2).
--
-- Hasta acá el tutor veía cinco secciones separadas: peso, vacunas,
-- antecedentes, medicación, consultas. Cada una ordenada por su cuenta. La
-- pregunta que ninguna contesta es la que más se hace: "¿qué le pasó a mi
-- perro este año?".
--
-- Se resuelve en la base con una unión y no en el navegador: juntar cinco
-- consultas y ordenarlas en el cliente obliga a traerlo todo antes de poder
-- mostrar las primeras diez.
--
-- Sobre las fechas: acá conviven fechas civiles (una vacuna se aplicó "el 3 de
-- marzo") con instantes (una consulta se cargó a las 14:32). Se unifica en
-- fecha civil, que es la unidad en la que la gente piensa un historial, y se
-- guarda el instante aparte sólo para desempatar dos cosas del mismo día.

create type public.tipo_evento_salud as enum (
  'consulta',
  'aplicacion',
  'peso',
  'antecedente',
  'medicacion',
  'receta',
  'turno'
);

create or replace function public.linea_de_tiempo(
  p_mascota_id uuid,
  p_limite     integer default 30,
  p_antes_de   date default null
)
returns table (
  tipo      public.tipo_evento_salud,
  origen_id uuid,
  fecha     date,
  momento   timestamptz,
  titulo    text,
  detalle   text,
  origen    public.origen_dato
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_tutor_de(p_mascota_id) and not public.es_personal_clinica() then
    raise exception 'No tenés acceso a esta mascota.' using errcode = '42501';
  end if;

  return query
  with eventos as (
    -- Los alias de esta primera rama nombran las columnas de todo el UNION.
    select 'consulta'::public.tipo_evento_salud                      as tipo,
           c.id                                                      as origen_id,
           (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
           c.fecha                                                   as momento,
           'Consulta'::text                                          as titulo,
           c.motivo                                                  as detalle,
           'clinica'::public.origen_dato                             as origen
      from public.consulta c
     where c.mascota_id = p_mascota_id

    union all
    select 'aplicacion',
           a.id,
           a.fecha,
           null,
           case when a.tipo = 'vacuna' then 'Vacuna' else 'Desparasitación' end,
           coalesce(a.producto, '') ||
             coalesce(' · próxima el ' || to_char(a.proxima_fecha, 'DD/MM/YYYY'), ''),
           a.origen
      from public.aplicacion a
     where a.mascota_id = p_mascota_id

    union all
    select 'peso',
           w.id,
           w.fecha,
           null,
           'Peso',
           trim(to_char(w.peso_kg, 'FM999990.999')) || ' kg',
           w.origen
      from public.peso_registro w
     where w.mascota_id = p_mascota_id

    union all
    -- Un antecedente puede no tener fecha de inicio: en ese caso se ubica el
    -- día en que se cargó, que es lo único que se sabe con certeza.
    select 'antecedente',
           an.id,
           coalesce(an.fecha, (an.creado_en at time zone 'America/Argentina/Buenos_Aires')::date),
           null,
           'Antecedente',
           an.descripcion,
           an.origen
      from public.antecedente an
     where an.mascota_id = p_mascota_id and an.activo

    union all
    select 'medicacion',
           me.id,
           me.desde,
           null,
           'Medicación',
           me.descripcion || coalesce(' · ' || me.dosis, ''),
           me.origen
      from public.medicacion_en_curso me
     where me.mascota_id = p_mascota_id

    union all
    select 'receta',
           r.id,
           (r.emitida_en at time zone 'America/Argentina/Buenos_Aires')::date,
           r.emitida_en,
           'Receta',
           coalesce(r.diagnostico, 'Medicación recetada') ||
             case when r.estado = 'anulada' then ' · anulada' else '' end,
           'clinica'::public.origen_dato
      from public.receta r
     where r.mascota_id = p_mascota_id

    union all
    select 'turno',
           t.id,
           (t.inicio at time zone 'America/Argentina/Buenos_Aires')::date,
           t.inicio,
           'Visita a la clínica',
           coalesce(t.motivo, e.nombre),
           'clinica'::public.origen_dato
      from public.turno t
      join public.especialidad e on e.id = t.especialidad_id
     where t.mascota_id = p_mascota_id and t.estado = 'atendido'
  )
  select * from eventos ev
   where p_antes_de is null or ev.fecha < p_antes_de
   order by ev.fecha desc, ev.momento desc nulls last
   limit greatest(p_limite, 1);
end;
$$;

revoke execute on function public.linea_de_tiempo from public, anon;
grant execute on function public.linea_de_tiempo to authenticated;
