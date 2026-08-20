-- Promociones: descuentos con fecha, calculados por el sistema.
--
-- No es Campañas (push segmentado, fase 8): esto baja el precio de verdad en
-- la tienda mientras esté vigente, sin que nadie tenga que acordarse de
-- aplicarlo en el mostrador. Alcance mutuamente excluyente: un producto
-- puntual, una categoría entera, o —si no se especifica ninguno— todo el
-- catálogo.

create table public.promocion (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(trim(titulo)) between 1 and 80),
  tipo_descuento text not null check (tipo_descuento in ('porcentaje', 'monto')),
  valor          numeric(12,2) not null check (valor > 0),
  producto_id    uuid references public.producto(id),
  categoria      text,
  desde          date not null,
  hasta          date not null,
  activa         boolean not null default true,
  creada_por     uuid default auth.uid() references public.perfil(id),
  creada_en      timestamptz not null default now(),

  check (hasta >= desde),
  check (producto_id is null or categoria is null),
  check (tipo_descuento <> 'porcentaje' or valor <= 100)
);

create index promocion_producto_idx on public.promocion (producto_id) where producto_id is not null;
create index promocion_categoria_idx on public.promocion (categoria) where categoria is not null;
create index promocion_vigencia_idx on public.promocion (desde, hasta) where activa;

alter table public.promocion enable row level security;
grant select, insert, update on public.promocion to authenticated;

create policy "el personal gestiona promociones"
  on public.promocion for all
  to authenticated
  using (public.es_personal_clinica())
  with check (public.es_personal_clinica());

-- Un tutor no gestiona nada, pero sí necesita poder leer una promo vigente
-- para el cartel de la tienda: catalogo_tienda() ya resuelve el precio con
-- security definer, así que esto es sólo para quien quiera mostrar el título
-- de la promo por fuera de esa función.
create policy "cualquiera ve promociones vigentes"
  on public.promocion for select
  to authenticated
  using (activa and current_date between desde and hasta);

/*
 * La promoción vigente que mejor aplica a un producto, si hay alguna.
 *
 * Precedencia: producto puntual > categoría > todo el catálogo. Si hay más de
 * una promoción vigente en el mismo nivel (dos categorías coinciden, por
 * ejemplo no debería pasar por el alcance excluyente, pero por las dudas) se
 * queda con la que da el precio más bajo — nunca deja al tutor pagando de más
 * por una ambigüedad de carga.
 */
create or replace function public.precio_con_promocion(
  p_producto_id uuid,
  p_categoria   text,
  p_precio      numeric
)
returns table (precio_final numeric, titulo_promocion text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case pr.tipo_descuento
      when 'porcentaje' then round(p_precio * (1 - pr.valor / 100), 2)
      else greatest(p_precio - pr.valor, 0)
    end as precio_final,
    pr.titulo
    from public.promocion pr
   where pr.activa
     and current_date between pr.desde and pr.hasta
     and (
       pr.producto_id = p_producto_id
       or (pr.producto_id is null and pr.categoria is not null and pr.categoria = p_categoria)
       or (pr.producto_id is null and pr.categoria is null)
     )
   order by
     (pr.producto_id is not null) desc,
     (pr.producto_id is null and pr.categoria is not null) desc,
     case pr.tipo_descuento
       when 'porcentaje' then round(p_precio * (1 - pr.valor / 100), 2)
       else greatest(p_precio - pr.valor, 0)
     end asc
   limit 1;
$$;

grant execute on function public.precio_con_promocion to authenticated;

-- ---------------------------------------------------------------------------
-- catalogo_tienda() gana precio_promocional y promocion_titulo. Cambia el
-- tipo de retorno: hace falta DROP antes de CREATE, a diferencia de una vista.
-- ---------------------------------------------------------------------------

drop function public.catalogo_tienda();

create function public.catalogo_tienda()
returns table (
  id                 uuid,
  nombre             text,
  descripcion        text,
  categoria          text,
  precio             numeric,
  precio_promocional numeric,
  promocion_titulo   text,
  imagen_url         text,
  disponible         integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nombre, p.descripcion, p.categoria, p.precio,
         -- Nunca se muestra un "descuento" que no baja el precio.
         case when pc.precio_final < p.precio then pc.precio_final else null end,
         case when pc.precio_final < p.precio then pc.titulo_promocion else null end,
         p.imagen_url,
         public.stock_disponible(p.id)
    from public.producto p
    left join lateral public.precio_con_promocion(p.id, p.categoria, p.precio) pc on true
   where p.visible_en_tienda
     and not p.requiere_receta
     and p.archivado_en is null
   order by p.categoria nulls last, p.nombre;
$$;

revoke execute on function public.catalogo_tienda from public, anon;
grant execute on function public.catalogo_tienda to authenticated;

-- ---------------------------------------------------------------------------
-- crear_orden_online() tiene que cobrar lo mismo que la tienda muestra. Sin
-- esto, el carrito le mostraba al tutor el precio con descuento y el pedido
-- se creaba igual al precio de lista: la promoción existía en la pantalla,
-- no en lo que se cobraba.
-- ---------------------------------------------------------------------------

create or replace function public.crear_orden_online(p_items jsonb)
returns public.orden
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden  public.orden;
  v_item   jsonb;
  v_prod   public.producto;
  v_cant   integer;
  v_total  numeric(12,2) := 0;
  v_disp   integer;
  v_precio numeric(12,2);
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

    select precio_final into v_precio
      from public.precio_con_promocion(v_prod.id, v_prod.categoria, v_prod.precio);
    if v_precio is null or v_precio >= v_prod.precio then
      v_precio := v_prod.precio;
    end if;

    insert into public.orden_item
      (orden_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
    values
      (v_orden.id, v_prod.id, v_prod.nombre, v_cant, v_precio, v_precio * v_cant);

    insert into public.reserva_stock (orden_id, producto_id, cantidad)
    values (v_orden.id, v_prod.id, v_cant);

    v_total := v_total + v_precio * v_cant;
  end loop;

  update public.orden set total = v_total where id = v_orden.id returning * into v_orden;
  return v_orden;
end;
$$;

revoke execute on function public.crear_orden_online from public, anon;
grant execute on function public.crear_orden_online to authenticated;
