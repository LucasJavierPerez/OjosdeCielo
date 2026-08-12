-- Ventas, pagos y caja (fase 7).
--
-- La fase de mayor riesgo del proyecto: dinero, stock y concurrencia.
--
-- Reglas que la atraviesan:
--   · El precio se COPIA al momento de la venta. Una orden histórica jamás lee
--     el precio actual del producto.
--   · Los movimientos de caja son append-only, como los de stock.
--   · El estado de un pago online lo determina el webhook, nunca el navegador.

create type public.estado_orden as enum (
  'borrador',
  'pendiente_pago',
  'pagada',
  'entregada',
  'cancelada'
);

create type public.medio_pago as enum (
  'efectivo',
  'debito',
  'credito',
  'transferencia',
  'mercadopago',
  'cuenta_corriente'
);

create type public.estado_pago as enum ('pendiente', 'aprobado', 'rechazado', 'devuelto');

-- ---------------------------------------------------------------------------
-- Turno de caja
--
-- Abrir y cerrar con arqueo. Sin esto no se puede saber quién manejó el dinero
-- ni de dónde salió una diferencia.
-- ---------------------------------------------------------------------------

create table public.turno_caja (
  id              uuid primary key default gen_random_uuid(),
  abierto_por     uuid not null default auth.uid() references public.perfil(id),
  abierto_en      timestamptz not null default now(),
  monto_inicial   numeric(12,2) not null default 0 check (monto_inicial >= 0),
  cerrado_por     uuid references public.perfil(id),
  cerrado_en      timestamptz,
  monto_declarado numeric(12,2),
  monto_calculado numeric(12,2),
  diferencia      numeric(12,2),
  notas           text
);

-- Un solo turno de caja abierto a la vez.
create unique index turno_caja_uno_abierto on public.turno_caja ((cerrado_en is null))
  where cerrado_en is null;

alter table public.turno_caja enable row level security;
grant select, insert, update on public.turno_caja to authenticated;

create policy "personal ve la caja"
  on public.turno_caja for select
  to authenticated
  using (public.es_personal_clinica());

create policy "personal opera la caja"
  on public.turno_caja for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Órdenes
-- ---------------------------------------------------------------------------

create table public.orden (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references public.perfil(id),
  canal          text not null default 'mostrador' check (canal in ('mostrador', 'app')),
  estado         public.estado_orden not null default 'borrador',
  total          numeric(12,2) not null default 0 check (total >= 0),
  turno_caja_id  uuid references public.turno_caja(id),
  notas          text,
  creado_por     uuid default auth.uid() references public.perfil(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index orden_cliente_idx on public.orden (cliente_id, creado_en desc);
create index orden_caja_idx on public.orden (turno_caja_id) where turno_caja_id is not null;

create trigger orden_actualizado_en
  before update on public.orden
  for each row execute function public.set_actualizado_en();

alter table public.orden enable row level security;
grant select, update on public.orden to authenticated;

create policy "cada uno ve sus ordenes"
  on public.orden for select
  to authenticated
  using (cliente_id = auth.uid() or public.es_personal_clinica());

create policy "personal gestiona ordenes"
  on public.orden for update
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

create table public.orden_item (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references public.orden(id) on delete cascade,
  producto_id     uuid not null references public.producto(id),
  descripcion     text not null,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal        numeric(12,2) not null check (subtotal >= 0)
);

comment on column public.orden_item.precio_unitario is
  'Copiado al momento de la venta. Nunca se lee el precio actual del producto para una orden histórica.';

comment on column public.orden_item.descripcion is
  'También copiada: si el producto se renombra, el comprobante viejo debe seguir diciendo lo que se vendió.';

create index orden_item_orden_idx on public.orden_item (orden_id);

alter table public.orden_item enable row level security;
grant select on public.orden_item to authenticated;

create policy "se ven los items de las ordenes visibles"
  on public.orden_item for select
  to authenticated
  using (
    exists (
      select 1 from public.orden o
       where o.id = orden_id
         and (o.cliente_id = auth.uid() or public.es_personal_clinica())
    )
  );

-- ---------------------------------------------------------------------------
-- Pagos
-- ---------------------------------------------------------------------------

create table public.pago (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid references public.orden(id) on delete cascade,
  turno_id          uuid references public.turno(id) on delete set null,
  monto             numeric(12,2) not null check (monto > 0),
  medio             public.medio_pago not null,
  estado            public.estado_pago not null default 'pendiente',
  mp_payment_id     text unique,
  mp_preference_id  text,
  payload_webhook   jsonb,
  confirmado_en     timestamptz,
  registrado_por    uuid default auth.uid() references public.perfil(id),
  creado_en         timestamptz not null default now()
);

comment on column public.pago.mp_payment_id is
  'Único: es lo que da idempotencia frente a los webhooks repetidos de MercadoPago.';

create index pago_orden_idx on public.pago (orden_id);

alter table public.pago enable row level security;
grant select on public.pago to authenticated;

create policy "se ven los pagos de las ordenes visibles"
  on public.pago for select
  to authenticated
  using (
    public.es_personal_clinica()
    or exists (select 1 from public.orden o where o.id = orden_id and o.cliente_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Movimientos de caja
--
-- Append-only, como el stock: un error se compensa, no se edita.
-- ---------------------------------------------------------------------------

create table public.movimiento_caja (
  id            uuid primary key default gen_random_uuid(),
  turno_caja_id uuid not null references public.turno_caja(id),
  tipo          text not null check (tipo in ('ingreso', 'egreso')),
  monto         numeric(12,2) not null check (monto > 0),
  medio         public.medio_pago not null,
  concepto      text not null,
  pago_id       uuid references public.pago(id),
  usuario_id    uuid not null default auth.uid() references public.perfil(id),
  creado_en     timestamptz not null default now()
);

create index movimiento_caja_turno_idx on public.movimiento_caja (turno_caja_id);

create trigger movimiento_caja_sin_update
  before update on public.movimiento_caja
  for each row execute function public.movimiento_es_inmutable();

create trigger movimiento_caja_sin_delete
  before delete on public.movimiento_caja
  for each row execute function public.movimiento_es_inmutable();

alter table public.movimiento_caja enable row level security;
grant select, insert on public.movimiento_caja to authenticated;

create policy "personal ve la caja"
  on public.movimiento_caja for select
  to authenticated
  using (public.es_personal_clinica());

create policy "personal registra en caja"
  on public.movimiento_caja for insert
  to authenticated
  with check (public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- Comprobantes
--
-- Internos en v1 (docs/stack.md, Decisión 3). Los campos fiscales existen
-- desde ahora para que la fase con ARCA no requiera migrar datos.
-- ---------------------------------------------------------------------------

create table public.comprobante (
  id               uuid primary key default gen_random_uuid(),
  orden_id         uuid not null references public.orden(id) on delete cascade,
  tipo_comprobante text not null default 'interno',
  punto_venta      integer not null default 1,
  numero           bigint not null,
  total            numeric(12,2) not null,
  cae              text,
  cae_vencimiento  date,
  cuit_receptor    text,
  creado_en        timestamptz not null default now(),

  unique (punto_venta, tipo_comprobante, numero)
);

alter table public.comprobante enable row level security;
grant select on public.comprobante to authenticated;

create policy "se ven los comprobantes de las ordenes visibles"
  on public.comprobante for select
  to authenticated
  using (
    public.es_personal_clinica()
    or exists (select 1 from public.orden o where o.id = orden_id and o.cliente_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Operaciones
-- ---------------------------------------------------------------------------

create or replace function public.abrir_caja(p_monto_inicial numeric default 0)
returns public.turno_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caja public.turno_caja;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal abre la caja' using errcode = '42501';
  end if;

  if exists (select 1 from public.turno_caja where cerrado_en is null) then
    raise exception 'Ya hay una caja abierta. Cerrala antes de abrir otra.'
      using errcode = '22023';
  end if;

  insert into public.turno_caja (monto_inicial) values (p_monto_inicial)
  returning * into v_caja;

  return v_caja;
end;
$$;

create or replace function public.cerrar_caja(p_monto_declarado numeric, p_notas text default null)
returns public.turno_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caja      public.turno_caja;
  v_calculado numeric(12,2);
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal cierra la caja' using errcode = '42501';
  end if;

  select * into v_caja from public.turno_caja where cerrado_en is null;
  if not found then
    raise exception 'No hay ninguna caja abierta' using errcode = '22023';
  end if;

  -- Sólo efectivo: lo que se paga con tarjeta no está en el cajón, y compararlo
  -- contra el conteo físico daría una diferencia falsa todos los días.
  select v_caja.monto_inicial
         + coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
    into v_calculado
    from public.movimiento_caja
   where turno_caja_id = v_caja.id and medio = 'efectivo';

  update public.turno_caja
     set cerrado_por = auth.uid(),
         cerrado_en = now(),
         monto_declarado = p_monto_declarado,
         monto_calculado = v_calculado,
         diferencia = p_monto_declarado - v_calculado,
         notas = p_notas
   where id = v_caja.id
  returning * into v_caja;

  return v_caja;
end;
$$;

/*
 * Venta de mostrador, en una sola transacción.
 *
 * Crea la orden, copia precios, descuenta stock, registra el pago, lo asienta
 * en caja y numera el comprobante. Si algo falla, no queda nada a medias: sin
 * esto una caída después de descontar stock dejaría el inventario mal.
 *
 * p_items es jsonb: [{"producto_id": "...", "cantidad": 2, "lote_id": null}]
 */
create or replace function public.vender_mostrador(
  p_items      jsonb,
  p_medio      public.medio_pago,
  p_cliente_id uuid default null,
  p_notas      text default null
)
returns public.orden
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden   public.orden;
  v_caja    public.turno_caja;
  v_item    jsonb;
  v_prod    public.producto;
  v_cant    integer;
  v_total   numeric(12,2) := 0;
  v_pago    public.pago;
  v_numero  bigint;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal registra ventas' using errcode = '42501';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene items' using errcode = '22023';
  end if;

  select * into v_caja from public.turno_caja where cerrado_en is null;
  if not found then
    raise exception 'Abrí la caja antes de vender' using errcode = '22023';
  end if;

  insert into public.orden (cliente_id, canal, estado, turno_caja_id, notas)
  values (p_cliente_id, 'mostrador', 'pagada', v_caja.id, p_notas)
  returning * into v_orden;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod from public.producto
     where id = (v_item->>'producto_id')::uuid and archivado_en is null;
    if not found then
      raise exception 'Producto inexistente' using errcode = '22023';
    end if;

    v_cant := (v_item->>'cantidad')::integer;
    if v_cant <= 0 then
      raise exception 'Cantidad inválida para %', v_prod.nombre using errcode = '22023';
    end if;

    -- Precio y descripción copiados: si mañana cambia el precio, este
    -- comprobante tiene que seguir diciendo lo que se cobró hoy.
    insert into public.orden_item
      (orden_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
    values
      (v_orden.id, v_prod.id, v_prod.nombre, v_cant, v_prod.precio, v_prod.precio * v_cant);

    v_total := v_total + v_prod.precio * v_cant;

    perform public.registrar_movimiento(
      v_prod.id, 'venta', -v_cant,
      nullif(v_item->>'lote_id', '')::uuid,
      'Venta de mostrador', null, v_orden.id
    );
  end loop;

  update public.orden set total = v_total where id = v_orden.id returning * into v_orden;

  insert into public.pago (orden_id, monto, medio, estado, confirmado_en)
  values (v_orden.id, v_total, p_medio, 'aprobado', now())
  returning * into v_pago;

  insert into public.movimiento_caja (turno_caja_id, tipo, monto, medio, concepto, pago_id)
  values (v_caja.id, 'ingreso', v_total, p_medio, 'Venta de mostrador', v_pago.id);

  -- Numeración correlativa por punto de venta desde el día uno, para que la
  -- fase fiscal no tenga que renumerar nada.
  select coalesce(max(numero), 0) + 1 into v_numero
    from public.comprobante where punto_venta = 1 and tipo_comprobante = 'interno';

  insert into public.comprobante (orden_id, numero, total)
  values (v_orden.id, v_numero, v_total);

  return v_orden;
end;
$$;

/* Ingreso o egreso de caja que no viene de una venta. */
create or replace function public.registrar_movimiento_caja(
  p_tipo     text,
  p_monto    numeric,
  p_medio    public.medio_pago,
  p_concepto text
)
returns public.movimiento_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caja public.turno_caja;
  v_mov  public.movimiento_caja;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal opera la caja' using errcode = '42501';
  end if;

  select * into v_caja from public.turno_caja where cerrado_en is null;
  if not found then
    raise exception 'No hay ninguna caja abierta' using errcode = '22023';
  end if;

  insert into public.movimiento_caja (turno_caja_id, tipo, monto, medio, concepto)
  values (v_caja.id, p_tipo, p_monto, p_medio, p_concepto)
  returning * into v_mov;

  return v_mov;
end;
$$;

/* Estado de la caja abierta, para la pantalla de cierre. */
create or replace function public.resumen_caja()
returns table (
  caja_id         uuid,
  abierta_en      timestamptz,
  monto_inicial   numeric,
  efectivo        numeric,
  otros_medios    numeric,
  egresos         numeric,
  ventas          bigint,
  esperado_cajon  numeric
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
  select c.id, c.abierto_en, c.monto_inicial,
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso' and m.medio = 'efectivo'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'ingreso' and m.medio <> 'efectivo'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0),
         count(distinct m.pago_id) filter (where m.pago_id is not null),
         c.monto_inicial
           + coalesce(sum(m.monto) filter (where m.tipo = 'ingreso' and m.medio = 'efectivo'), 0)
           - coalesce(sum(m.monto) filter (where m.tipo = 'egreso' and m.medio = 'efectivo'), 0)
    from public.turno_caja c
    left join public.movimiento_caja m on m.turno_caja_id = c.id
   where c.cerrado_en is null
   group by c.id;
end;
$$;

revoke execute on function public.abrir_caja                from public, anon;
revoke execute on function public.cerrar_caja               from public, anon;
revoke execute on function public.vender_mostrador          from public, anon;
revoke execute on function public.registrar_movimiento_caja from public, anon;
revoke execute on function public.resumen_caja              from public, anon;

grant execute on function public.abrir_caja                to authenticated;
grant execute on function public.cerrar_caja               to authenticated;
grant execute on function public.vender_mostrador          to authenticated;
grant execute on function public.registrar_movimiento_caja to authenticated;
grant execute on function public.resumen_caja              to authenticated;
