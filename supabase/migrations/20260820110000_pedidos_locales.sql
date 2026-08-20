-- Pedidos de la app sin Mercado Pago.
--
-- crear_orden_online() ya arma el pedido en 'pendiente_pago' y reserva stock
-- sin tocar Mercado Pago — eso no cambia. Lo que faltaba era que el personal
-- pudiera cobrarlo en persona cuando el tutor lo retira: confirmar_pago_online
-- existe para eso, pero está reservada al webhook a propósito. Esta es la
-- misma operación, pensada para que la dispare alguien de la clínica desde el
-- panel en vez de un aviso de MercadoPago.

/*
 * Cobra en persona un pedido hecho desde la app. Mismo efecto que
 * confirmar_pago_online (paga, descuenta stock, libera la reserva, asienta en
 * caja si hay turno abierto, genera comprobante), pero:
 *   - lo dispara el personal desde el panel, no un webhook;
 *   - el medio de pago lo elige quien cobra (efectivo, débito, etc.), nunca
 *     'mercadopago';
 *   - queda registrado quién lo cobró (auth.uid(), no null como en el
 *     webhook).
 *
 * Idempotente por la misma razón que el original: tocar dos veces el mismo
 * pedido no debe duplicar el descuento de stock ni el asiento de caja.
 */
create or replace function public.confirmar_pedido_local(
  p_orden_id uuid,
  p_medio    public.medio_pago
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden  public.orden;
  v_item   record;
  v_pago   public.pago;
  v_caja   uuid;
  v_numero bigint;
begin
  if not public.es_personal_clinica() then
    raise exception 'Sólo el personal cobra pedidos' using errcode = '42501';
  end if;

  if p_medio = 'mercadopago' then
    raise exception 'Un cobro en persona no puede quedar como Mercado Pago' using errcode = '22023';
  end if;

  select * into v_orden from public.orden where id = p_orden_id for update;
  if not found then
    raise exception 'El pedido no existe' using errcode = '22023';
  end if;

  if v_orden.canal <> 'app' then
    raise exception 'Esto es sólo para pedidos hechos desde la app' using errcode = '22023';
  end if;

  if v_orden.estado = 'pagada' then
    return;
  end if;

  if v_orden.estado <> 'pendiente_pago' then
    raise exception 'Ese pedido ya no está pendiente de pago' using errcode = '22023';
  end if;

  insert into public.pago
    (orden_id, monto, medio, estado, confirmado_en, registrado_por)
  values
    (p_orden_id, v_orden.total, p_medio, 'aprobado', now(), auth.uid())
  returning * into v_pago;

  for v_item in select * from public.orden_item where orden_id = p_orden_id
  loop
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, orden_id, usuario_id)
    values
      (v_item.producto_id, 'venta', -v_item.cantidad, 'Pedido de la app, retirado en la clínica',
       p_orden_id, auth.uid());
  end loop;

  update public.reserva_stock set liberada_en = now()
   where orden_id = p_orden_id and liberada_en is null;

  update public.orden set estado = 'pagada' where id = p_orden_id;

  select id into v_caja from public.turno_caja where cerrado_en is null;
  if v_caja is not null then
    insert into public.movimiento_caja
      (turno_caja_id, tipo, monto, medio, concepto, pago_id, usuario_id)
    values
      (v_caja, 'ingreso', v_orden.total, p_medio, 'Pedido de la app, retirado en la clínica',
       v_pago.id, auth.uid());
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.comprobante where punto_venta = 1 and tipo_comprobante = 'interno';

  insert into public.comprobante (orden_id, numero, total)
  values (p_orden_id, v_numero, v_orden.total);
end;
$$;

revoke execute on function public.confirmar_pedido_local from public, anon;
grant execute on function public.confirmar_pedido_local to authenticated;

-- El default de 20 minutos de reserva_stock se pensó para el tiempo que tarda
-- alguien en completar el checkout de MercadoPago. Ahora que el pedido espera
-- a que el tutor pase por la clínica a pagarlo y retirarlo, 20 minutos venden
-- el mismo producto dos veces antes de que llegue. Tres días le da margen sin
-- dejar stock reservado para siempre por un pedido que nunca se retira.
alter table public.reserva_stock
  alter column vence_en set default now() + interval '3 days';
