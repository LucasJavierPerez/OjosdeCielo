-- Editar los datos de contacto de un tutor, e historial de caja.
--
-- Dos huecos distintos que aparecieron usando el sistema:
--
-- 1. Recepción anota un teléfono mal y no había forma de corregirlo. Para los
--    tutores sin cuenta la tabla `contacto_tutor` ya lo permitía por RLS; para
--    los registrados, editar `perfil` era exclusivo del administrador, así que
--    el veterinario que atiende no podía arreglar un número equivocado.
--
-- 2. Los cierres de caja se guardaban desde la fase 7 —con monto declarado,
--    calculado, diferencia y quién cerró— pero no había pantalla que los
--    mostrara. El dato estaba; faltaba poder verlo.

/*
 * Datos de contacto de un tutor registrado.
 *
 * Va por RPC con lista blanca de columnas y no abriendo un UPDATE sobre
 * `perfil`: una política de UPDATE para todo el personal dejaría que
 * recepción tocara `roles` o `activo`, que es escalada de privilegios.
 *
 * El email queda deliberadamente afuera. En `perfil` es una copia del de
 * `auth.users`, que es con el que la persona entra: cambiarlo acá no cambiaría
 * su login, sólo desincronizaría las dos tablas y haría que el sistema muestre
 * un email con el que nadie puede ingresar. Si alguien cambió de correo, tiene
 * que hacerlo desde su cuenta.
 */
create or replace function public.actualizar_datos_tutor(
  p_perfil_id uuid,
  p_nombre    text,
  p_apellido  text,
  p_telefono  text default null,
  p_dni       text default null
)
returns public.perfil
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfil;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal de la clínica edita datos de un tutor.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'El nombre no puede quedar vacío.' using errcode = '22023';
  end if;

  select * into v_perfil from public.perfil where id = p_perfil_id;

  if v_perfil.id is null then
    raise exception 'No existe esa persona.' using errcode = 'P0002';
  end if;

  -- Editar los datos de un compañero de trabajo es otra cosa y va por la
  -- pantalla de Equipo, con las reglas de roles.
  if v_perfil.roles && array['recepcionista', 'veterinario', 'administrador']::public.rol[]
     and not public.es_administrador() then
    raise exception 'Los datos del personal los edita un administrador desde Equipo.'
      using errcode = '42501';
  end if;

  update public.perfil
     set nombre   = trim(p_nombre),
         apellido = trim(coalesce(p_apellido, '')),
         telefono = nullif(trim(coalesce(p_telefono, '')), ''),
         dni      = nullif(trim(coalesce(p_dni, '')), '')
   where id = p_perfil_id
  returning * into v_perfil;

  return v_perfil;
end;
$$;

revoke execute on function public.actualizar_datos_tutor from public, anon;
grant execute on function public.actualizar_datos_tutor to authenticated;

-- ---------------------------------------------------------------------------
-- Historial de cierres de caja
--
-- RLS filtra filas, no columnas: el nombre de quien abrió y cerró sale de
-- `perfil`, que recepción puede leer, pero se arma acá para no exponer el
-- resto de la tabla en una consulta desde el navegador.
-- ---------------------------------------------------------------------------

create or replace function public.historial_cajas(p_limite integer default 30)
returns table (
  id              uuid,
  abierto_en      timestamptz,
  cerrado_en      timestamptz,
  abierto_por     text,
  cerrado_por     text,
  monto_inicial   numeric,
  monto_calculado numeric,
  monto_declarado numeric,
  diferencia      numeric,
  notas           text,
  ingresos        numeric,
  egresos         numeric,
  ventas          bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.abierto_en,
         c.cerrado_en,
         a.nombre || ' ' || a.apellido,
         case when c.cerrado_por is not null then z.nombre || ' ' || z.apellido end,
         c.monto_inicial,
         c.monto_calculado,
         c.monto_declarado,
         c.diferencia,
         c.notas,
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0),
         count(distinct m.pago_id) filter (where m.pago_id is not null)
    from public.turno_caja c
    join public.perfil a on a.id = c.abierto_por
    left join public.perfil z on z.id = c.cerrado_por
    left join public.movimiento_caja m on m.turno_caja_id = c.id
   where c.cerrado_en is not null
   group by c.id, a.nombre, a.apellido, z.nombre, z.apellido
   order by c.cerrado_en desc
   limit greatest(p_limite, 1);
end;
$$;

revoke execute on function public.historial_cajas from public, anon;
grant execute on function public.historial_cajas to authenticated;

/*
 * Entradas y salidas de dinero por mes.
 *
 * Es del administrador, igual que metricas_ventas(): recepción opera la caja
 * del día y necesita ver los cierres para explicar una diferencia, pero
 * cuánto entró en el año es otra conversación.
 *
 * Se agrupa por mes en la zona de la clínica y no en UTC: agrupar el instante
 * crudo mete lo cobrado a las 21 h del 31 en el mes siguiente.
 */
create or replace function public.flujo_caja_mensual(p_meses integer default 12)
returns table (
  mes            date,
  ingresos       numeric,
  egresos        numeric,
  neto           numeric,
  efectivo       numeric,
  otros_medios   numeric,
  movimientos    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_zona text := 'America/Argentina/Buenos_Aires';
  v_desde date;
begin
  if not public.es_administrador() then
    raise exception 'El movimiento de dinero por mes es del administrador.'
      using errcode = '42501';
  end if;

  v_desde := date_trunc('month', current_date)::date
             - make_interval(months => greatest(p_meses, 1) - 1);

  return query
  select d::date,
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0)
           - coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso' and m.medio = 'efectivo'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso' and m.medio <> 'efectivo'), 0),
         count(m.id)
    -- generate_series y no group by sobre los movimientos: un mes sin
    -- movimiento tiene que aparecer en cero, si no el gráfico miente uniendo
    -- dos meses no consecutivos.
    from generate_series(v_desde, date_trunc('month', current_date)::date, interval '1 month') d
    left join public.movimiento_caja m
      on date_trunc('month', m.creado_en at time zone v_zona)::date = d::date
   group by d
   order by d;
end;
$$;

revoke execute on function public.flujo_caja_mensual from public, anon;
grant execute on function public.flujo_caja_mensual to authenticated;

-- ---------------------------------------------------------------------------
-- Datos de contacto del paciente, para el panel
--
-- Función aparte y NO campos nuevos en tutores_de_mascota(): esa la usa
-- también la app del tutor para ver con quién comparte la mascota, y sumarle
-- el teléfono la convertiría en una agenda de contactos ajenos. El test 22
-- guarda justamente esa forma.
--
-- Junta los dos mundos en una sola respuesta: los tutores con cuenta y el
-- contacto suelto de quien todavía no la tiene.
-- ---------------------------------------------------------------------------

create or replace function public.contactos_del_paciente(p_mascota_id uuid)
returns table (
  id         uuid,
  perfil_id  uuid,
  registrado boolean,
  rol_tutor  public.rol_tutor,
  nombre     text,
  apellido   text,
  email      text,
  telefono   text,
  dni        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_personal_clinica() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select mt.id, p.id, true, mt.rol, p.nombre, p.apellido, p.email, p.telefono, p.dni
    from public.mascota_tutor mt
    join public.perfil p on p.id = mt.perfil_id
   where mt.mascota_id = p_mascota_id
     and mt.revocado_en is null

  union all

  -- El contacto sin cuenta sólo mientras no se haya vinculado: una vez que la
  -- persona se registra, sus datos viven en perfil y aparecerían dos veces.
  select c.id, null, false, null, c.nombre, c.apellido, c.email, c.telefono, c.dni
    from public.contacto_tutor c
   where c.mascota_id = p_mascota_id
     and c.vinculado_en is null;
end;
$$;

revoke execute on function public.contactos_del_paciente from public, anon;
grant execute on function public.contactos_del_paciente to authenticated;
