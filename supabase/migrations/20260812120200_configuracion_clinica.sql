-- Configuración de la instalación (docs/stack.md, Decisión 11).
--
-- Mono-tenant: una instalación por veterinaria. Nada específico de la clínica
-- se escribe en el código. Levantar la instalación de otra veterinaria tiene
-- que ser cargar esta fila y las variables de entorno, nunca refactorizar.

create table public.configuracion_clinica (
  id                     smallint primary key default 1 check (id = 1),
  nombre                 text not null,
  logo_url               text,
  direccion              text,
  localidad              text,
  telefono               text,
  email                  text,
  horarios               jsonb not null default '{}'::jsonb,
  color_primario         text not null default '#2563eb',
  horas_min_cancelacion  integer not null default 24 check (horas_min_cancelacion >= 0),
  politica_sena          jsonb not null default '{}'::jsonb,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz
);

comment on table public.configuracion_clinica is
  'Fila única. El CHECK (id = 1) garantiza que no puedan existir dos configuraciones.';

create trigger configuracion_clinica_actualizado_en
  before update on public.configuracion_clinica
  for each row execute function public.set_actualizado_en();

alter table public.configuracion_clinica enable row level security;

-- Lectura pública: la app necesita el nombre y el logo antes del login.
-- No hay nada sensible acá; si algún día lo hubiera, va en otra tabla.
create policy "cualquiera lee la configuracion"
  on public.configuracion_clinica for select
  to anon, authenticated
  using (true);

create policy "administrador edita la configuracion"
  on public.configuracion_clinica for update
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

insert into public.configuracion_clinica (id, nombre)
values (1, 'Ojos de Cielo')
on conflict (id) do nothing;
