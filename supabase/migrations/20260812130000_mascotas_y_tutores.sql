-- Mascotas y el modelo de acceso compartido (docs/stack.md, Decisión 12).
--
-- Una mascota puede tener varios tutores. NO existe mascota.cliente_id: la
-- propiedad se resuelve por la tabla de unión mascota_tutor, y todas las
-- políticas RLS de datos de mascota pasan por ahí. Es el punto único de falla
-- del aislamiento entre clientes de todo el sistema.

create type public.especie as enum ('perro', 'gato', 'ave', 'roedor', 'reptil', 'otro');
create type public.sexo_mascota as enum ('macho', 'hembra', 'desconocido');
create type public.rol_tutor as enum ('titular', 'tutor');

-- ---------------------------------------------------------------------------
-- Mascota
-- ---------------------------------------------------------------------------

create table public.mascota (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (length(trim(nombre)) > 0),
  especie           public.especie not null,
  raza              text,
  sexo              public.sexo_mascota not null default 'desconocido',
  fecha_nacimiento  date check (fecha_nacimiento <= current_date),
  castrado          boolean,
  color             text,
  foto_url          text,
  microchip         text,
  fallecido_en      date,
  archivado_en      timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz
);

create index mascota_microchip_idx on public.mascota (microchip) where microchip is not null;

create trigger mascota_actualizado_en
  before update on public.mascota
  for each row execute function public.set_actualizado_en();

-- ---------------------------------------------------------------------------
-- Tutores de la mascota
--
-- Referencia perfil directamente y no una tabla `cliente` intermedia: esa tabla
-- (dirección, notas internas, saldo) recién hace falta cuando exista el panel
-- clínico. Meterla ahora agregaría un JOIN a cada política RLS del sistema a
-- cambio de nada.
-- ---------------------------------------------------------------------------

create table public.mascota_tutor (
  id           uuid primary key default gen_random_uuid(),
  mascota_id   uuid not null references public.mascota(id) on delete cascade,
  perfil_id    uuid not null references public.perfil(id) on delete cascade,
  rol          public.rol_tutor not null default 'tutor',
  invitado_por uuid references public.perfil(id) on delete set null,
  desde        timestamptz not null default now(),
  revocado_en  timestamptz
);

-- Índices sobre las columnas que usan las políticas: se evalúan por fila.
create index mascota_tutor_mascota_idx on public.mascota_tutor (mascota_id) where revocado_en is null;
create index mascota_tutor_perfil_idx  on public.mascota_tutor (perfil_id)  where revocado_en is null;

-- Exactamente un titular activo por mascota.
create unique index mascota_tutor_un_titular
  on public.mascota_tutor (mascota_id)
  where rol = 'titular' and revocado_en is null;

-- Una persona no puede figurar dos veces como tutora activa de la misma mascota.
create unique index mascota_tutor_sin_duplicados
  on public.mascota_tutor (mascota_id, perfil_id)
  where revocado_en is null;

create trigger mascota_tutor_auditoria
  after insert or update or delete on public.mascota_tutor
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Invitaciones por enlace
-- ---------------------------------------------------------------------------

create table public.invitacion_tutor (
  id           uuid primary key default gen_random_uuid(),
  mascota_id   uuid not null references public.mascota(id) on delete cascade,
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  creada_por   uuid not null references public.perfil(id) on delete cascade,
  vence_en     timestamptz not null default now() + interval '7 days',
  aceptada_en  timestamptz,
  aceptada_por uuid references public.perfil(id) on delete set null,
  revocada_en  timestamptz,
  creado_en    timestamptz not null default now()
);

create index invitacion_tutor_mascota_idx on public.invitacion_tutor (mascota_id);

comment on column public.invitacion_tutor.token is
  'Opaco y aleatorio. Nunca un id secuencial: permitiría enumerar mascotas.';

-- ---------------------------------------------------------------------------
-- Helpers de acceso
--
-- SECURITY DEFINER por dos motivos:
--   1. Evita recursión infinita — la política de mascota_tutor necesita
--      consultar mascota_tutor.
--   2. Una función STABLE se evalúa una vez por consulta en vez de por fila.
--
-- search_path fijo: sin él, SECURITY DEFINER es un vector de escalada.
-- ---------------------------------------------------------------------------

create or replace function public.es_tutor_de(p_mascota_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.mascota_tutor
     where mascota_id = p_mascota_id
       and perfil_id = auth.uid()
       and revocado_en is null
  );
$$;

create or replace function public.es_titular_de(p_mascota_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.mascota_tutor
     where mascota_id = p_mascota_id
       and perfil_id = auth.uid()
       and rol = 'titular'
       and revocado_en is null
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mascota enable row level security;
alter table public.mascota_tutor enable row level security;
alter table public.invitacion_tutor enable row level security;

grant select, update on public.mascota to authenticated;
grant select on public.mascota_tutor to authenticated;
grant select on public.invitacion_tutor to authenticated;

-- mascota --------------------------------------------------------------------

create policy "tutores ven su mascota"
  on public.mascota for select
  to authenticated
  using (public.es_tutor_de(id));

create policy "personal ve todas las mascotas"
  on public.mascota for select
  to authenticated
  using (public.es_personal_clinica());

create policy "tutores editan su mascota"
  on public.mascota for update
  to authenticated
  using (public.es_tutor_de(id))
  with check (public.es_tutor_de(id));

create policy "personal edita mascotas"
  on public.mascota for update
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- Sin políticas de INSERT ni DELETE a propósito: el alta va por crear_mascota()
-- (que también crea el vínculo de titular, atómicamente) y las mascotas no se
-- borran, se archivan.

-- mascota_tutor --------------------------------------------------------------

create policy "tutores ven quien mas accede"
  on public.mascota_tutor for select
  to authenticated
  using (public.es_tutor_de(mascota_id));

create policy "personal ve los tutores"
  on public.mascota_tutor for select
  to authenticated
  using (public.es_personal_clinica());

-- Sin escritura directa: invitar, aceptar, revocar y transferir van por RPC.
-- Concentrar ahí las reglas evita que una política mal escrita permita, por
-- ejemplo, que un tutor invitado se auto-promueva a titular.

-- invitacion_tutor -----------------------------------------------------------

create policy "tutores ven las invitaciones de su mascota"
  on public.invitacion_tutor for select
  to authenticated
  using (public.es_tutor_de(mascota_id));

-- Quien recibe el enlace NO puede leer esta tabla: aceptar va por RPC. Si
-- pudiera consultarla por token, podría enumerar invitaciones ajenas.
