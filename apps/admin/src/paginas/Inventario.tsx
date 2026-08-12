import { Boton, Campo, Cargando, cn, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type StockActual,
  useActualizarProducto,
  useAlertas,
  useCrearProducto,
  useRegistrarMovimiento,
  useStock,
} from '../features/inventario/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function Inventario() {
  const { supabase } = useAuth();
  const { data: stock, isLoading, isError, refetch } = useStock(supabase);
  const { data: alertas } = useAlertas(supabase);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtrado = (stock ?? []).filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Inventario</h1>
        {!creando && <Boton onClick={() => setCreando(true)}>Nuevo producto</Boton>}
      </div>

      {alertas && alertas.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-900">
            {alertas.length} {alertas.length === 1 ? 'alerta' : 'alertas'}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alertas.map((a) => (
              <li key={`${a.tipo}-${a.producto_id}-${a.detalle}`} className="text-amber-900">
                <span
                  className={cn(
                    'mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium',
                    a.tipo === 'vencido' && 'bg-red-200 text-red-900',
                    a.tipo === 'por_vencer' && 'bg-amber-200 text-amber-900',
                    a.tipo === 'bajo_minimo' && 'bg-slate-200 text-slate-700',
                  )}
                >
                  {a.tipo === 'vencido'
                    ? 'Vencido'
                    : a.tipo === 'por_vencer'
                      ? 'Por vencer'
                      : 'Reponer'}
                </span>
                <strong>{a.producto}</strong> · {a.detalle}
              </li>
            ))}
          </ul>
        </section>
      )}

      {creando && <FormularioProducto onCerrar={() => setCreando(false)} />}

      <div className="mt-4">
        <label htmlFor="buscar-prod" className="sr-only">
          Buscar producto
        </label>
        <Entrada
          id="buscar-prod"
          type="search"
          placeholder="Buscar producto"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mt-0"
        />
      </div>

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      {isLoading && <Cargando etiqueta="Cargando inventario" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar el inventario"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {stock && filtrado.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo={busqueda ? 'Sin resultados' : 'Todavía no cargaste productos'}
            descripcion={busqueda ? undefined : 'Agregá el primero para empezar a controlar stock.'}
          />
        </div>
      )}

      {filtrado.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Producto</th>
                <th className="pb-2 font-medium">Precio</th>
                <th className="pb-2 font-medium">Stock</th>
                <th className="pb-2 font-medium">Tienda</th>
                <th className="pb-2 font-medium">Movimiento</th>
              </tr>
            </thead>
            <tbody>
              {filtrado.map((p) => (
                <FilaProducto key={p.producto_id} producto={p} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

function FilaProducto({
  producto: p,
  onError,
}: {
  producto: StockActual;
  onError: (e: string | null) => void;
}) {
  const { supabase } = useAuth();
  const movimiento = useRegistrarMovimiento(supabase);
  const actualizar = useActualizarProducto(supabase);
  const [cantidad, setCantidad] = useState('');

  const registrar = (tipo: 'ingreso' | 'ajuste') => {
    const n = Number(cantidad);
    if (!n) return;
    onError(null);
    movimiento.mutate(
      { productoId: p.producto_id, tipo, cantidad: tipo === 'ingreso' ? Math.abs(n) : n },
      { onSuccess: () => setCantidad(''), onError: (e) => onError(e.message) },
    );
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2.5">
        <span className="font-medium">{p.nombre}</span>
        {p.requiere_receta && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
            Receta
          </span>
        )}
        {p.categoria && <span className="block text-xs text-slate-500">{p.categoria}</span>}
      </td>
      <td className="py-2.5">{pesos(Number(p.precio))}</td>
      <td className="py-2.5">
        <span className={p.bajo_minimo ? 'font-medium text-amber-700' : ''}>{p.cantidad}</span>
        {p.stock_minimo > 0 && (
          <span className="ml-1 text-xs text-slate-400">/ mín {p.stock_minimo}</span>
        )}
      </td>
      <td className="py-2.5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={p.visible_en_tienda}
            disabled={p.requiere_receta}
            onChange={(e) =>
              actualizar.mutate({ id: p.producto_id, visible_en_tienda: e.target.checked })
            }
            className="size-4 rounded border-slate-300"
          />
          <span className="sr-only">Visible en la tienda</span>
        </label>
      </td>
      <td className="py-2.5">
        <div className="flex items-center gap-2">
          <label htmlFor={`cant-${p.producto_id}`} className="sr-only">
            Cantidad
          </label>
          <input
            id={`cant-${p.producto_id}`}
            type="number"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <Boton
            variante="secundario"
            className="text-sm"
            cargando={movimiento.isPending}
            onClick={() => registrar('ingreso')}
          >
            Ingresar
          </Boton>
          <Boton
            variante="texto"
            className="text-sm text-slate-500"
            onClick={() => registrar('ajuste')}
          >
            Ajustar
          </Boton>
        </div>
      </td>
    </tr>
  );
}

function FormularioProducto({ onCerrar }: { onCerrar: () => void }) {
  const { supabase } = useAuth();
  const crear = useCrearProducto(supabase);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    nombre: '',
    precio: '',
    categoria: '',
    stock_minimo: '0',
    requiere_receta: false,
    visible_en_tienda: false,
  });

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!d.nombre.trim() || !d.precio) {
          setError('El nombre y el precio son obligatorios');
          return;
        }
        setError(null);
        crear.mutate(
          {
            nombre: d.nombre.trim(),
            precio: Number(d.precio),
            stock_minimo: Number(d.stock_minimo) || 0,
            requiere_receta: d.requiere_receta,
            // Un producto con receta nunca va a la tienda, aunque se tilde.
            visible_en_tienda: d.visible_en_tienda && !d.requiere_receta,
            ...(d.categoria.trim() && { categoria: d.categoria.trim() }),
          },
          { onSuccess: onCerrar, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <h2 className="font-medium">Nuevo producto</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="p-nombre" etiqueta="Nombre">
          <Entrada
            id="p-nombre"
            autoFocus
            value={d.nombre}
            onChange={(e) => setD({ ...d, nombre: e.target.value })}
          />
        </Campo>
        <Campo id="p-categoria" etiqueta="Categoría" ayuda="Opcional">
          <Entrada
            id="p-categoria"
            value={d.categoria}
            onChange={(e) => setD({ ...d, categoria: e.target.value })}
          />
        </Campo>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="p-precio" etiqueta="Precio">
          <Entrada
            id="p-precio"
            type="number"
            step="0.01"
            value={d.precio}
            onChange={(e) => setD({ ...d, precio: e.target.value })}
          />
        </Campo>
        <Campo id="p-minimo" etiqueta="Stock mínimo" ayuda="Avisa cuando baja de acá">
          <Entrada
            id="p-minimo"
            type="number"
            value={d.stock_minimo}
            onChange={(e) => setD({ ...d, stock_minimo: e.target.value })}
          />
        </Campo>
      </div>

      <div className="mt-3 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.requiere_receta}
            onChange={(e) =>
              setD({
                ...d,
                requiere_receta: e.target.checked,
                visible_en_tienda: e.target.checked ? false : d.visible_en_tienda,
              })
            }
            className="size-4 rounded border-slate-300"
          />
          Requiere receta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.visible_en_tienda}
            disabled={d.requiere_receta}
            onChange={(e) => setD({ ...d, visible_en_tienda: e.target.checked })}
            className="size-4 rounded border-slate-300"
          />
          Vender en la tienda
          {d.requiere_receta && (
            <span className="text-xs text-slate-500">(no, requiere receta)</span>
          )}
        </label>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={crear.isPending}>
          Crear
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
