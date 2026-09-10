import { formatearFechaCivil, hoyCivil, puedeVerMetricas } from '@ojosdecielo/core';
import { Boton, Campo, Cargando, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  useCrearGastoFijo,
  useHistorialGasto,
  useRegistrarMonto,
  useResumenGastos,
} from '../features/gastos/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

/** El primer día del mes actual, en fecha civil: "2026-09-10" → "2026-09-01". */
const mesActual = () => `${hoyCivil().slice(0, 7)}-01`;

export function GastosFijos() {
  const { supabase, perfil } = useAuth();
  const esAdmin = perfil ? puedeVerMetricas(perfil.roles) : false;
  // Habilitado sólo cuando corresponde: la RPC igual lo exige (RLS de verdad
  // vive ahí), esto es sólo para no disparar una consulta que va a fallar.
  const { data: gastos, isLoading, isError, refetch } = useResumenGastos(supabase, esAdmin);
  const [creando, setCreando] = useState(false);

  const total = (gastos ?? []).reduce((s, g) => s + Number(g.ultimo_monto ?? 0), 0);

  if (!esAdmin) {
    return (
      <Layout>
        <h1 className="text-xl font-semibold">Gastos fijos</h1>
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Es información financiera de la clínica: la ve sólo el administrador.
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Gastos fijos</h1>
        {!creando && <Boton onClick={() => setCreando(true)}>Nuevo gasto</Boton>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Alquiler, servicios, seguros… Cada mes se carga (o se corrige) el monto vigente. Es sólo del
        administrador.
      </p>

      {gastos && gastos.length > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Total del último monto cargado de cada gasto: <strong>{pesos(total)}</strong>
        </p>
      )}

      {creando && <FormularioGasto onCerrar={() => setCreando(false)} />}

      {isLoading && <Cargando etiqueta="Cargando gastos fijos" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar" onReintentar={() => void refetch()} />
        </div>
      )}

      {gastos && gastos.length === 0 && (
        <div className="mt-6">
          <Vacio titulo="Todavía no hay gastos cargados" descripcion="Empezá con «Nuevo gasto»." />
        </div>
      )}

      {gastos && gastos.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {gastos.map((g) => (
            <FilaGasto key={g.gasto_fijo_id} gasto={g} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function FilaGasto({
  gasto,
}: {
  gasto: {
    gasto_fijo_id: string;
    concepto: string;
    categoria: string | null;
    ultimo_periodo: string | null;
    ultimo_monto: number | null;
  };
}) {
  const { supabase } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const { data: historial } = useHistorialGasto(supabase, gasto.gasto_fijo_id, abierto);
  const registrar = useRegistrarMonto(supabase, gasto.gasto_fijo_id);
  const [periodo, setPeriodo] = useState(mesActual());
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="p-3 text-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="font-medium">{gasto.concepto}</span>
          {gasto.categoria && (
            <span className="ml-2 text-xs text-slate-400">{gasto.categoria}</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {gasto.ultimo_monto != null ? (
            <>
              <span className="tabular-nums">{pesos(Number(gasto.ultimo_monto))}</span>
              {gasto.ultimo_periodo && (
                <span className="ml-2 text-xs text-slate-400">
                  {formatearFechaCivil(gasto.ultimo_periodo)}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">Sin montos cargados</span>
          )}
        </span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {!cargando ? (
            <Boton variante="texto" className="text-xs" onClick={() => setCargando(true)}>
              Cargar / corregir un mes
            </Boton>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(monto);
                if (!(n > 0)) {
                  setError('Poné un monto mayor a cero');
                  return;
                }
                setError(null);
                registrar.mutate(
                  { periodo, monto: n },
                  {
                    onSuccess: () => {
                      setCargando(false);
                      setMonto('');
                    },
                    onError: (err) => setError(err.message),
                  },
                );
              }}
            >
              <Campo id={`gf-mes-${gasto.gasto_fijo_id}`} etiqueta="Mes">
                <input
                  id={`gf-mes-${gasto.gasto_fijo_id}`}
                  type="month"
                  value={periodo.slice(0, 7)}
                  onChange={(e) => setPeriodo(`${e.target.value}-01`)}
                  className="mt-1 min-h-11 rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </Campo>
              <Campo id={`gf-monto-${gasto.gasto_fijo_id}`} etiqueta="Monto">
                <Entrada
                  id={`gf-monto-${gasto.gasto_fijo_id}`}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </Campo>
              <Boton type="submit" className="text-sm" cargando={registrar.isPending}>
                Guardar
              </Boton>
              <Boton variante="secundario" className="text-sm" onClick={() => setCargando(false)}>
                Cancelar
              </Boton>
            </form>
          )}

          {error && <MensajeError detalle={error} />}

          {historial && historial.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-500">
              {historial.map((h) => (
                <li key={h.id} className="flex justify-between">
                  <span>{formatearFechaCivil(h.periodo)}</span>
                  <span className="tabular-nums">{pesos(Number(h.monto))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function FormularioGasto({ onCerrar }: { onCerrar: () => void }) {
  const { supabase } = useAuth();
  const crear = useCrearGastoFijo(supabase);
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!concepto.trim()) {
          setError('Poné el concepto');
          return;
        }
        setError(null);
        crear.mutate(
          { concepto, ...(categoria.trim() && { categoria }) },
          { onSuccess: onCerrar, onError: (err) => setError(err.message) },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="gf-concepto" etiqueta="Concepto">
          <Entrada
            id="gf-concepto"
            autoFocus
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Alquiler, luz, seguro del auto…"
          />
        </Campo>
        <Campo id="gf-cat" etiqueta="Categoría" ayuda="Opcional">
          <Entrada id="gf-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </Campo>
      </div>
      {error && <MensajeError detalle={error} />}
      <div className="flex gap-2">
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
