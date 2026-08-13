-- Los cambios de producto quedan auditados.
--
-- El precio es plata. Una venta pasada no se toca —orden_item.precio_unitario
-- se congela al vender, regla 12— pero corregir un precio mal tipeado y no
-- poder ver después cuál era el anterior deja a la clínica sin forma de
-- explicar una diferencia de caja.
--
-- La misma auditoría cubre el renombrado, que es el otro caso: si alguien
-- corrige "Alimentto" y una semana después nadie encuentra el producto, el
-- registro dice qué pasó y quién lo hizo.
create trigger producto_auditoria
  after insert or update or delete on public.producto
  for each row execute function public.registrar_auditoria();
