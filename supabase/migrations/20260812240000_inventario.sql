-- Inventario con lotes y control de vencimientos (fase 7).
--
-- Decisión central: el stock es la SUMA DE MOVIMIENTOS, no un número editable.
-- Una columna `stock` que se actualiza pierde la trazabilidad y se desincroniza
-- ante cualquier fallo parcial. Acá cada cambio deja rastro de por qué ocurrió.

create type public.tipo_movimiento as enum (
  'ingreso',
  'venta',
  'uso_clinico',
  'ajuste',
  'vencimiento',
  'devolucion'
);

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

create table public.producto (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (length(trim(nombre)) > 0),
  descripcion       text,
  categoria         text,
  precio            numeric(12,2) not null check (precio >= 0),
  requiere_receta   boolean not null default false,
  visible_en_tienda boolean not null default false,
  controla_lote     boolean not null default false,
  stock_minimo      integer not null default 0 check (stock_minimo >= 0),
  imagen_url        text,
  archivado_en      timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz
);

comment on column public.producto.controla_lote is
  'Los fármacos vencen y hay que rastrear el lote; una correa no.';

comment on column public.producto.requiere_receta is
  'No se vende en la tienda online. La receta la valida un profesional en el mostrador.';

create index producto_tienda_idx on public.producto (nombre)
  where visible_en_tienda and archivado_en is null;

create trigger producto_actualizado_en
  before update on public.producto
  for each row execute function public.set_actualizado_en();

alter table public.producto enable row level security;
grant select on public.producto to authenticated;
grant insert, update on public.producto to authenticated;

-- El cliente sólo ve lo que la clínica publicó, y nunca lo que exige receta.
create policy "clientes ven el catalogo de la tienda"
  on public.producto for select
  to authenticated
  using (
    (visible_en_tienda and not requiere_receta and archivado_en is null)
    or public.es_personal_clinica()
  );

create policy "personal gestiona productos"
  on public.producto for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Lotes
--
-- El control de vencimientos exige lotes: no alcanza con un contador. Sin esto
-- no se puede saber qué unidades vencen ni cuáles despachar primero.
-- ---------------------------------------------------------------------------

create table public.lote (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.producto(id) on delete cascade,
  numero       text not null,
  vencimiento  date,
  creado_en    timestamptz not null default now(),

  unique (producto_id, numero)
);

create index lote_vencimiento_idx on public.lote (vencimiento)
  where vencimiento is not null;

alter table public.lote enable row level security;
grant select, insert, update on public.lote to authenticated;

create policy "personal gestiona lotes"
  on public.lote for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Movimientos de stock
--
-- Append-only. Un error se corrige con un movimiento que compensa, nunca
-- editando el anterior: igual que en la historia clínica y en la caja.
-- ---------------------------------------------------------------------------

create table public.movimiento_stock (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.producto(id) on delete cascade,
  lote_id      uuid references public.lote(id),
  tipo         public.tipo_movimiento not null,
  cantidad     integer not null check (cantidad <> 0),
  motivo       text,
  orden_id     uuid,
  mascota_id   uuid references public.mascota(id) on delete set null,
  usuario_id   uuid not null default auth.uid() references public.perfil(id),
  creado_en    timestamptz not null default now()
);

comment on column public.movimiento_stock.cantidad is
  'Positivo suma, negativo resta. El signo lo pone quien registra, según el tipo.';

create index movimiento_stock_producto_idx on public.movimiento_stock (producto_id, creado_en desc);
create index movimiento_stock_orden_idx on public.movimiento_stock (orden_id)
  where orden_id is not null;

create or replace function public.movimiento_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los movimientos de stock no se editan. Registrá uno que lo compense.'
    using errcode = '42501';
end;
$$;

create trigger movimiento_stock_sin_update
  before update on public.movimiento_stock
  for each row execute function public.movimiento_es_inmutable();

create trigger movimiento_stock_sin_delete
  before delete on public.movimiento_stock
  for each row execute function public.movimiento_es_inmutable();

alter table public.movimiento_stock enable row level security;
grant select, insert on public.movimiento_stock to authenticated;

create policy "personal ve los movimientos"
  on public.movimiento_stock for select
  to authenticated
  using (public.es_personal_clinica());

create policy "personal registra movimientos"
  on public.movimiento_stock for insert
  to authenticated
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Stock actual
--
-- Vista sobre la suma de movimientos. Si el volumen lo pide, se convierte en
-- vista materializada o en columna mantenida por trigger — pero la fuente de
-- verdad sigue siendo la suma.
-- ---------------------------------------------------------------------------

create or replace view public.stock_actual
with (security_invoker = true) as
select p.id as producto_id,
       p.nombre,
       p.categoria,
       p.precio,
       p.stock_minimo,
       p.controla_lote,
       p.requiere_receta,
       p.visible_en_tienda,
       coalesce(sum(m.cantidad), 0)::integer as cantidad,
       coalesce(sum(m.cantidad), 0) <= p.stock_minimo as bajo_minimo
  from public.producto p
  left join public.movimiento_stock m on m.producto_id = p.id
 where p.archivado_en is null
 group by p.id;

comment on view public.stock_actual is
  'security_invoker: la vista respeta las políticas de quien la consulta, no las del dueño.';

grant select on public.stock_actual to authenticated;

/* Stock por lote, para saber qué vence y qué despachar primero. */
create or replace view public.stock_por_lote
with (security_invoker = true) as
select l.id as lote_id,
       l.producto_id,
       p.nombre as producto,
       l.numero,
       l.vencimiento,
       coalesce(sum(m.cantidad), 0)::integer as cantidad,
       l.vencimiento is not null and l.vencimiento < current_date as vencido,
       l.vencimiento is not null
         and l.vencimiento >= current_date
         and l.vencimiento <= current_date + 60 as por_vencer
  from public.lote l
  join public.producto p on p.id = l.producto_id
  left join public.movimiento_stock m on m.lote_id = l.id
 where p.archivado_en is null
 group by l.id, p.nombre;

grant select on public.stock_por_lote to authenticated;

/*
 * Registrar un movimiento.
 *
 * RPC en vez de INSERT directo para impedir stock negativo: sin esta
 * verificación se podrían vender doce unidades de un producto que tiene tres.
 */
create or replace function public.registrar_movimiento(
  p_producto_id uuid,
  p_tipo        public.tipo_movimiento,
  p_cantidad    integer,
  p_lote_id     uuid default null,
  p_motivo      text default null,
  p_mascota_id  uuid default null,
  p_orden_id    uuid default null
)
returns public.movimiento_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov   public.movimiento_stock;
  v_stock integer;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal registra movimientos de stock' using errcode = '42501';
  end if;

  if p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero' using errcode = '22023';
  end if;

  -- Bloquea la fila del producto hasta el commit: dos ventas simultáneas del
  -- último ítem se serializan en vez de dejar el stock en -1.
  perform 1 from public.producto where id = p_producto_id for update;

  if p_cantidad < 0 then
    select coalesce(sum(cantidad), 0) into v_stock
      from public.movimiento_stock
     where producto_id = p_producto_id
       and (p_lote_id is null or lote_id = p_lote_id);

    if v_stock + p_cantidad < 0 then
      raise exception 'No hay stock suficiente: quedan % unidades', v_stock
        using errcode = '22023';
    end if;
  end if;

  insert into public.movimiento_stock
    (producto_id, lote_id, tipo, cantidad, motivo, mascota_id, orden_id)
  values
    (p_producto_id, p_lote_id, p_tipo, p_cantidad, p_motivo, p_mascota_id, p_orden_id)
  returning * into v_mov;

  return v_mov;
end;
$$;

revoke execute on function public.registrar_movimiento from public, anon;
grant execute on function public.registrar_movimiento to authenticated;

/* Lo que hay que reponer o retirar: la pantalla que abre quien maneja compras. */
create or replace function public.alertas_inventario()
returns table (
  tipo        text,
  producto_id uuid,
  producto    text,
  detalle     text,
  cantidad    integer
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
  select 'bajo_minimo'::text, s.producto_id, s.nombre,
         'Quedan ' || s.cantidad || ', mínimo ' || s.stock_minimo, s.cantidad
    from public.stock_actual s
   where s.bajo_minimo
  union all
  select 'vencido'::text, l.producto_id, l.producto,
         'Lote ' || l.numero || ' venció el ' || to_char(l.vencimiento, 'DD/MM/YYYY'), l.cantidad
    from public.stock_por_lote l
   where l.vencido and l.cantidad > 0
  union all
  select 'por_vencer'::text, l.producto_id, l.producto,
         'Lote ' || l.numero || ' vence el ' || to_char(l.vencimiento, 'DD/MM/YYYY'), l.cantidad
    from public.stock_por_lote l
   where l.por_vencer and l.cantidad > 0
   order by 1, 3;
end;
$$;

revoke execute on function public.alertas_inventario from public, anon;
grant execute on function public.alertas_inventario to authenticated;
