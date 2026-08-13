import { formatearFechaCivil, formatearFechaHora, puedeVerMetricas } from '@ojosdecielo/core';
import { Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useFlujoMensual, useHistorialCajas } from './api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-08-01` → `ago 2026`, sin pasar por Date para no correr el mes. */
const etiquetaMes = (mes: string) => {
  const [anio, m] = mes.slice(0, 7).split('-');
  return `${MESES[Number(m) - 1] ?? m} ${anio}`;
};

/**
 * Los cierres de caja anteriores y el movimiento de dinero por mes.
 *
 * Los cierres se guardaban desde el principio —monto declarado, calculado y
 * diferencia— pero no había dónde verlos, y un arqueo que no se puede
 * consultar después no sirve para explicar una diferencia.
 *
 * El corte de acceso no es el mismo para las dos cosas: los cierres los ve
 * quien opera la caja, porque los necesita para su trabajo; el acumulado por
 * mes es del administrador, igual que la facturación del tablero.
 */
export function HistorialCaja() {
  const { supabase, perfil } = useAuth();
  const esAdmin = puedeVerMetricas(perfil?.roles);

  const { data: cierres, isLoading, isError, refetch } = useHistorialCajas(supabase);
  const { data: meses } = useFlujoMensual(supabase, esAdmin);
  const [abierto, setAbierto] = useState<string | null>(null);

  const maximo = Math.max(1, ...(meses ?? []).map((m) => Math.max(m.ingresos, m.egresos)));

  return (
    <div className="mt-10 space-y-10">
      {esAdmin && meses && meses.length > 0 && (
        <section>
          <h2 className="font-medium">Entradas y salidas por mes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Todo lo que pasó por la caja, incluidas las compras de la app.
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Mes</th>
                  <th className="px-4 py-2 font-medium">Entró</th>
                  <th className="px-4 py-2 font-medium">Salió</th>
                  <th className="px-4 py-2 font-medium">Neto</th>
                  <th className="px-4 py-2 font-medium">Efectivo</th>
                  <th className="px-4 py-2 font-medium">Otros medios</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="capitalize">{etiquetaMes(m.mes)}</span>
                      {/* Una barra proporcional al mes más alto: alcanza para
                          ver la tendencia sin cargar una librería de gráficos
                          en una pantalla que se abre para cerrar la caja. */}
                      <span
                        aria-hidden="true"
                        className="mt-1 block h-1 rounded bg-marca-500"
                        style={{ width: `${Math.round((Number(m.ingresos) / maximo) * 100)}%` }}
                      />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{pesos(Number(m.ingresos))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">
                      {Number(m.egresos) > 0 ? `−${pesos(Number(m.egresos))}` : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2.5 font-medium tabular-nums',
                        Number(m.neto) < 0 && 'text-red-700',
                      )}
                    >
                      {pesos(Number(m.neto))}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">
                      {pesos(Number(m.efectivo))}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">
                      {pesos(Number(m.otros_medios))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-medium">Cierres anteriores</h2>

        {isLoading && <Cargando etiqueta="Cargando cierres" />}

        {isError && (
          <div className="mt-3">
            <MensajeError
              titulo="No pudimos cargar los cierres"
              onReintentar={() => void refetch()}
            />
          </div>
        )}

        {cierres && cierres.length === 0 && (
          <div className="mt-3">
            <Vacio
              titulo="Todavía no cerraste ninguna caja"
              descripcion="Cuando cierres el turno, el arqueo queda guardado acá."
            />
          </div>
        )}

        {cierres && cierres.length > 0 && (
          <ul className="mt-3 space-y-2">
            {cierres.map((c) => {
              const dif = Number(c.diferencia);
              const expandido = abierto === c.id;

              return (
                <li key={c.id} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setAbierto(expandido ? null : c.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                  >
                    <span>
                      <span className="font-medium">
                        {formatearFechaCivil(c.cerrado_en.slice(0, 10))}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">
                        cerró {c.cerrado_por ?? '—'}
                      </span>
                    </span>

                    <span className="flex items-center gap-4 text-sm">
                      <span className="tabular-nums text-slate-500">
                        {pesos(Number(c.monto_declarado))} contados
                      </span>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs font-medium tabular-nums',
                          dif === 0 && 'bg-emerald-100 text-emerald-800',
                          dif !== 0 && 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {dif === 0 ? 'Sin diferencia' : `${dif > 0 ? '+' : ''}${pesos(dif)}`}
                      </span>
                    </span>
                  </button>

                  {expandido && (
                    <dl className="grid gap-x-6 gap-y-2 border-t border-slate-100 p-4 text-sm sm:grid-cols-2">
                      <Dato etiqueta="Abrió" valor={`${c.abierto_por}`} />
                      <Dato etiqueta="Desde" valor={formatearFechaHora(c.abierto_en)} />
                      <Dato etiqueta="Hasta" valor={formatearFechaHora(c.cerrado_en)} />
                      <Dato etiqueta="Monto inicial" valor={pesos(Number(c.monto_inicial))} />
                      <Dato etiqueta="Ingresos del turno" valor={pesos(Number(c.ingresos))} />
                      <Dato etiqueta="Egresos del turno" valor={pesos(Number(c.egresos))} />
                      <Dato
                        etiqueta="Debía haber en el cajón"
                        valor={pesos(Number(c.monto_calculado))}
                      />
                      <Dato etiqueta="Se contó" valor={pesos(Number(c.monto_declarado))} />
                      <Dato etiqueta="Ventas cobradas" valor={String(c.ventas)} />
                      {c.notas && (
                        <div className="sm:col-span-2">
                          <dt className="text-slate-500">Notas</dt>
                          <dd className="text-slate-700">{c.notas}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
