-- Catálogo de servicios/honorarios, y gastos fijos de la clínica.
--
-- Dos listas de precios que la clínica lleva en una planilla aparte y no
-- tienen dónde vivir hoy:
--   · Honorarios (consultas, cirugías, maniobras, internación por peso): un
--     precio de un ACTO, no de un producto con stock. No entra en `producto`
--     porque `stock_actual` lo mostraría como mercadería con "stock 0".
--   · Gastos fijos (alquiler, luz, gas, seguro...): contabilidad propia de la
--     clínica, no una venta ni un movimiento de caja de mostrador.

-- ---------------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------------

create table public.servicio (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (length(trim(nombre)) > 0),
  categoria      text,
  precio         numeric(12,2) not null check (precio >= 0),
  notas          text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz,
  archivado_en   timestamptz
);

comment on column public.servicio.notas is
  'Aclaraciones del honorario, ej. "sumar el valor de la vacuna" o "sumar el insumo".';

create index servicio_activo_idx on public.servicio (categoria, nombre) where activo;

create trigger servicio_actualizado_en
  before update on public.servicio
  for each row execute function public.set_actualizado_en();

alter table public.servicio enable row level security;
grant select, insert, update, delete on public.servicio to authenticated;

-- Igual que producto: es catálogo interno, no hay política para clientes.
create policy "personal gestiona servicios"
  on public.servicio for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Gastos fijos
--
-- `gasto_fijo` es el concepto (alquiler, luz...); `gasto_fijo_registro` es el
-- monto de un mes puntual. Un registro por (gasto, mes): se corrige editando
-- ese mes, no se arrastra un histórico de movimientos como en caja/stock —
-- esto es una planilla de gastos propios, no un libro de caja.
--
-- Sólo el administrador: es información financiera de la clínica, no algo que
-- necesite ver recepción o el veterinario (mismo criterio que
-- metricas_ventas/flujo_caja_mensual).
-- ---------------------------------------------------------------------------

create table public.gasto_fijo (
  id             uuid primary key default gen_random_uuid(),
  concepto       text not null check (length(trim(concepto)) > 0),
  categoria      text,
  activo         boolean not null default true,
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz,
  archivado_en   timestamptz
);

create trigger gasto_fijo_actualizado_en
  before update on public.gasto_fijo
  for each row execute function public.set_actualizado_en();

alter table public.gasto_fijo enable row level security;
grant select, insert, update, delete on public.gasto_fijo to authenticated;

create policy "administracion gestiona gastos fijos"
  on public.gasto_fijo for all
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

create table public.gasto_fijo_registro (
  id             uuid primary key default gen_random_uuid(),
  gasto_fijo_id  uuid not null references public.gasto_fijo(id) on delete cascade,
  -- Fecha civil (el día 1 del mes al que corresponde), no timestamptz: es un
  -- período, no un instante (docs del proyecto, fechas civiles vs instantes).
  periodo        date not null,
  monto          numeric(12,2) not null check (monto > 0),
  notas          text,
  registrado_por uuid not null default auth.uid() references public.perfil(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz,

  unique (gasto_fijo_id, periodo)
);

create index gasto_fijo_registro_periodo_idx on public.gasto_fijo_registro (periodo desc);

create trigger gasto_fijo_registro_actualizado_en
  before update on public.gasto_fijo_registro
  for each row execute function public.set_actualizado_en();

alter table public.gasto_fijo_registro enable row level security;
grant select, insert, update, delete on public.gasto_fijo_registro to authenticated;

create policy "administracion gestiona registros de gastos fijos"
  on public.gasto_fijo_registro for all
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- ---------------------------------------------------------------------------
-- Resumen para la pantalla: el último período cargado de cada gasto activo.
-- ---------------------------------------------------------------------------

create or replace function public.gastos_fijos_resumen()
returns table (
  gasto_fijo_id  uuid,
  concepto       text,
  categoria      text,
  ultimo_periodo date,
  ultimo_monto   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_administrador() then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;

  return query
  select g.id, g.concepto, g.categoria, r.periodo, r.monto
    from public.gasto_fijo g
    left join lateral (
      select gfr.periodo, gfr.monto
        from public.gasto_fijo_registro gfr
       where gfr.gasto_fijo_id = g.id
       order by gfr.periodo desc
       limit 1
    ) r on true
   where g.activo
   order by g.categoria nulls last, g.concepto;
end;
$$;

revoke execute on function public.gastos_fijos_resumen from public, anon;
grant execute on function public.gastos_fijos_resumen to authenticated;
