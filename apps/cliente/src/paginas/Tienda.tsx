import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';

interface ProductoTienda {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  precio_promocional: number | null;
  promocion_titulo: string | null;
  imagen_url: string | null;
  disponible: number;
}

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function Tienda() {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const {
    data: productos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['catalogo'],
    // El stock cambia mientras el usuario mira: no conviene servir caché vieja.
    staleTime: 0,
    queryFn: async (): Promise<ProductoTienda[]> => {
      const { data, error: err } = await supabase.rpc('catalogo_tienda');
      if (err) throw err;
      return data as ProductoTienda[];
    },
  });

  const iniciarCompra = useMutation({
    mutationFn: async (): Promise<string> => {
      const items = Object.entries(carrito)
        .filter(([, c]) => c > 0)
        .map(([producto_id, cantidad]) => ({ producto_id, cantidad }));

      const { data, error: err } = await supabase.rpc('crear_orden_online', { p_items: items });
      // El mensaje de la base dice qué producto se quedó sin stock.
      if (err) throw new Error(err.message);
      return (data as { id: string }).id;
    },
  });

  const precioEfectivo = (p: ProductoTienda) => Number(p.precio_promocional ?? p.precio);
  const total = (productos ?? []).reduce((s, p) => s + (carrito[p.id] ?? 0) * precioEfectivo(p), 0);
  const unidades = Object.values(carrito).reduce((s, c) => s + c, 0);

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Tienda" volverA="/" />

      {isLoading && <Cargando etiqueta="Cargando productos" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar la tienda" onReintentar={() => void refetch()} />
        </div>
      )}

      {productos && productos.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo="La tienda está vacía"
            descripcion="La clínica todavía no publicó productos."
          />
        </div>
      )}

      {productos && productos.length > 0 && (
        <ul className="mt-4 space-y-2 pb-28">
          {productos.map((p) => {
            const cantidad = carrito[p.id] ?? 0;
            const sinStock = p.disponible <= 0;

            return (
              <li
                key={p.id}
                className={
                  sinStock
                    ? 'rounded-xl border border-slate-200 p-3 opacity-60'
                    : 'rounded-xl border border-slate-200 p-3'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    {p.imagen_url && (
                      <img
                        src={p.imagen_url}
                        alt=""
                        className="size-14 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{p.nombre}</p>
                      {p.descripcion && <p className="text-sm text-slate-500">{p.descripcion}</p>}
                      {p.precio_promocional !== null ? (
                        <p className="mt-1 flex flex-wrap items-baseline gap-2">
                          <span className="text-sm text-slate-400 line-through tabular-nums">
                            {pesos(Number(p.precio))}
                          </span>
                          <span className="font-medium tabular-nums text-acento-700">
                            {pesos(Number(p.precio_promocional))}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 font-medium tabular-nums">{pesos(Number(p.precio))}</p>
                      )}
                      {p.promocion_titulo && (
                        <p className="mt-0.5 text-xs font-medium text-acento-700">
                          {p.promocion_titulo}
                        </p>
                      )}
                      {sinStock ? (
                        <p className="text-xs text-slate-500">Sin stock</p>
                      ) : (
                        p.disponible <= 3 && (
                          <p className="text-xs text-amber-700">Quedan {p.disponible}</p>
                        )
                      )}
                    </div>
                  </div>

                  {!sinStock && (
                    <div className="flex shrink-0 items-center gap-2">
                      {cantidad > 0 && (
                        <>
                          <button
                            type="button"
                            aria-label={`Quitar uno de ${p.nombre}`}
                            onClick={() =>
                              setCarrito((c) => ({ ...c, [p.id]: Math.max(0, cantidad - 1) }))
                            }
                            className="size-9 rounded-lg border border-slate-300 text-lg"
                          >
                            −
                          </button>
                          <span className="w-6 text-center tabular-nums">{cantidad}</span>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`Agregar ${p.nombre}`}
                        disabled={cantidad >= p.disponible}
                        onClick={() => setCarrito((c) => ({ ...c, [p.id]: cantidad + 1 }))}
                        className="size-9 rounded-lg border border-slate-300 text-lg disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {unidades > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
          <div className="mx-auto max-w-md">
            {error && (
              <div className="mb-3">
                <MensajeError detalle={error} />
              </div>
            )}
            <Boton
              className="w-full"
              cargando={iniciarCompra.isPending}
              onClick={() => {
                setError(null);
                iniciarCompra.mutate(undefined, {
                  onSuccess: (id) => void navigate(`/tienda/orden/${id}`),
                  onError: (e) => setError(e.message),
                });
              }}
            >
              Comprar {unidades} {unidades === 1 ? 'artículo' : 'artículos'} · {pesos(total)}
            </Boton>
          </div>
        </div>
      )}
    </main>
  );
}
