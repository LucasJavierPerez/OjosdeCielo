import { formatearFechaCivil, puedeVerMetricas } from '@ojosdecielo/core';
import { Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import {
  type Rango,
  useMetricasProfesionales,
  useMetricasVentas,
  usePacientesInactivos,
  useResumen,
  useTurnosPorDia,
} from '../features/metricas/api.js';

// Recharts pesa medio megabyte y el panel se abre todos los días en la agenda,
// no acá. Misma decisión que en la app cliente.
const GraficoTurnos = lazy(() =>
  import('../features/metricas/GraficoTurnos.js').then((m) => ({ default: m.GraficoTurnos })),
);

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const hoy = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const haceDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const RANGOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
];

export function Tablero() {
  const { supabase, perfil } = useAuth();
  const [dias, setDias] = useState(30);
  const [mesesInactividad, setMesesInactividad] = useState(12);

  const rango: Rango = { desde: haceDias(dias), hasta: hoy() };
  const esAdmin = perfil ? puedeVerMetricas(perfil.roles) : false;

  const { data: resumen, isLoading, isError, refetch } = useResumen(supabase, rango);
  const { data: turnos } = useTurnosPorDia(supabase, rango);
  const { data: profesionales } = useMetricasProfesionales(supabase, rango);
  const { data: ventas } = useMetricasVentas(supabase, rango, esAdmin);
  const { data: inactivos } = usePacientesInactivos(supabase, mesesInactividad);

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Tablero</h1>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGOS.map((r) => (
            <button
              key={r.dias}
              type="button"
              onClick={() => setDias(r.dias)}
              className={
                dias === r.dias
                  ? 'rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100'
              }
            >
              {r.texto}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Cargando etiqueta="Calculando métricas" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos calcular las métricas"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {resumen && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tarjeta titulo="Pacientes nuevos" valor={resumen.pacientes_nuevos} />
          <Tarjeta titulo="Consultas" valor={resumen.consultas} />
          <Tarjeta titulo="Turnos atendidos" valor={resumen.turnos_atendidos} />
          <Tarjeta
            titulo="Ausentismo"
            valor={`${resumen.ausentismo}%`}
            alerta={resumen.ausentismo >= 15}
            nota="Sobre los turnos que llegaron a su hora"
          />
          <Tarjeta titulo="Recetas emitidas" valor={resumen.recetas_emitidas} />
        </div>
      )}

      {turnos && turnos.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">Turnos por día</h2>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <Suspense
              fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-slate-100" />}
            >
              <GraficoTurnos datos={turnos} />
            </Suspense>
          </div>
        </section>
      )}

      {profesionales && profesionales.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">Por profesional</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Profesional</th>
                  <th className="px-4 py-2 font-medium">Atendidos</th>
                  <th className="px-4 py-2 font-medium">Consultas</th>
                  <th className="px-4 py-2 font-medium">Cancelados</th>
                  <th className="px-4 py-2 font-medium">Ausentes</th>
                </tr>
              </thead>
              <tbody>
                {profesionales.map((p) => (
                  <tr key={p.profesional_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.profesional}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.atendidos}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.consultas}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{p.cancelados}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{p.ausentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {esAdmin && ventas && (
        <section className="mt-8">
          <h2 className="font-medium">Ventas</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Facturado en el período</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {pesos(Number(ventas.facturado))}
              </p>
              <p className="text-sm text-slate-500">
                {ventas.ordenes} {ventas.ordenes === 1 ? 'venta' : 'ventas'}
              </p>

              {ventas.por_canal.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm">
                  {ventas.por_canal.map((c) => (
                    <li key={c.canal} className="flex justify-between">
                      <span className="text-slate-600">
                        {c.canal === 'app' ? 'Tienda online' : 'Mostrador'}
                      </span>
                      <span className="tabular-nums">{pesos(Number(c.monto))}</span>
                    </li>
                  ))}
                </ul>
              )}

              {ventas.por_medio.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                  {ventas.por_medio.map((m) => (
                    <li key={m.medio} className="flex justify-between">
                      <span className="capitalize text-slate-600">{m.medio}</span>
                      <span className="tabular-nums">{pesos(Number(m.monto))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Lo que más sale</p>
              {ventas.productos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Sin ventas en el período.</p>
              ) : (
                <ol className="mt-3 space-y-2 text-sm">
                  {ventas.productos.map((p) => (
                    <li key={p.producto} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{p.producto}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        {p.unidades} u · {pesos(Number(p.monto))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-medium">Pacientes que dejaron de venir</h2>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[6, 12, 24].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMesesInactividad(m)}
                className={
                  mesesInactividad === m
                    ? 'rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white'
                    : 'rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100'
                }
              >
                +{m} meses
              </button>
            ))}
          </div>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          Esto es una lista de llamados por hacer, no un número para mirar.
        </p>

        {inactivos && inactivos.length === 0 && (
          <div className="mt-3">
            <Vacio
              titulo="Ningún paciente perdido"
              descripcion={`Todos los pacientes activos vinieron en los últimos ${mesesInactividad} meses.`}
            />
          </div>
        )}

        {inactivos && inactivos.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Paciente</th>
                  <th className="px-4 py-2 font-medium">Última atención</th>
                  <th className="px-4 py-2 font-medium">Tutor</th>
                  <th className="px-4 py-2 font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {inactivos.slice(0, 50).map((p) => (
                  <tr key={p.mascota_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/pacientes/${p.mascota_id}`}
                        className="font-medium hover:text-blue-700 hover:underline"
                      >
                        {p.mascota}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{p.especie}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {p.ultima_atencion
                        ? formatearFechaCivil(p.ultima_atencion.slice(0, 10))
                        : 'Nunca'}
                      <span className="ml-2 text-xs text-slate-400">
                        hace {p.meses_sin_venir} meses
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{p.tutor ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {p.telefono ? (
                        <a href={`tel:${p.telefono}`} className="hover:underline">
                          {p.telefono}
                        </a>
                      ) : (
                        (p.email ?? '—')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inactivos.length > 50 && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                Se muestran los 50 más antiguos de {inactivos.length}.
              </p>
            )}
          </div>
        )}
      </section>

      {!esAdmin && (
        <p className="mt-8 text-sm text-slate-500">
          La facturación y la rotación de productos las ve el administrador.
        </p>
      )}
    </Layout>
  );
}

function Tarjeta({
  titulo,
  valor,
  alerta,
  nota,
}: {
  titulo: string;
  valor: number | string;
  alerta?: boolean;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p
        className={
          alerta
            ? 'mt-1 text-2xl font-semibold tabular-nums text-amber-700'
            : 'mt-1 text-2xl font-semibold tabular-nums'
        }
      >
        {valor}
      </p>
      {nota && <p className="mt-1 text-[11px] leading-tight text-slate-400">{nota}</p>}
    </div>
  );
}
