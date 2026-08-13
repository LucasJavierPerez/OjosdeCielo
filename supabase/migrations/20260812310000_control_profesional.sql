-- El veterinario toma control clínico del paciente.
--
-- Hasta acá el profesional podía cargar y corregir lo suyo, pero frente a un
-- dato equivocado del tutor —"13,1 kg" en un gato— sólo podía mirar. La curva
-- de peso quedaba arruinada y no había forma de arreglarla.
--
-- La salida NO es dejar que el veterinario reescriba lo que dijo el tutor: eso
-- destruye la distinción de origen sobre la que se apoya todo el modelo, y
-- convierte en mentira la etiqueta "reportado por el tutor". Lo que se agrega
-- es descartar: el registro queda, con quién lo descartó y por qué, deja de
-- contar para curvas y alertas, y el tutor ve la explicación.
--
-- Dicho de otro modo: el profesional manda sobre la lectura clínica de los
-- datos, no sobre el registro de quién dijo qué.

do $$
declare
  t text;
begin
  foreach t in array array['peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso']
  loop
    execute format('alter table public.%I
                      add column descartado_en timestamptz,
                      add column descartado_por uuid references public.perfil(id),
                      add column motivo_descarte text', t);

    execute format($f$comment on column public.%I.descartado_en is
      'Cuando está marcado, el registro no cuenta para curvas, alertas ni línea '
      'de tiempo. No se borra: el tutor lo reportó y eso pasó.'$f$, t);

    execute format('create index %1$I_vigentes_idx on public.%1$I (mascota_id)
                      where descartado_en is null', t);
  end loop;
end $$;

/*
 * Descartar un registro reportado por el tutor.
 *
 * Lista blanca de tablas, igual que verificar_registro(): con format(%I) y una
 * tabla que viene del cliente, sin lista blanca esto sería inyección de SQL.
 */
create or replace function public.descartar_registro(
  p_tabla  text,
  p_id     uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Descartar un dato de salud es una decisión profesional.'
      using errcode = '42501';
  end if;

  if p_tabla not in ('peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso') then
    raise exception 'Tabla no permitida' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Descartar un dato necesita un motivo: el tutor lo va a leer.'
      using errcode = '22023';
  end if;

  execute format(
    'update public.%I
        set descartado_en = now(), descartado_por = $1, motivo_descarte = $2
      where id = $3 and descartado_en is null
      returning mascota_id', p_tabla)
    into v_mascota
    using auth.uid(), trim(p_motivo), p_id;

  if v_mascota is null then
    raise exception 'No encontramos ese registro, o ya estaba descartado.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.descartar_registro from public, anon;
grant execute on function public.descartar_registro to authenticated;

/*
 * Deshacer. Un descarte por error no puede ser definitivo.
 */
create or replace function public.restaurar_registro(p_tabla text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Restaurar un dato de salud es una decisión profesional.'
      using errcode = '42501';
  end if;

  if p_tabla not in ('peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso') then
    raise exception 'Tabla no permitida' using errcode = '42501';
  end if;

  execute format(
    'update public.%I
        set descartado_en = null, descartado_por = null, motivo_descarte = null
      where id = $1 and descartado_en is not null
      returning mascota_id', p_tabla)
    into v_mascota
    using p_id;

  if v_mascota is null then
    raise exception 'Ese registro no estaba descartado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.restaurar_registro from public, anon;
grant execute on function public.restaurar_registro to authenticated;

/*
 * El descarte sólo se toca por RPC.
 *
 * Sin esto, la política "cada uno edita lo suyo" dejaría que el propio tutor
 * se descarte un registro sin motivo, o que lo restaure después de que el
 * profesional lo descartó. Mismo mecanismo de flag de transacción que usa
 * verificar_registro(): set_config con el tercer parámetro en true no persiste
 * y PostgREST no lo expone.
 */
create or replace function public.proteger_descarte()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.descartado_en is distinct from old.descartado_en
      or new.descartado_por is distinct from old.descartado_por
      or new.motivo_descarte is distinct from old.motivo_descarte)
     and coalesce(current_setting('ojosdecielo.descartando', true), 'off') <> 'on' then
    raise exception 'El descarte se maneja con descartar_registro() y restaurar_registro().'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso']
  loop
    execute format('create trigger %1$I_proteger_descarte before update on public.%1$I
                    for each row execute function public.proteger_descarte()', t);
  end loop;
end $$;

-- Las dos RPC levantan el flag. Se redefinen enteras porque el flag tiene que
-- prenderse dentro de la misma transacción que el UPDATE.
create or replace function public.descartar_registro(
  p_tabla  text,
  p_id     uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Descartar un dato de salud es una decisión profesional.'
      using errcode = '42501';
  end if;

  if p_tabla not in ('peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso') then
    raise exception 'Tabla no permitida' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Descartar un dato necesita un motivo: el tutor lo va a leer.'
      using errcode = '22023';
  end if;

  perform set_config('ojosdecielo.descartando', 'on', true);

  execute format(
    'update public.%I
        set descartado_en = now(), descartado_por = $1, motivo_descarte = $2
      where id = $3 and descartado_en is null
      returning mascota_id', p_tabla)
    into v_mascota
    using auth.uid(), trim(p_motivo), p_id;

  if v_mascota is null then
    raise exception 'No encontramos ese registro, o ya estaba descartado.'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restaurar_registro(p_tabla text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota uuid;
begin
  if not public.es_veterinario() then
    raise exception 'Restaurar un dato de salud es una decisión profesional.'
      using errcode = '42501';
  end if;

  if p_tabla not in ('peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso') then
    raise exception 'Tabla no permitida' using errcode = '42501';
  end if;

  perform set_config('ojosdecielo.descartando', 'on', true);

  execute format(
    'update public.%I
        set descartado_en = null, descartado_por = null, motivo_descarte = null
      where id = $1 and descartado_en is not null
      returning mascota_id', p_tabla)
    into v_mascota
    using p_id;

  if v_mascota is null then
    raise exception 'Ese registro no estaba descartado.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo descartado sale de la línea de tiempo
-- ---------------------------------------------------------------------------

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
     where a.mascota_id = p_mascota_id and a.descartado_en is null

    union all
    select 'peso',
           w.id,
           w.fecha,
           null,
           'Peso',
           trim(to_char(w.peso_kg, 'FM999990.999')) || ' kg',
           w.origen
      from public.peso_registro w
     where w.mascota_id = p_mascota_id and w.descartado_en is null

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
     where an.mascota_id = p_mascota_id and an.activo and an.descartado_en is null

    union all
    select 'medicacion',
           me.id,
           me.desde,
           null,
           'Medicación',
           me.descripcion || coalesce(' · ' || me.dosis, ''),
           me.origen
      from public.medicacion_en_curso me
     where me.mascota_id = p_mascota_id and me.descartado_en is null

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

-- ---------------------------------------------------------------------------
-- Y de los recordatorios
--
-- Una vacuna descartada no debe seguir generando avisos de "le toca la
-- próxima": es justamente el dato que el profesional dijo que no vale.
-- ---------------------------------------------------------------------------

create or replace function public.generar_recordatorios(
  p_dias_antes  integer default 7,
  p_aviso_previo integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creados integer := 0;
begin
  -- Vacunas y desparasitaciones que vencen dentro de la ventana.
  --
  -- El aviso se programa unos días ANTES del vencimiento: enterarse el mismo
  -- día no le da margen al tutor para sacar turno. Si la fecha ya pasó, el
  -- greatest() lo manda para hoy en vez de a una fecha del pasado.
  with nuevos as (
    insert into public.recordatorio (mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo)
    select a.mascota_id,
           case when a.tipo = 'vacuna' then 'vacuna'::public.tipo_notificacion
                else 'desparasitacion'::public.tipo_notificacion end,
           greatest(a.proxima_fecha - p_aviso_previo, current_date),
           'aplicacion',
           a.id,
           case when a.tipo = 'vacuna' then 'Vacuna de ' || m.nombre
                else 'Desparasitación de ' || m.nombre end,
           case when a.tipo = 'vacuna'
                then 'Le toca la vacuna' || coalesce(' (' || a.producto || ')', '') ||
                     ' el ' || to_char(a.proxima_fecha, 'DD/MM') || '.'
                else 'Le toca la desparasitación' || coalesce(' (' || a.producto || ')', '') ||
                     ' el ' || to_char(a.proxima_fecha, 'DD/MM') || '.' end
      from public.aplicacion a
      join public.mascota m on m.id = a.mascota_id
     where a.proxima_fecha is not null
       -- Una vacuna descartada por el profesional no sigue avisando: es
       -- justamente el dato que dijo que no vale.
       and a.descartado_en is null
       and a.proxima_fecha between current_date and current_date + p_dias_antes
       and m.archivado_en is null
       and m.fallecido_en is null
    on conflict (origen_tabla, origen_id, programado_para) do nothing
    returning 1
  )
  select count(*) into v_creados from nuevos;

  -- Medicación que termina pronto, para quien pidió que se le recuerde.
  with nuevos as (
    insert into public.recordatorio (mascota_id, tipo, programado_para, origen_tabla, origen_id, titulo, cuerpo)
    select mc.mascota_id,
           'medicacion',
           greatest(mc.hasta - p_aviso_previo, current_date),
           'medicacion_en_curso',
           mc.id,
           'Medicación de ' || m.nombre,
           mc.descripcion || ' termina el ' || to_char(mc.hasta, 'DD/MM') || '.'
      from public.medicacion_en_curso mc
      join public.mascota m on m.id = mc.mascota_id
     where mc.recordar
       and mc.descartado_en is null
       and mc.hasta is not null
       and mc.hasta between current_date and current_date + p_dias_antes
       and m.archivado_en is null
       and m.fallecido_en is null
    on conflict (origen_tabla, origen_id, programado_para) do nothing
    returning 1
  )
  select v_creados + count(*) into v_creados from nuevos;

  return v_creados;
end;
$$;
