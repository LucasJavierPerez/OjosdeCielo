import { formatearFechaHora } from '@ojosdecielo/core';
import { Boton, Campo, Cargando, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type ItemVenta,
  type MedioPago,
  useAbrirCaja,
  useCerrarCaja,
  useMovimientoCaja,
  useResumenCaja,
  useStock,
  useVenderMostrador,
} from '../features/inventario/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const MEDIOS: { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
];

export function Caja() {
  const { supabase } = useAuth();
  const { data: caja, isLoading } = useResumenCaja(supabase);
  const abrir = useAbrirCaja(supabase);
  const [montoInicial, setMontoInicial] = useState('0');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Layout>
        <Cargando />
      </Layout>
    );
  }

  if (!caja) {
    return (
      <Layout>
        <h1 className="text-xl font-semibold">Caja</h1>
        <div className="mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-medium">La caja está cerrada</h2>
          <p className="mt-1 text-sm text-slate-600">
            Abrila para registrar ventas. El monto inicial es lo que hay en el cajón ahora.
          </p>

          <div className="mt-4">
            <Campo id="inicial" etiqueta="Monto inicial">
              <Entrada
                id="inicial"
                type="number"
                step="0.01"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
              />
            </Campo>
          </div>

          {error && (
            <div className="mt-3">
              <MensajeError detalle={error} />
            </div>
          )}

          <Boton
            className="mt-4"
            cargando={abrir.isPending}
            onClick={() => {
              setError(null);
              abrir.mutate(Number(montoInicial) || 0, { onError: (e) => setError(e.message) });
            }}
          >
            Abrir caja
          </Boton>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Caja</h1>
        <p className="text-sm text-slate-600">
          Abierta desde {formatearFechaHora(caja.abierta_en)}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Venta />
        </div>

        <div className="space-y-4">
          <ResumenActual caja={caja} />
          <MovimientoSuelto />
          <CierreCaja esperado={Number(caja.esperado_cajon)} />
        </div>
      </div>
    </Layout>
  );
}

function ResumenActual({ caja }: { caja: NonNullable<ReturnType<typeof useResumenCaja>['data']> }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Movimiento del turno</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Linea etiqueta="Monto inicial" valor={Number(caja.monto_inicial)} />
        <Linea etiqueta="Cobrado en efectivo" valor={Number(caja.efectivo)} />
        <Linea etiqueta="Otros medios" valor={Number(caja.otros_medios)} />
        <Linea etiqueta="Egresos" valor={-Number(caja.egresos)} />
        <div className="flex justify-between border-t border-slate-200 pt-2 font-medium">
          <dt>Debería haber en el cajón</dt>
          <dd className="tabular-nums">{pesos(Number(caja.esperado_cajon))}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        Sólo cuenta el efectivo: lo cobrado con tarjeta no está en el cajón.
      </p>
    </section>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{pesos(valor)}</dd>
    </div>
  );
}

function Venta() {
  const { supabase } = useAuth();
  const { data: stock } = useStock(supabase);
  const vender = useVenderMostrador(supabase);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ultima, setUltima] = useState<number | null>(null);

  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

  const disponibles = (stock ?? []).filter(
    (p) => p.cantidad > 0 && p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const agregar = (p: (typeof disponibles)[number]) => {
    setError(null);
    setUltima(null);
    setItems((prev) => {
      const existe = prev.find((i) => i.producto_id === p.producto_id);
      if (existe) {
        // No dejar superar el stock: el error de la base llegaría igual, pero
        // es mejor no permitirlo desde el vamos.
        if (existe.cantidad >= p.cantidad) return prev;
        return prev.map((i) =>
          i.producto_id === p.producto_id ? { ...i, cantidad: i.cantidad + 1 } : i,
        );
      }
      return [
        ...prev,
        { producto_id: p.producto_id, nombre: p.nombre, precio: Number(p.precio), cantidad: 1 },
      ];
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Venta de mostrador</h2>

      {ultima !== null && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Venta registrada por {pesos(ultima)}
        </p>
      )}

      <div className="mt-3">
        <label htmlFor="buscar-venta" className="sr-only">
          Buscar producto
        </label>
        <Entrada
          id="buscar-venta"
          type="search"
          placeholder="Buscar producto para agregar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mt-0"
        />
      </div>

      {busqueda && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
          {disponibles.slice(0, 8).map((p) => (
            <li key={p.producto_id}>
              <button
                type="button"
                onClick={() => agregar(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  {p.nombre}
                  <span className="ml-2 text-xs text-slate-400">{p.cantidad} en stock</span>
                </span>
                <span className="tabular-nums">{pesos(Number(p.precio))}</span>
              </button>
            </li>
          ))}
          {disponibles.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Sin resultados con stock</li>
          )}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.producto_id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="block truncate">{i.nombre}</span>
                  <span className="text-xs text-slate-500">
                    {i.cantidad} × {pesos(i.precio)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-sm">{pesos(i.precio * i.cantidad)}</span>
                  <Boton
                    variante="texto"
                    className="text-sm text-red-700"
                    onClick={() =>
                      setItems((prev) => prev.filter((x) => x.producto_id !== i.producto_id))
                    }
                  >
                    Quitar
                  </Boton>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
            <div>
              <label htmlFor="medio" className="block text-sm font-medium text-slate-700">
                Medio de pago
              </label>
              <Seleccion
                id="medio"
                value={medio}
                onChange={(e) => setMedio(e.target.value as MedioPago)}
                className="w-auto"
              >
                {MEDIOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </div>

            <p className="text-lg font-semibold tabular-nums">{pesos(total)}</p>
          </div>

          {error && (
            <div className="mt-3">
              <MensajeError detalle={error} />
            </div>
          )}

          <Boton
            className="mt-4 w-full"
            cargando={vender.isPending}
            onClick={() => {
              setError(null);
              vender.mutate(
                { items, medio },
                {
                  onSuccess: (o) => {
                    setUltima(Number(o.total));
                    setItems([]);
                    setBusqueda('');
                  },
                  onError: (e) => setError(e.message),
                },
              );
            }}
          >
            Cobrar {pesos(total)}
          </Boton>
        </>
      )}
    </section>
  );
}

function MovimientoSuelto() {
  const { supabase } = useAuth();
  const movimiento = useMovimientoCaja(supabase);
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ tipo: 'egreso' as 'ingreso' | 'egreso', monto: '', concepto: '' });
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <Boton variante="secundario" className="w-full text-sm" onClick={() => setAbierto(true)}>
        Registrar ingreso o egreso
      </Boton>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Movimiento de caja</h2>
      <p className="mt-1 text-xs text-slate-500">
        Para lo que no es una venta: pago a un proveedor, retiro, adelanto.
      </p>

      <div className="mt-3 space-y-3">
        <Seleccion
          value={d.tipo}
          onChange={(e) => setD({ ...d, tipo: e.target.value as 'ingreso' | 'egreso' })}
          aria-label="Tipo de movimiento"
        >
          <option value="egreso">Egreso</option>
          <option value="ingreso">Ingreso</option>
        </Seleccion>
        <Campo id="mc-monto" etiqueta="Monto">
          <Entrada
            id="mc-monto"
            type="number"
            step="0.01"
            value={d.monto}
            onChange={(e) => setD({ ...d, monto: e.target.value })}
          />
        </Campo>
        <Campo id="mc-concepto" etiqueta="Concepto">
          <Entrada
            id="mc-concepto"
            value={d.concepto}
            onChange={(e) => setD({ ...d, concepto: e.target.value })}
          />
        </Campo>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton
          className="text-sm"
          cargando={movimiento.isPending}
          onClick={() => {
            if (!Number(d.monto) || !d.concepto.trim()) {
              setError('Poné el monto y el concepto');
              return;
            }
            setError(null);
            movimiento.mutate(
              {
                tipo: d.tipo,
                monto: Number(d.monto),
                medio: 'efectivo',
                concepto: d.concepto.trim(),
              },
              {
                onSuccess: () => {
                  setD({ tipo: 'egreso', monto: '', concepto: '' });
                  setAbierto(false);
                },
                onError: (e) => setError(e.message),
              },
            );
          }}
        >
          Registrar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </section>
  );
}

function CierreCaja({ esperado }: { esperado: number }) {
  const { supabase } = useAuth();
  const cerrar = useCerrarCaja(supabase);
  const [abierto, setAbierto] = useState(false);
  const [declarado, setDeclarado] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ diferencia: number } | null>(null);

  if (resultado) {
    const dif = Number(resultado.diferencia);
    return (
      <section
        className={dif === 0 ? 'rounded-xl bg-emerald-50 p-4' : 'rounded-xl bg-amber-50 p-4'}
      >
        <h2 className="font-medium">Caja cerrada</h2>
        <p className="mt-1 text-sm">
          {dif === 0
            ? 'El arqueo cerró exacto.'
            : `Diferencia de ${pesos(dif)} ${dif > 0 ? '(sobra)' : '(falta)'}.`}
        </p>
      </section>
    );
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" className="w-full text-sm" onClick={() => setAbierto(true)}>
        Cerrar caja
      </Boton>
    );
  }

  const diferencia = declarado === '' ? null : Number(declarado) - esperado;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Cerrar caja</h2>
      <p className="mt-1 text-sm text-slate-600">
        Contá el efectivo del cajón y poné cuánto hay. Se compara con {pesos(esperado)}.
      </p>

      <div className="mt-3">
        <Campo id="declarado" etiqueta="Efectivo contado">
          <Entrada
            id="declarado"
            type="number"
            step="0.01"
            autoFocus
            value={declarado}
            onChange={(e) => setDeclarado(e.target.value)}
          />
        </Campo>
      </div>

      {diferencia !== null && diferencia !== 0 && (
        <p className={diferencia > 0 ? 'mt-2 text-sm text-amber-700' : 'mt-2 text-sm text-red-700'}>
          {diferencia > 0 ? 'Sobran' : 'Faltan'} {pesos(Math.abs(diferencia))}
        </p>
      )}

      <div className="mt-3">
        <Campo id="notas-cierre" etiqueta="Notas" ayuda="Opcional, para explicar una diferencia">
          <Entrada id="notas-cierre" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton
          className="text-sm"
          cargando={cerrar.isPending}
          onClick={() => {
            if (declarado === '') {
              setError('Poné cuánto efectivo contaste');
              return;
            }
            setError(null);
            cerrar.mutate(
              { declarado: Number(declarado), ...(notas.trim() && { notas }) },
              {
                onSuccess: (c) => setResultado({ diferencia: Number(c.diferencia) }),
                onError: (e) => setError(e.message),
              },
            );
          }}
        >
          Cerrar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </section>
  );
}
