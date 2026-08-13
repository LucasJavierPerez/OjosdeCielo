-- Límite de intentos en las páginas públicas.
--
-- Hay exactamente dos puertas abiertas sin cuenta: el QR de extravío
-- (/m/:token) y la verificación de recetas (/r/:codigo). Las dos reciben un
-- código y devuelven datos.
--
-- Hasta acá la única defensa era la longitud del código. Alcanza contra la
-- adivinación —16 bytes al azar no se aciertan— pero no contra alguien que
-- tiene una lista de códigos reales, ni deja rastro de que lo intentó.
--
-- Se cuentan intentos por IP y por hora. La IP la da PostgREST en el header
-- que reenvía el proxy de Supabase; si no llega, se cuenta como una sola IP
-- desconocida, que es el lado conservador del error: sin IP el límite es más
-- estricto, no más laxo.

create table public.intento_publico (
  id        bigserial primary key,
  origen    text not null,
  ip        text not null,
  acierto   boolean not null,
  creado_en timestamptz not null default now()
);

create index intento_publico_ventana_idx
  on public.intento_publico (origen, ip, creado_en desc);

comment on table public.intento_publico is
  'Registro de consultas a las páginas públicas. Sirve para dos cosas: cortar '
  'un barrido y poder mirar después si alguien lo intentó.';

alter table public.intento_publico enable row level security;
grant select on public.intento_publico to authenticated;

-- Nadie escribe acá desde afuera: las filas las pone la función que verifica.
create policy "el personal ve los intentos"
  on public.intento_publico for select
  to authenticated
  using (public.es_personal_clinica());

/*
 * Registra el intento y dice si hay que cortar.
 *
 * Devuelve true cuando se pasó del límite. Cuenta los FALLIDOS de la última
 * hora, no todos: alguien que escanea diez QR válidos de mascotas que
 * encontró no está haciendo nada malo; alguien que prueba treinta códigos
 * inexistentes, sí.
 */
create or replace function public.registrar_intento_publico(
  p_origen  text,
  p_acierto boolean,
  p_limite  integer default 20
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip      text;
  v_fallidos integer;
begin
  v_ip := coalesce(
    -- El primero de la lista es el cliente; el resto son los proxies.
    split_part(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
      ',', 1
    ),
    'desconocida'
  );
  v_ip := nullif(trim(v_ip), '');
  if v_ip is null then v_ip := 'desconocida'; end if;

  insert into public.intento_publico (origen, ip, acierto)
  values (p_origen, v_ip, p_acierto);

  select count(*) into v_fallidos
    from public.intento_publico
   where origen = p_origen
     and ip = v_ip
     and not acierto
     and creado_en > now() - interval '1 hour';

  return v_fallidos > p_limite;
end;
$$;

revoke execute on function public.registrar_intento_publico from public, anon, authenticated;

-- Limpieza: el registro sirve para la ventana de una hora y para mirar un
-- incidente reciente. Guardar meses de esto no aporta nada y son datos de
-- tránsito de personas.
create or replace function public.limpiar_intentos_publicos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  delete from public.intento_publico where creado_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.limpiar_intentos_publicos from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Las dos funciones públicas, ahora con límite
-- ---------------------------------------------------------------------------

create or replace function public.mascota_por_qr(p_token text)
returns table (
  nombre           text,
  especie          public.especie,
  raza             text,
  foto_url         text,
  perdida          boolean,
  perdida_desde    timestamptz,
  nota_extravio    text,
  contacto_nombre  text,
  contacto_telefono text,
  clinica_nombre   text,
  clinica_telefono text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existe  boolean;
  v_cortar  boolean;
begin
  select exists (
    select 1 from public.mascota_token_qr q
      join public.mascota m on m.id = q.mascota_id
     where q.token = p_token and q.activo and m.archivado_en is null
  ) into v_existe;

  v_cortar := public.registrar_intento_publico('qr', v_existe);

  -- Se corta después de registrar, para que el intento quede contado igual.
  if v_cortar then
    raise exception 'Demasiados intentos. Probá de nuevo en un rato.'
      using errcode = '53400';
  end if;

  if not v_existe then
    return;
  end if;

  return query
  select m.nombre,
         m.especie,
         m.raza,
         m.foto_url,
         m.perdida_desde is not null,
         m.perdida_desde,
         case when m.perdida_desde is not null then m.nota_extravio end,
         -- Sólo el nombre de pila, y sólo si está perdida.
         case when m.perdida_desde is not null then t.nombre end,
         case when m.perdida_desde is not null then t.telefono end,
         -- La clínica siempre: es un contacto institucional, no personal, y
         -- da a dónde llevar al animal aunque el tutor no atienda.
         c.nombre,
         c.telefono
    from public.mascota_token_qr q
    join public.mascota m on m.id = q.mascota_id
    cross join public.configuracion_clinica c
    left join lateral (
      select p.nombre, p.telefono
        from public.mascota_tutor mt
        join public.perfil p on p.id = mt.perfil_id
       where mt.mascota_id = m.id and mt.revocado_en is null
       order by case when mt.rol = 'titular' then 0 else 1 end
       limit 1
    ) t on true
   where q.token = p_token
     and q.activo
     and m.archivado_en is null;
end;
$$;

grant execute on function public.mascota_por_qr to anon, authenticated;

create or replace function public.verificar_receta(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
    'codigo',         r.codigo,
    'estado',         r.estado,
    'vencida',        r.vence_el < current_date,
    'emitida_en',     r.emitida_en,
    'vence_el',       r.vence_el,
    'diagnostico',    r.diagnostico,
    'indicaciones',   r.indicaciones,
    'motivo_anulacion', r.motivo_anulacion,
    'mascota',        m.nombre,
    'especie',        m.especie,
    'profesional',    p.nombre || ' ' || p.apellido,
    'matricula',      pr.matricula,
    'clinica',        c.nombre,
    'clinica_telefono', c.telefono,
    'items', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'descripcion', i.descripcion,
                  'cantidad',    i.cantidad,
                  'dosis',       i.dosis,
                  'duracion',    i.duracion
                ) order by i.orden)
         from public.receta_item i where i.receta_id = r.id),
      '[]'::jsonb)
  )
    into v_resultado
    from public.receta r
    join public.mascota m on m.id = r.mascota_id
    join public.perfil p on p.id = r.profesional_id
    left join public.profesional pr on pr.perfil_id = p.id
    cross join public.configuracion_clinica c
   where upper(trim(r.codigo)) = upper(trim(p_codigo));

  if public.registrar_intento_publico('receta', v_resultado is not null) then
    raise exception 'Demasiados intentos. Probá de nuevo en un rato.'
      using errcode = '53400';
  end if;

  return v_resultado;
end;
$$;

grant execute on function public.verificar_receta to anon, authenticated;

-- Una vez por día alcanza: lo que se borra tiene 30 días.
select cron.schedule(
  'limpiar-intentos-publicos',
  '30 4 * * *',
  $$select public.limpiar_intentos_publicos()$$
);
