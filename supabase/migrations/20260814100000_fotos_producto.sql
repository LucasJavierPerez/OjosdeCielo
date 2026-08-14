-- Fotos de producto, para inventario y la tienda.
--
-- Público, a diferencia del bucket de mascotas: no hay nada privado en la foto
-- de un alimento balanceado o una jeringa. Que sea público evita el viaje de
-- ida y vuelta por una URL firmada en una pantalla que puede listar treinta
-- productos a la vez — la tienda pide la URL una sola vez y el navegador la
-- cachea, en vez de renovar firmas.
--
-- Un producto que requiere receta igual puede tener foto: lo que se oculta de
-- la tienda es su disponibilidad (catalogo_tienda() ya lo filtra), no la
-- imagen en sí.
--
-- Convención de rutas: {producto_id}/{archivo}, igual que en mascotas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos',
  'productos',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- El bucket público se sirve por /storage/v1/object/public/, que no pasa por
-- RLS — por eso el cliente puede ver la foto sin esta política. Pero
-- `.storage.update()` sí necesita poder leer la fila existente por el camino
-- autenticado (para decidir si reemplaza o inserta), y sin esto la subida de
-- reemplazo fallaba con "row-level security policy" aunque la política de
-- UPDATE fuera correcta.
create policy "el personal ve las fotos de producto por el camino autenticado"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'productos' and public.es_personal_clinica());

create policy "el personal sube fotos de producto"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'productos' and public.es_personal_clinica());

create policy "el personal reemplaza fotos de producto"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos' and public.es_personal_clinica())
  with check (bucket_id = 'productos' and public.es_personal_clinica());

create policy "el personal borra fotos de producto"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos' and public.es_personal_clinica());

-- ---------------------------------------------------------------------------
-- stock_actual necesita imagen_url para que el panel la muestre y la edite.
-- catalogo_tienda() ya la devuelve desde que se creó (fase 7).
-- ---------------------------------------------------------------------------

-- imagen_url va al final: CREATE OR REPLACE VIEW sólo permite agregar
-- columnas al final de la lista, no insertarlas en el medio. Meterla antes de
-- "cantidad" renombraría esa columna existente en vez de sumar una nueva.
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
       coalesce(sum(m.cantidad), 0) <= p.stock_minimo as bajo_minimo,
       p.imagen_url
  from public.producto p
  left join public.movimiento_stock m on m.producto_id = p.id
 where p.archivado_en is null
 group by p.id;

comment on view public.stock_actual is
  'security_invoker: la vista respeta las políticas de quien la consulta, no las del dueño.';

grant select on public.stock_actual to authenticated;
