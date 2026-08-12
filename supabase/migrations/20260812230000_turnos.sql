-- Agenda y turnos (fase 5).
--
-- Primera fase que exige participación diaria de la clínica.
--
-- Dos decisiones que sostienen todo lo demás:
--   1. Los slots disponibles se CALCULAN, no se almacenan. Materializar la
--      grilla obliga a mantenerla sincronizada con vacaciones, feriados y
--      cambios de horario, y siempre se desincroniza.
--   2. El anti-sobreturno vive en la base con una constraint de exclusión.
--      Validar sólo en la aplicación pierde ante dos solicitudes simultáneas.

create type public.estado_turno as enum (
  'solicitado',
  'confirmado',
  'en_curso',
  'atendido',
  'cancelado',
  'ausente'
);

-- ---------------------------------------------------------------------------
-- Especialidades
-- ---------------------------------------------------------------------------

create table public.especialidad (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null unique check (length(trim(nombre)) > 0),
  duracion_min        integer not null default 30 check (duracion_min between 5 and 480),
  requiere_sena       boolean not null default false,
  monto_sena          numeric(12,2) check (monto_sena is null or monto_sena >= 0),
  activa              boolean not null default true,
  creado_en           timestamptz not null default now()
);

alter table public.especialidad enable row level security;
grant select on public.especialidad to authenticated;
grant insert, update on public.especialidad to authenticated;

-- Los clientes necesitan verlas para poder elegir al sacar turno.
create policy "todos ven las especialidades activas"
  on public.especialidad for select
  to authenticated
  using (activa or public.es_personal_clinica());

create policy "administracion gestiona especialidades"
  on public.especialidad for all
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- ---------------------------------------------------------------------------
-- Profesionales
-- ---------------------------------------------------------------------------

create table public.profesional (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null unique references public.perfil(id) on delete cascade,
  matricula      text,
  color_agenda   text not null default '#2563eb',
  acepta_turnos  boolean not null default true,
  creado_en      timestamptz not null default now()
);

alter table public.profesional enable row level security;
grant select on public.profesional to authenticated;
grant insert, update, delete on public.profesional to authenticated;

create policy "todos ven los profesionales que atienden"
  on public.profesional for select
  to authenticated
  using (acepta_turnos or public.es_personal_clinica());

create policy "administracion gestiona profesionales"
  on public.profesional for all
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- ---------------------------------------------------------------------------
-- Disponibilidad semanal
--
-- Plantilla, no fechas concretas: "los martes de 9 a 13". Los slots del día se
-- derivan de acá menos los bloqueos y los turnos ya tomados.
-- ---------------------------------------------------------------------------

create table public.disponibilidad (
  id             uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesional(id) on delete cascade,
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  hora_inicio    time not null,
  hora_fin       time not null,
  vigente_desde  date not null default current_date,
  vigente_hasta  date,

  constraint franja_valida check (hora_fin > hora_inicio),
  constraint vigencia_valida check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on column public.disponibilidad.dia_semana is
  '0 = domingo, como devuelve extract(dow) en Postgres.';

create index disponibilidad_profesional_idx on public.disponibilidad (profesional_id, dia_semana);

alter table public.disponibilidad enable row level security;
grant select, insert, update, delete on public.disponibilidad to authenticated;

create policy "todos leen la disponibilidad"
  on public.disponibilidad for select
  to authenticated
  using (true);

create policy "personal gestiona la disponibilidad"
  on public.disponibilidad for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Bloqueos: vacaciones, feriados, ausencias
-- ---------------------------------------------------------------------------

create table public.bloqueo_agenda (
  id             uuid primary key default gen_random_uuid(),
  profesional_id uuid references public.profesional(id) on delete cascade,
  desde          timestamptz not null,
  hasta          timestamptz not null,
  motivo         text,
  creado_en      timestamptz not null default now(),

  constraint rango_valido check (hasta > desde)
);

comment on column public.bloqueo_agenda.profesional_id is
  'Nulo = bloquea a toda la clínica (feriado, corte de luz).';

create index bloqueo_agenda_rango_idx on public.bloqueo_agenda using gist (
  tstzrange(desde, hasta)
);

alter table public.bloqueo_agenda enable row level security;
grant select, insert, update, delete on public.bloqueo_agenda to authenticated;

create policy "todos leen los bloqueos"
  on public.bloqueo_agenda for select
  to authenticated
  using (true);

create policy "personal gestiona los bloqueos"
  on public.bloqueo_agenda for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------------

create table public.turno (
  id              uuid primary key default gen_random_uuid(),
  mascota_id      uuid not null references public.mascota(id) on delete cascade,
  profesional_id  uuid not null references public.profesional(id),
  especialidad_id uuid not null references public.especialidad(id),
  inicio          timestamptz not null,
  fin             timestamptz not null,
  estado          public.estado_turno not null default 'solicitado',
  motivo          text,
  notas_internas  text,
  solicitado_por  uuid not null default auth.uid() references public.perfil(id),
  cancelado_en    timestamptz,
  cancelado_por   uuid references public.perfil(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz,

  constraint turno_rango_valido check (fin > inicio)
);

comment on column public.turno.solicitado_por is
  'Cuál de los tutores lo pidió. Cualquiera puede cancelarlo, pero queda constancia de quién hizo qué.';

comment on column public.turno.notas_internas is
  'Sólo para el personal. La política de lectura del cliente usa una vista sin esta columna.';

/*
 * Anti-sobreturno.
 *
 * Constraint de exclusión sobre el rango horario por profesional: la base
 * rechaza dos turnos superpuestos aunque lleguen en el mismo instante. Validar
 * en la aplicación no alcanza, porque dos requests concurrentes leen ambos que
 * el horario está libre antes de que cualquiera escriba.
 *
 * Los cancelados no cuentan: el WHERE los excluye para que su horario se libere.
 */
alter table public.turno add constraint turno_sin_superposicion
  exclude using gist (
    profesional_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelado', 'ausente'));

create index turno_mascota_idx on public.turno (mascota_id, inicio desc);
create index turno_agenda_idx on public.turno (profesional_id, inicio)
  where estado not in ('cancelado', 'ausente');

create trigger turno_actualizado_en
  before update on public.turno
  for each row execute function public.set_actualizado_en();

alter table public.turno enable row level security;
grant select, update on public.turno to authenticated;

create policy "tutores ven los turnos de su mascota"
  on public.turno for select
  to authenticated
  using (public.es_tutor_de(mascota_id) or public.es_personal_clinica());

-- Sin INSERT directo: el alta va por solicitar_turno(), que valida
-- disponibilidad y bloqueos. Un insert libre permitiría turnos a las 3 AM.
create policy "personal gestiona los turnos"
  on public.turno for update
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());
