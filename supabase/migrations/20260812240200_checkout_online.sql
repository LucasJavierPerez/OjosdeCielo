-- Compra desde la app con MercadoPago (fase 7).
--
-- El estado del pago lo determina EXCLUSIVAMENTE el webhook servidor a
-- servidor. El retorno del navegador es experiencia de usuario: nunca se marca
-- una orden como pagada porque el frontend lo diga.

-- ---------------------------------------------------------------------------
-- Reserva de stock
--
-- Entre que el cliente inicia el pago y MercadoPago confirma pueden pasar
-- minutos. Sin reserva, dos personas compran la última unidad y una se queda
-- sin ella después de haber pagado.
-- ---------------------------------------------------------------------------

create table public.reserva_stock (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references public.orden(id) on delete cascade,
  producto_id uuid not null references public.producto(id),
  cantidad    integer not null check (cantidad > 0),
  vence_en    timestamptz not null default now() + interval '20 minutes',
  liberada_en timestamptz,
  creado_en   timestamptz not null default now()
);

create index reserva_stock_vigentes_idx on public.reserva_stock (producto_id)
  where liberada_en is null;

alter table public.reserva_stock enable row level security;
grant select on public.reserva_stock to authenticated;

create policy "personal ve las reservas"
  on public.reserva_stock for select
  to authenticated
  using (public.es_personal_clinica());

/*
 * Stock realmente disponible para vender online.
 *
 * Descuenta las reservas vigentes. Una reserva vencida ya no cuenta, así que
 * el stock se libera solo sin necesidad de un job de limpieza.
 */
create or replace function public.stock_disponible(p_producto_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select sum(cantidad) from public.movimiento_stock where producto_id = p_producto_id), 0)::integer
       - coalesce((
           select sum(cantidad) from public.reserva_stock
            where producto_id = p_producto_id
              and liberada_en is null
              and vence_en > now()
         ), 0)::integer;
$$;

grant execute on function public.stock_disponible to authenticated;

/*
 * Arma la orden y reserva el stock. Devuelve la orden en 'pendiente_pago'.
 *
 * NO descuenta stock todavía: eso ocurre cuando el webhook confirma el pago.
 * Descontar antes dejaría inventario perdido cada vez que alguien abandona
 * el checkout.
 */
create or replace function public.crear_orden_online(p_items jsonb)
returns public.orden
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.orden;
  v_item  jsonb;
  v_prod  public.producto;
  v_cant  integer;
  v_total numeric(12,2) := 0;
  v_disp  integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión' using errcode = '42501';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío' using errcode = '22023';
  end if;

  insert into public.orden (cliente_id, canal, estado)
  values (auth.uid(), 'app', 'pendiente_pago')
  returning * into v_orden;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod from public.producto
     where id = (v_item->>'producto_id')::uuid
       and visible_en_tienda
       and not requiere_receta
       and archivado_en is null
    for update;

    if not found then
      raise exception 'Uno de los productos ya no está disponible' using errcode = '22023';
    end if;

    v_cant := (v_item->>'cantidad')::integer;
    if v_cant <= 0 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;

    v_disp := public.stock_disponible(v_prod.id);
    if v_disp < v_cant then
      raise exception 'Quedan % unidades de %', greatest(v_disp, 0), v_prod.nombre
        using errcode = '22023';
    end if;

    insert into public.orden_item
      (orden_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
    values
      (v_orden.id, v_prod.id, v_prod.nombre, v_cant, v_prod.precio, v_prod.precio * v_cant);

    insert into public.reserva_stock (orden_id, producto_id, cantidad)
    values (v_orden.id, v_prod.id, v_cant);

    v_total := v_total + v_prod.precio * v_cant;
  end loop;

  update public.orden set total = v_total where id = v_orden.id returning * into v_orden;
  return v_orden;
end;
$$;

revoke execute on function public.crear_orden_online from public, anon;
grant execute on function public.crear_orden_online to authenticated;

/*
 * Confirma una orden pagada. La llama SÓLO la Edge Function del webhook.
 *
 * Idempotente: si MercadoPago reintenta el mismo aviso —y lo hace— la segunda
 * llamada no descuenta stock de nuevo ni duplica el asiento de caja.
 */
create or replace function public.confirmar_pago_online(
  p_orden_id      uuid,
  p_mp_payment_id text,
  p_monto         numeric,
  p_payload       jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.orden;
  v_item  record;
  v_pago  public.pago;
  v_caja  uuid;
  v_numero bigint;
begin
  select * into v_orden from public.orden where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe' using errcode = '22023';
  end if;

  -- Idempotencia: si ya está pagada, no se vuelve a procesar.
  if v_orden.estado = 'pagada' then
    return;
  end if;

  if exists (select 1 from public.pago where mp_payment_id = p_mp_payment_id) then
    return;
  end if;

  -- registrado_por con el mismo criterio: el webhook no tiene sesión.
  insert into public.pago
    (orden_id, monto, medio, estado, mp_payment_id, payload_webhook, confirmado_en, registrado_por)
  values
    (p_orden_id, p_monto, 'mercadopago', 'aprobado', p_mp_payment_id, p_payload, now(),
     coalesce(v_orden.cliente_id, v_orden.creado_por))
  returning * into v_pago;

  -- Recién acá se descuenta el stock: antes estaba sólo reservado.
  for v_item in select * from public.orden_item where orden_id = p_orden_id
  loop
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, orden_id, usuario_id)
    values
      (v_item.producto_id, 'venta', -v_item.cantidad, 'Compra desde la app', p_orden_id,
       coalesce(v_orden.cliente_id, v_orden.creado_por));
  end loop;

  update public.reserva_stock set liberada_en = now()
   where orden_id = p_orden_id and liberada_en is null;

  update public.orden set estado = 'pagada' where id = p_orden_id;

  -- Si hay caja abierta se asienta ahí; si no, queda para la conciliación del
  -- día siguiente. Una compra online a las 3 AM no debe fallar por eso.
  select id into v_caja from public.turno_caja where cerrado_en is null;
  if v_caja is not null then
    -- usuario_id explícito: la columna tiene default auth.uid(), que es null
    -- cuando la llama el webhook con service_role. Se atribuye al cliente que
    -- compró, que es la información útil para la conciliación.
    insert into public.movimiento_caja
      (turno_caja_id, tipo, monto, medio, concepto, pago_id, usuario_id)
    values
      (v_caja, 'ingreso', p_monto, 'mercadopago', 'Compra desde la app', v_pago.id,
       coalesce(v_orden.cliente_id, v_orden.creado_por));
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.comprobante where punto_venta = 1 and tipo_comprobante = 'interno';

  insert into public.comprobante (orden_id, numero, total)
  values (p_orden_id, v_numero, p_monto);
end;
$$;

-- Nadie desde el navegador: sólo la Edge Function con service_role.
revoke execute on function public.confirmar_pago_online from public, anon, authenticated;
grant execute on function public.confirmar_pago_online to service_role;
grant select, update on public.orden to service_role;
grant select on public.orden_item to service_role;
grant insert on public.pago to service_role;
grant insert on public.movimiento_stock to service_role;
grant select, update on public.reserva_stock to service_role;
grant select on public.turno_caja to service_role;
grant insert on public.movimiento_caja to service_role;
grant select, insert on public.comprobante to service_role;
grant select on public.producto to service_role;

/* Cancela una orden sin pagar y libera lo reservado. */
create or replace function public.cancelar_orden(p_orden_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.orden;
begin
  select * into v_orden from public.orden where id = p_orden_id;
  if not found then
    raise exception 'La orden no existe' using errcode = '22023';
  end if;

  if v_orden.cliente_id <> auth.uid() and not public.es_personal_clinica() then
    raise exception 'Sin acceso a esta orden' using errcode = '42501';
  end if;

  if v_orden.estado = 'pagada' then
    raise exception 'La orden ya está pagada. Hablá con la clínica para una devolución.'
      using errcode = '22023';
  end if;

  update public.orden set estado = 'cancelada' where id = p_orden_id;
  update public.reserva_stock set liberada_en = now()
   where orden_id = p_orden_id and liberada_en is null;
end;
$$;

revoke execute on function public.cancelar_orden from public, anon;
grant execute on function public.cancelar_orden to authenticated;

/* Catálogo con disponibilidad real, para la tienda. */
create or replace function public.catalogo_tienda()
returns table (
  id          uuid,
  nombre      text,
  descripcion text,
  categoria   text,
  precio      numeric,
  imagen_url  text,
  disponible  integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nombre, p.descripcion, p.categoria, p.precio, p.imagen_url,
         public.stock_disponible(p.id)
    from public.producto p
   where p.visible_en_tienda
     and not p.requiere_receta
     and p.archivado_en is null
   order by p.categoria nulls last, p.nombre;
$$;

revoke execute on function public.catalogo_tienda from public, anon;
grant execute on function public.catalogo_tienda to authenticated;
