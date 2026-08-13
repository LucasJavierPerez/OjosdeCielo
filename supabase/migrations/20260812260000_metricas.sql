-- Métricas del panel (fase 8).
--
-- Todo se calcula al vuelo con RPC. Nada de tablas de agregados: una clínica
-- de barrio no genera el volumen que justifique mantenerlas sincronizadas, y
-- una métrica desfasada es peor que no tenerla.
--
-- Dos niveles de acceso, y la diferencia importa: lo operativo lo necesita
-- recepción para trabajar (a quién llamar, cómo viene el día); lo económico es
-- del administrador. La separación se hace acá, no en la interfaz.
--
-- Todas las funciones agrupan por día en la zona de la clínica y no en UTC:
-- agrupar `creado_en` crudo mete lo de las 21 h de un martes en el miércoles.

-- ---------------------------------------------------------------------------
-- Operativo — todo el personal
-- ---------------------------------------------------------------------------

create or replace function public.metricas_turnos(
  p_desde date default (current_date - interval '30 days')::date,
  p_hasta date default current_date
)
returns table (
  dia        date,
  solicitados bigint,
  confirmados bigint,
  atendidos   bigint,
  cancelados  bigint,
  ausentes    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Las métricas son del personal de la clínica.' using errcode = '42501';
  end if;

  return query
  select d::date,
         count(*) filter (where t.estado = 'solicitado'),
         count(*) filter (where t.estado = 'confirmado'),
         count(*) filter (where t.estado = 'atendido'),
         count(*) filter (where t.estado = 'cancelado'),
         count(*) filter (where t.estado = 'ausente')
    from generate_series(p_desde, p_hasta, interval '1 day') d
    left join public.turno t
      on (t.inicio at time zone 'America/Argentina/Buenos_Aires')::date = d::date
   group by d
   order by d;
end;
$$;

revoke execute on function public.metricas_turnos from public, anon;
grant execute on function public.metricas_turnos to authenticated;

create or replace function public.metricas_profesionales(
  p_desde date default (current_date - interval '30 days')::date,
  p_hasta date default current_date
)
returns table (
  profesional_id uuid,
  profesional    text,
  atendidos      bigint,
  cancelados     bigint,
  ausentes       bigint,
  consultas      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Las métricas son del personal de la clínica.' using errcode = '42501';
  end if;

  return query
  select pr.id,
         p.nombre || ' ' || p.apellido,
         count(t.id) filter (where t.estado = 'atendido'),
         count(t.id) filter (where t.estado = 'cancelado'),
         count(t.id) filter (where t.estado = 'ausente'),
         (select count(*)
            from public.consulta c
           where c.profesional_id = pr.perfil_id
             and (c.fecha at time zone 'America/Argentina/Buenos_Aires')::date
                 between p_desde and p_hasta)
    from public.profesional pr
    join public.perfil p on p.id = pr.perfil_id
    left join public.turno t
      on t.profesional_id = pr.id
     and (t.inicio at time zone 'America/Argentina/Buenos_Aires')::date
         between p_desde and p_hasta
   where p.archivado_en is null
   group by pr.id, pr.perfil_id, p.nombre, p.apellido
   order by 3 desc, 2;
end;
$$;

revoke execute on function public.metricas_profesionales from public, anon;
grant execute on function public.metricas_profesionales to authenticated;

-- Pacientes que dejaron de venir. La métrica más accionable de todas: es una
-- lista de llamados por hacer, no un número para mirar.
create or replace function public.pacientes_inactivos(p_meses integer default 12)
returns table (
  mascota_id      uuid,
  mascota         text,
  especie         public.especie,
  ultima_atencion timestamptz,
  meses_sin_venir integer,
  tutor           text,
  telefono        text,
  email           text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Las métricas son del personal de la clínica.' using errcode = '42501';
  end if;

  return query
  select m.id,
         m.nombre,
         m.especie,
         u.ultima,
         (extract(year from age(now(), coalesce(u.ultima, m.creado_en))) * 12
          + extract(month from age(now(), coalesce(u.ultima, m.creado_en))))::integer,
         t.nombre || ' ' || t.apellido,
         t.telefono,
         t.email
    from public.mascota m
    left join lateral (
      -- La última vez que pisó la clínica: una consulta cargada o un turno al
      -- que efectivamente vino. Un turno cancelado no cuenta como atención.
      select max(f) as ultima from (
        select c.fecha as f from public.consulta c where c.mascota_id = m.id
        union all
        select tu.inicio from public.turno tu
         where tu.mascota_id = m.id and tu.estado = 'atendido'
      ) x
    ) u on true
    left join lateral (
      select p.nombre, p.apellido, p.telefono, p.email
        from public.mascota_tutor mt
        join public.perfil p on p.id = mt.perfil_id
       where mt.mascota_id = m.id and mt.revocado_en is null
       order by case when mt.rol = 'titular' then 0 else 1 end
       limit 1
    ) t on true
   where m.archivado_en is null
     and m.fallecido_en is null
     and coalesce(u.ultima, m.creado_en) < now() - make_interval(months => p_meses)
   order by coalesce(u.ultima, m.creado_en);
end;
$$;

revoke execute on function public.pacientes_inactivos from public, anon;
grant execute on function public.pacientes_inactivos to authenticated;

-- ---------------------------------------------------------------------------
-- Económico — sólo el administrador
-- ---------------------------------------------------------------------------

create or replace function public.metricas_ventas(
  p_desde date default (current_date - interval '30 days')::date,
  p_hasta date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz := (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_hasta timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if not public.es_administrador() then
    raise exception 'Las métricas económicas son del administrador.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'facturado', coalesce(
      (select sum(o.total) from public.orden o
        where o.estado in ('pagada', 'entregada')
          and o.creado_en >= v_desde and o.creado_en < v_hasta), 0),
    'ordenes', (select count(*) from public.orden o
                 where o.estado in ('pagada', 'entregada')
                   and o.creado_en >= v_desde and o.creado_en < v_hasta),
    'por_medio', coalesce(
      (select jsonb_agg(jsonb_build_object('medio', medio, 'monto', monto) order by monto desc)
         from (select pg.medio, sum(pg.monto) as monto
                 from public.pago pg
                where pg.estado = 'aprobado'
                  and pg.creado_en >= v_desde and pg.creado_en < v_hasta
                group by pg.medio) m),
      '[]'::jsonb),
    'por_canal', coalesce(
      (select jsonb_agg(jsonb_build_object('canal', canal, 'monto', monto, 'ordenes', n)
                        order by monto desc)
         from (select o.canal, sum(o.total) as monto, count(*) as n
                 from public.orden o
                where o.estado in ('pagada', 'entregada')
                  and o.creado_en >= v_desde and o.creado_en < v_hasta
                group by o.canal) c),
      '[]'::jsonb),
    'productos', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'producto', descripcion, 'unidades', unidades, 'monto', monto)
              order by unidades desc)
         from (select oi.descripcion, sum(oi.cantidad) as unidades, sum(oi.subtotal) as monto
                 from public.orden_item oi
                 join public.orden o on o.id = oi.orden_id
                where o.estado in ('pagada', 'entregada')
                  and o.creado_en >= v_desde and o.creado_en < v_hasta
                group by oi.descripcion
                order by 2 desc
                limit 10) p),
      '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.metricas_ventas from public, anon;
grant execute on function public.metricas_ventas to authenticated;

-- Resumen de arriba del tablero: cuatro números que contestan "¿cómo venimos?".
create or replace function public.metricas_resumen(
  p_desde date default (current_date - interval '30 days')::date,
  p_hasta date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz := (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_hasta timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_turnos bigint;
  v_ausentes bigint;
begin
  if not public.es_personal_clinica() then
    raise exception 'Las métricas son del personal de la clínica.' using errcode = '42501';
  end if;

  select count(*) filter (where estado in ('atendido', 'ausente')),
         count(*) filter (where estado = 'ausente')
    into v_turnos, v_ausentes
    from public.turno
   where inicio >= v_desde and inicio < v_hasta;

  return jsonb_build_object(
    'pacientes_nuevos', (select count(*) from public.mascota
                          where creado_en >= v_desde and creado_en < v_hasta
                            and archivado_en is null),
    'consultas', (select count(*) from public.consulta
                   where fecha >= v_desde and fecha < v_hasta),
    'turnos_atendidos', coalesce(v_turnos - v_ausentes, 0),
    -- Sobre los turnos que llegaron a su hora, no sobre los cancelados con
    -- aviso: un turno cancelado a tiempo se puede reasignar, un ausente no.
    'ausentismo', case when coalesce(v_turnos, 0) = 0 then 0
                       else round(v_ausentes::numeric * 100 / v_turnos, 1) end,
    'recetas_emitidas', (select count(*) from public.receta
                          where emitida_en >= v_desde and emitida_en < v_hasta)
  );
end;
$$;

revoke execute on function public.metricas_resumen from public, anon;
grant execute on function public.metricas_resumen to authenticated;
