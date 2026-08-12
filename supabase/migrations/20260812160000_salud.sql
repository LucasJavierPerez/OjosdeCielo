-- Datos de salud con doble origen (docs/stack.md, Decisión 13).
--
-- Tutor y veterinario cargan en paralelo, y conviven en la misma línea de
-- tiempo distinguidos por `origen`. Esta es la decisión que hace que la app
-- tenga valor sin que la clínica haya migrado un solo dato.

create type public.origen_dato as enum ('tutor', 'clinica');

create type public.tipo_aplicacion as enum (
  'vacuna',
  'desparasitacion_interna',
  'desparasitacion_externa'
);

create type public.tipo_antecedente as enum (
  'alergia',
  'cirugia',
  'patologia_cronica',
  'otro'
);

-- ---------------------------------------------------------------------------
-- Integridad del origen
--
-- El origen NO viaja desde el cliente: lo fija el servidor según quién escribe.
-- Si dependiera de un campo enviado por la app, cualquiera podría hacer pasar
-- un dato propio por "registrado por la clínica".
-- ---------------------------------------------------------------------------

create or replace function public.fijar_origen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.cargado_por    := auth.uid();
  new.origen         := case when public.es_personal_clinica() then 'clinica'::public.origen_dato
                             else 'tutor'::public.origen_dato end;
  -- Nada nace verificado: verificar es un acto posterior de un profesional.
  new.verificado_por := null;
  new.verificado_en  := null;
  return new;
end;
$$;

/*
 * Bloquea los cambios en las columnas que definen la procedencia del dato.
 *
 * `verificado_por` sólo puede moverlo verificar_registro(), que levanta el flag
 * de sesión `ojosdecielo.verificando`. Es un flag local a la transacción
 * (tercer parámetro de set_config en true), así que no persiste ni se puede
 * activar desde el cliente: PostgREST no expone set_config.
 */
create or replace function public.proteger_origen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.origen is distinct from old.origen then
    raise exception 'El origen de un registro no se puede cambiar' using errcode = '42501';
  end if;

  if new.cargado_por is distinct from old.cargado_por then
    raise exception 'No se puede cambiar quién cargó el registro' using errcode = '42501';
  end if;

  if new.verificado_por is distinct from old.verificado_por
     and coalesce(current_setting('ojosdecielo.verificando', true), 'off') <> 'on' then
    raise exception 'La verificación se hace con verificar_registro()' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Peso
-- ---------------------------------------------------------------------------

create table public.peso_registro (
  id             uuid primary key default gen_random_uuid(),
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  fecha          date not null default current_date check (fecha <= current_date),
  peso_kg        numeric(6,3) not null check (peso_kg > 0 and peso_kg < 1000),
  nota           text,
  origen         public.origen_dato not null default 'tutor',
  cargado_por    uuid not null default auth.uid() references public.perfil(id),
  verificado_por uuid references public.perfil(id),
  verificado_en  timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index peso_registro_mascota_idx on public.peso_registro (mascota_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Vacunas y desparasitaciones
-- ---------------------------------------------------------------------------

create table public.aplicacion (
  id             uuid primary key default gen_random_uuid(),
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  tipo           public.tipo_aplicacion not null,
  producto       text,
  lote           text,
  fecha          date not null default current_date check (fecha <= current_date),
  proxima_fecha  date,
  nota           text,
  origen         public.origen_dato not null default 'tutor',
  cargado_por    uuid not null default auth.uid() references public.perfil(id),
  verificado_por uuid references public.perfil(id),
  verificado_en  timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz,

  constraint proxima_posterior check (proxima_fecha is null or proxima_fecha > fecha)
);

create index aplicacion_mascota_idx on public.aplicacion (mascota_id, fecha desc);

-- Índice del motor de recordatorios de la fase 3: buscar qué vence pronto.
create index aplicacion_proxima_idx on public.aplicacion (proxima_fecha)
  where proxima_fecha is not null;

comment on column public.aplicacion.proxima_fecha is
  'Dispara los recordatorios. Funcione o no el panel de la clínica: es lo que da valor a la app desde el día uno.';

-- ---------------------------------------------------------------------------
-- Antecedentes: alergias, cirugías, patologías crónicas
-- ---------------------------------------------------------------------------

create table public.antecedente (
  id             uuid primary key default gen_random_uuid(),
  mascota_id     uuid not null references public.mascota(id) on delete cascade,
  tipo           public.tipo_antecedente not null,
  descripcion    text not null check (length(trim(descripcion)) > 0),
  fecha          date,
  activo         boolean not null default true,
  origen         public.origen_dato not null default 'tutor',
  cargado_por    uuid not null default auth.uid() references public.perfil(id),
  verificado_por uuid references public.perfil(id),
  verificado_en  timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index antecedente_mascota_idx on public.antecedente (mascota_id) where activo;

comment on table public.antecedente is
  'La misma alergia cargada por el tutor se muestra como reportada; por el veterinario, como diagnosticada. La distinción sale de `origen`.';

-- ---------------------------------------------------------------------------
-- Medicación en curso
-- ---------------------------------------------------------------------------

create table public.medicacion_en_curso (
  id               uuid primary key default gen_random_uuid(),
  mascota_id       uuid not null references public.mascota(id) on delete cascade,
  descripcion      text not null check (length(trim(descripcion)) > 0),
  dosis            text,
  frecuencia_horas integer check (frecuencia_horas > 0 and frecuencia_horas <= 720),
  desde            date not null default current_date,
  hasta            date,
  recordar         boolean not null default false,
  origen           public.origen_dato not null default 'tutor',
  cargado_por      uuid not null default auth.uid() references public.perfil(id),
  verificado_por   uuid references public.perfil(id),
  verificado_en    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz,

  constraint hasta_posterior check (hasta is null or hasta >= desde)
);

create index medicacion_mascota_idx on public.medicacion_en_curso (mascota_id);

-- ---------------------------------------------------------------------------
-- Triggers y RLS, iguales para las cuatro tablas
--
-- Se generan en bucle para que ninguna quede sin alguna de las piezas. Una
-- tabla de salud sin RLS o sin el trigger de origen es un incidente.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso']
  loop
    execute format('create trigger %1$I_fijar_origen before insert on public.%1$I
                    for each row execute function public.fijar_origen()', t);

    execute format('create trigger %1$I_proteger_origen before update on public.%1$I
                    for each row execute function public.proteger_origen()', t);

    execute format('create trigger %1$I_actualizado_en before update on public.%1$I
                    for each row execute function public.set_actualizado_en()', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- Lectura: los tutores de la mascota y el personal de la clínica.
    execute format($f$create policy "tutores y personal leen" on public.%I for select to authenticated
                      using (public.es_tutor_de(mascota_id) or public.es_personal_clinica())$f$, t);

    -- Alta: quien tenga acceso a la mascota. El origen lo fija el trigger, así
    -- que la política no necesita verificarlo.
    execute format($f$create policy "tutores y personal cargan" on public.%I for insert to authenticated
                      with check (public.es_tutor_de(mascota_id) or public.es_personal_clinica())$f$, t);

    -- Edición y borrado: cada uno lo suyo. El tutor sólo lo que él cargó; el
    -- personal sólo lo registrado por la clínica. Nadie reescribe al otro.
    execute format($f$create policy "cada uno edita lo suyo" on public.%I for update to authenticated
                      using (
                        (origen = 'tutor' and cargado_por = auth.uid() and public.es_tutor_de(mascota_id))
                        or (origen = 'clinica' and public.es_personal_clinica())
                      )
                      with check (
                        (origen = 'tutor' and cargado_por = auth.uid() and public.es_tutor_de(mascota_id))
                        or (origen = 'clinica' and public.es_personal_clinica())
                      )$f$, t);

    execute format($f$create policy "cada uno borra lo suyo" on public.%I for delete to authenticated
                      using (
                        (origen = 'tutor' and cargado_por = auth.uid() and public.es_tutor_de(mascota_id))
                        or (origen = 'clinica' and public.es_personal_clinica())
                      )$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación profesional
--
-- Un veterinario puede confirmar un dato reportado por el tutor. Verificarlo
-- NO lo convierte en dato de la clínica: `origen` no cambia nunca.
--
-- Va por RPC con lista blanca de tablas en vez de una política de UPDATE
-- porque RLS no distingue columnas: abrir el UPDATE al personal sobre filas
-- del tutor le permitiría además reescribir el peso o la fecha.
-- ---------------------------------------------------------------------------

create or replace function public.verificar_registro(p_tabla text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mascota_id uuid;
begin
  if p_tabla not in ('peso_registro', 'aplicacion', 'antecedente', 'medicacion_en_curso') then
    raise exception 'Tabla no verificable: %', p_tabla using errcode = '22023';
  end if;

  if not public.es_veterinario() then
    raise exception 'Sólo un veterinario puede verificar un registro' using errcode = '42501';
  end if;

  -- Habilita el trigger a aceptar el cambio en verificado_por. Local a la
  -- transacción y no alcanzable desde PostgREST.
  perform set_config('ojosdecielo.verificando', 'on', true);

  -- %I escapa el identificador; la lista blanca de arriba ya acota los valores
  -- posibles, pero se escapa igual por disciplina.
  execute format(
    'update public.%I set verificado_por = $1, verificado_en = now()
      where id = $2 and origen = ''tutor'' and verificado_por is null
      returning mascota_id', p_tabla)
  using auth.uid(), p_id
  into v_mascota_id;

  perform set_config('ojosdecielo.verificando', 'off', true);

  if v_mascota_id is null then
    raise exception 'El registro no existe, no es del tutor, o ya está verificado'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.verificar_registro from public, anon;
grant execute on function public.verificar_registro to authenticated;

-- Realtime: la línea de tiempo de salud es compartida entre tutores.
alter table public.peso_registro replica identity full;
alter table public.aplicacion replica identity full;

alter publication supabase_realtime add table public.peso_registro;
alter publication supabase_realtime add table public.aplicacion;
