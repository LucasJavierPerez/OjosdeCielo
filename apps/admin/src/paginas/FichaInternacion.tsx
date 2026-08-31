import {
  diasInternado,
  ETIQUETA_ESPECIE,
  esPersonalClinica,
  formatearFecha,
  formatearFechaHora,
  MOTIVOS_EGRESO,
  puedeCargarHistoriaClinica,
  TIPOS_ESTUDIO_SUGERIDOS,
  VIAS_ADMINISTRACION,
} from '@ojosdecielo/core';
import type { Especie } from '@ojosdecielo/db';
import { Boton, Campo, Cargando, cn, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import {
  type EstudioInternacion,
  type ResumenInternacion,
  urlEstudio,
  useActualizarInternacion,
  useActualizarResultadoEstudio,
  useAdjuntosInternacion,
  useAgregarCargo,
  useCargos,
  useCerrarInternacion,
  useEstudios,
  useEvoluciones,
  useInternacion,
  useMedicacion,
  usePagosInternacion,
  useRegistrarEstudio,
  useRegistrarEvolucion,
  useRegistrarMedicacion,
  useRegistrarPago,
  useSubirAdjuntoInternacion,
} from '../features/internaciones/api.js';
import { useStock } from '../features/inventario/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const MEDIOS: { valor: string; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'debito', texto: 'Débito' },
  { valor: 'credito', texto: 'Crédito' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'mercadopago', texto: 'Mercado Pago' },
  { valor: 'cuenta_corriente', texto: 'Cuenta corriente (queda como deuda)' },
];

export function FichaInternacion() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase, perfil } = useAuth();
  const { data: i, isLoading, isError, refetch } = useInternacion(supabase, id);

  const puedoClinica = perfil ? puedeCargarHistoriaClinica(perfil.roles) : false;
  const puedoCobrar = perfil ? esPersonalClinica(perfil.roles) : false;

  if (isLoading) {
    return (
      <Layout>
        <Cargando />
      </Layout>
    );
  }

  if (isError || !i) {
    return (
      <Layout>
        <MensajeError
          titulo="No encontramos esta internación"
          onReintentar={() => void refetch()}
        />
      </Layout>
    );
  }

  const activa = i.estado === 'activa';

  return (
    <Layout>
      <Link to="/internaciones" className="text-sm text-slate-500 hover:text-slate-900">
        ‹ Internación
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">
          <Link to={`/pacientes/${i.mascota_id}`} className="hover:text-marca-700">
            {i.mascota}
          </Link>
        </h1>
        <p className="text-slate-600">
          {ETIQUETA_ESPECIE[i.especie as Especie] ?? i.especie} · {i.profesional}
        </p>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            activa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700',
          )}
        >
          {activa ? `Internado · día ${diasInternado(i.ingreso_en)}` : 'Cerrada'}
        </span>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Ingreso {formatearFechaHora(i.ingreso_en)}
        {i.egreso_en && ` · Egreso ${formatearFechaHora(i.egreso_en)}`}
        {i.motivo_egreso && ` · ${i.motivo_egreso}`}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Encabezado internacion={i} puedoEditar={puedoClinica && activa} />

          <BloqueEvolucion
            internacionId={id}
            activa={activa}
            puedoCargar={puedoClinica}
            n={i.n_evoluciones}
          />
          <BloqueEstudios
            internacionId={id}
            ordenId={i.orden_id}
            mascotaId={i.mascota_id}
            activa={activa}
            puedoCargar={puedoClinica}
          />
          <BloqueMedicacion
            internacionId={id}
            ordenId={i.orden_id}
            activa={activa}
            puedoCargar={puedoClinica}
          />
        </div>

        <div className="lg:col-span-1">
          <BloqueCobros
            internacion={i}
            activa={activa}
            puedoCobrar={puedoCobrar}
            puedoCerrar={puedoClinica}
          />
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Encabezado clínico
// ---------------------------------------------------------------------------

function Encabezado({
  internacion,
  puedoEditar,
}: {
  internacion: ResumenInternacion;
  puedoEditar: boolean;
}) {
  const { supabase } = useAuth();
  const actualizar = useActualizarInternacion(supabase, internacion.id);
  const [editando, setEditando] = useState(false);
  const [diagnostico, setDiagnostico] = useState(internacion.diagnostico ?? '');
  const [ubicacion, setUbicacion] = useState(internacion.ubicacion ?? '');
  const [indicaciones, setIndicaciones] = useState(internacion.indicaciones ?? '');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">Cuadro</h2>
        {puedoEditar && !editando && (
          <Boton variante="texto" className="text-sm" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        )}
      </div>

      <dl className="mt-2 space-y-2 text-sm">
        <Dato termino="Motivo de internación" valor={internacion.motivo} />
        {!editando && (
          <>
            <Dato termino="Diagnóstico" valor={internacion.diagnostico ?? '—'} />
            <Dato termino="Ubicación" valor={internacion.ubicacion ?? '—'} />
            <Dato termino="Indicaciones" valor={internacion.indicaciones ?? '—'} />
          </>
        )}
      </dl>

      {editando && (
        <div className="mt-3 space-y-3">
          <Campo id="i-diag" etiqueta="Diagnóstico">
            <textarea
              id="i-diag"
              rows={2}
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo id="i-ubic" etiqueta="Ubicación" ayuda="Box, jaula, sala">
            <Entrada id="i-ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
          </Campo>
          <Campo id="i-indic" etiqueta="Indicaciones">
            <textarea
              id="i-indic"
              rows={3}
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          {error && <MensajeError detalle={error} />}
          <div className="flex gap-2">
            <Boton
              cargando={actualizar.isPending}
              onClick={() => {
                setError(null);
                actualizar.mutate(
                  { diagnostico, ubicacion, indicaciones },
                  { onSuccess: () => setEditando(false), onError: (e) => setError(e.message) },
                );
              }}
            >
              Guardar
            </Boton>
            <Boton variante="secundario" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </section>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{termino}</dt>
      <dd className="whitespace-pre-wrap text-slate-800">{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloque genérico
// ---------------------------------------------------------------------------

function Bloque({
  titulo,
  accion,
  vacio,
  children,
}: {
  titulo: string;
  accion?: ReactNode;
  vacio?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{titulo}</h2>
        {accion}
      </div>
      {vacio ? <p className="mt-2 text-sm text-slate-400">Sin registros</p> : children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Evolución
// ---------------------------------------------------------------------------

function BloqueEvolucion({
  internacionId,
  activa,
  puedoCargar,
  n,
}: {
  internacionId: string;
  activa: boolean;
  puedoCargar: boolean;
  n: number;
}) {
  const { supabase } = useAuth();
  const { data: evoluciones } = useEvoluciones(supabase, internacionId);
  const registrar = useRegistrarEvolucion(supabase, internacionId);
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Bloque
      titulo="Evolución"
      accion={
        puedoCargar && activa && !abierto ? (
          <Boton variante="texto" className="text-sm" onClick={() => setAbierto(true)}>
            Agregar parte
          </Boton>
        ) : null
      }
      vacio={(evoluciones?.length ?? n) === 0 && !abierto}
    >
      {abierto && (
        <form
          className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!nota.trim()) {
              setError('Escribí el parte');
              return;
            }
            setError(null);
            registrar.mutate(
              { nota, ...(temperatura.trim() && { temperatura }) },
              {
                onSuccess: () => {
                  setAbierto(false);
                  setNota('');
                  setTemperatura('');
                },
                onError: (e2) => setError(e2.message),
              },
            );
          }}
        >
          <Campo id="ev-nota" etiqueta="Parte de evolución">
            <textarea
              // biome-ignore lint/a11y/noAutofocus: formulario que el usuario abrió a propósito con un clic
              autoFocus
              id="ev-nota"
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo id="ev-temp" etiqueta="Temperatura (°C)" ayuda="Opcional">
            <Entrada
              id="ev-temp"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
            />
          </Campo>
          {error && <MensajeError detalle={error} />}
          <div className="flex gap-2">
            <Boton type="submit" cargando={registrar.isPending}>
              Guardar parte
            </Boton>
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {evoluciones && evoluciones.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {evoluciones.map((ev) => (
            <li key={ev.id} className="py-2.5 text-sm">
              <p className="text-xs text-slate-400">
                {formatearFechaHora(ev.fecha)}
                {ev.temperatura != null && ` · ${Number(ev.temperatura)} °C`}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{ev.nota}</p>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// Estudios
// ---------------------------------------------------------------------------

function BloqueEstudios({
  internacionId,
  ordenId,
  mascotaId,
  activa,
  puedoCargar,
}: {
  internacionId: string;
  ordenId: string;
  mascotaId: string;
  activa: boolean;
  puedoCargar: boolean;
}) {
  const { supabase } = useAuth();
  const { data: estudios } = useEstudios(supabase, internacionId);
  const { data: adjuntos } = useAdjuntosInternacion(supabase, internacionId);
  const registrar = useRegistrarEstudio(supabase, internacionId, ordenId);
  const subir = useSubirAdjuntoInternacion(supabase, internacionId, mascotaId);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('');
  const [resultado, setResultado] = useState('');
  const [cargoMonto, setCargoMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Bloque
      titulo="Estudios"
      accion={
        puedoCargar && activa && !abierto ? (
          <Boton variante="texto" className="text-sm" onClick={() => setAbierto(true)}>
            Pedir estudio
          </Boton>
        ) : null
      }
      vacio={(estudios?.length ?? 0) === 0 && (adjuntos?.length ?? 0) === 0 && !abierto}
    >
      {abierto && (
        <form
          className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!tipo.trim()) {
              setError('Poné el tipo de estudio');
              return;
            }
            setError(null);
            registrar.mutate(
              {
                tipo,
                ...(resultado.trim() && { resultado }),
                ...(cargoMonto.trim() && { cargo_monto: cargoMonto }),
              },
              {
                onSuccess: () => {
                  setAbierto(false);
                  setTipo('');
                  setResultado('');
                  setCargoMonto('');
                },
                onError: (e2) => setError(e2.message),
              },
            );
          }}
        >
          <Campo id="es-tipo" etiqueta="Tipo de estudio">
            <Entrada
              id="es-tipo"
              autoFocus
              list="tipos-estudio"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="Hemograma, bioquímica…"
            />
            <datalist id="tipos-estudio">
              {TIPOS_ESTUDIO_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Campo>
          <Campo id="es-result" etiqueta="Resultado" ayuda="Se puede cargar más tarde">
            <textarea
              id="es-result"
              rows={2}
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo
            id="es-cargo"
            etiqueta="Cargo ($)"
            ayuda="Opcional. Suma al total de la internación."
          >
            <Entrada
              id="es-cargo"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={cargoMonto}
              onChange={(e) => setCargoMonto(e.target.value)}
            />
          </Campo>
          {error && <MensajeError detalle={error} />}
          <div className="flex gap-2">
            <Boton type="submit" cargando={registrar.isPending}>
              Guardar
            </Boton>
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {estudios && estudios.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {estudios.map((es) => (
            <FilaEstudio
              key={es.id}
              estudio={es}
              internacionId={internacionId}
              activa={activa}
              puedoCargar={puedoCargar}
            />
          ))}
        </ul>
      )}

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-500">Archivos</p>
        <ul className="mt-1 space-y-1 text-sm">
          {adjuntos?.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="text-marca-700 hover:underline"
                onClick={async () => {
                  const url = await urlEstudio(supabase, a.storage_path);
                  if (url) globalThis.open(url, '_blank', 'noopener');
                }}
              >
                {a.nombre_archivo}
              </button>
            </li>
          ))}
          {(adjuntos?.length ?? 0) === 0 && <li className="text-slate-400">Sin archivos</li>}
        </ul>
        {puedoCargar && activa && (
          <label className="mt-2 inline-flex cursor-pointer items-center text-sm text-marca-700 hover:underline">
            {subir.isPending ? 'Subiendo…' : 'Adjuntar archivo'}
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subir.mutate({ archivo, tipo: 'laboratorio' });
                e.target.value = '';
              }}
            />
          </label>
        )}
        {subir.isError && <MensajeError detalle={(subir.error as Error).message} />}
      </div>
    </Bloque>
  );
}

function FilaEstudio({
  estudio,
  internacionId,
  activa,
  puedoCargar,
}: {
  estudio: EstudioInternacion;
  internacionId: string;
  activa: boolean;
  puedoCargar: boolean;
}) {
  const { supabase } = useAuth();
  const actualizar = useActualizarResultadoEstudio(supabase, internacionId);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(estudio.resultado ?? '');
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{estudio.tipo}</p>
        <span className="text-xs text-slate-400">{formatearFecha(estudio.fecha)}</span>
      </div>

      {!editando && (
        <p className="mt-0.5 whitespace-pre-wrap text-slate-700">
          {estudio.resultado ?? <span className="text-slate-400">Sin resultado cargado</span>}
        </p>
      )}

      {editando && (
        <div className="mt-1 space-y-2">
          <textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <MensajeError detalle={error} />}
          <div className="flex gap-2">
            <Boton
              className="text-sm"
              cargando={actualizar.isPending}
              onClick={() => {
                setError(null);
                actualizar.mutate(
                  { estudioId: estudio.id, resultado: texto },
                  { onSuccess: () => setEditando(false), onError: (e) => setError(e.message) },
                );
              }}
            >
              Guardar
            </Boton>
            <Boton variante="secundario" className="text-sm" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {puedoCargar && activa && !editando && (
        <Boton
          variante="texto"
          className="mt-1 text-xs"
          onClick={() => {
            setTexto(estudio.resultado ?? '');
            setEditando(true);
          }}
        >
          {estudio.resultado ? 'Editar resultado' : 'Cargar resultado'}
        </Boton>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Medicación
// ---------------------------------------------------------------------------

function BloqueMedicacion({
  internacionId,
  ordenId,
  activa,
  puedoCargar,
}: {
  internacionId: string;
  ordenId: string;
  activa: boolean;
  puedoCargar: boolean;
}) {
  const { supabase } = useAuth();
  const { data: medicacion } = useMedicacion(supabase, internacionId);
  const { data: stock } = useStock(supabase);
  const registrar = useRegistrarMedicacion(supabase, internacionId, ordenId);
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [dosis, setDosis] = useState('');
  const [via, setVia] = useState('');
  const [productoId, setProductoId] = useState('');
  const [unidades, setUnidades] = useState('');
  const [cargoMonto, setCargoMonto] = useState('');
  // Mientras no lo toquen a mano, el cargo lo propone el precio del inventario.
  const [cargoTocado, setCargoTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productoSel = stock?.find((p) => p.producto_id === productoId);
  const sugerirCargo = (prod: typeof productoSel, unids: string) => {
    const precio = Number(prod?.precio ?? 0);
    if (!prod || precio <= 0) return '';
    return String(precio * Math.max(1, Number(unids) || 1));
  };

  const elegirProducto = (nuevoId: string) => {
    setProductoId(nuevoId);
    const prod = stock?.find((p) => p.producto_id === nuevoId);
    if (prod) {
      if (!descripcion.trim()) setDescripcion(prod.nombre);
      const unids = unidades.trim() || '1';
      setUnidades(unids);
      if (!cargoTocado) setCargoMonto(sugerirCargo(prod, unids));
    }
  };

  const cambiarUnidades = (v: string) => {
    setUnidades(v);
    if (productoSel && !cargoTocado) setCargoMonto(sugerirCargo(productoSel, v));
  };

  const reset = () => {
    setAbierto(false);
    setDescripcion('');
    setDosis('');
    setVia('');
    setProductoId('');
    setUnidades('');
    setCargoMonto('');
    setCargoTocado(false);
  };

  return (
    <Bloque
      titulo="Medicación suministrada"
      accion={
        puedoCargar && activa && !abierto ? (
          <Boton variante="texto" className="text-sm" onClick={() => setAbierto(true)}>
            Registrar
          </Boton>
        ) : null
      }
      vacio={(medicacion?.length ?? 0) === 0 && !abierto}
    >
      {abierto && (
        <form
          className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!descripcion.trim()) {
              setError('Poné el nombre del medicamento');
              return;
            }
            setError(null);
            registrar.mutate(
              {
                descripcion,
                ...(dosis.trim() && { dosis }),
                ...(via.trim() && { via }),
                ...(productoId && { producto_id: productoId }),
                ...(unidades.trim() && { unidades }),
                ...(cargoMonto.trim() && { cargo_monto: cargoMonto }),
              },
              { onSuccess: reset, onError: (e2) => setError(e2.message) },
            );
          }}
        >
          <Campo id="me-desc" etiqueta="Medicamento">
            <Entrada
              id="me-desc"
              autoFocus
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Dipirona, ranitidina…"
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="me-dosis" etiqueta="Dosis" ayuda="Opcional">
              <Entrada
                id="me-dosis"
                value={dosis}
                onChange={(e) => setDosis(e.target.value)}
                placeholder="0,5 ml cada 8 h"
              />
            </Campo>
            <Campo id="me-via" etiqueta="Vía" ayuda="Opcional">
              <Entrada
                id="me-via"
                list="vias-adm"
                value={via}
                onChange={(e) => setVia(e.target.value)}
              />
              <datalist id="vias-adm">
                {VIAS_ADMINISTRACION.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="me-prod"
              etiqueta="Producto del stock"
              ayuda="Opcional. Descuenta inventario."
            >
              <Seleccion
                id="me-prod"
                value={productoId}
                onChange={(e) => elegirProducto(e.target.value)}
              >
                <option value="">— No sale del stock —</option>
                {stock?.map((p) => (
                  <option key={p.producto_id} value={p.producto_id}>
                    {p.nombre} ({p.cantidad}) · {pesos(Number(p.precio))}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo id="me-unid" etiqueta="Unidades" ayuda="A descontar del stock">
              <Entrada
                id="me-unid"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={unidades}
                onChange={(e) => cambiarUnidades(e.target.value)}
                disabled={!productoId}
              />
            </Campo>
          </div>
          <Campo
            id="me-cargo"
            etiqueta="Cargo ($)"
            ayuda={
              productoSel
                ? 'Tomado del precio de inventario. Editable.'
                : 'Opcional. Suma al total de la internación.'
            }
          >
            <Entrada
              id="me-cargo"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={cargoMonto}
              onChange={(e) => {
                setCargoMonto(e.target.value);
                setCargoTocado(true);
              }}
            />
          </Campo>
          {error && <MensajeError detalle={error} />}
          <div className="flex gap-2">
            <Boton type="submit" cargando={registrar.isPending}>
              Guardar
            </Boton>
            <Boton variante="secundario" onClick={reset}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {medicacion && medicacion.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {medicacion.map((m) => (
            <li key={m.id} className="py-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{m.descripcion}</p>
                <span className="text-xs text-slate-400">{formatearFechaHora(m.fecha)}</span>
              </div>
              <p className="text-slate-500">
                {[m.dosis, m.via, m.cantidad != null && `${m.cantidad} u. de stock`]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// Cargos y cobros
// ---------------------------------------------------------------------------

function BloqueCobros({
  internacion,
  activa,
  puedoCobrar,
  puedoCerrar,
}: {
  internacion: ResumenInternacion;
  activa: boolean;
  puedoCobrar: boolean;
  puedoCerrar: boolean;
}) {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const { data: cargos } = useCargos(supabase, internacion.orden_id);
  const { data: pagos } = usePagosInternacion(supabase, internacion.orden_id);
  const agregar = useAgregarCargo(supabase, internacion.id, internacion.orden_id);
  const cobrar = useRegistrarPago(supabase, internacion.id, internacion.orden_id);
  const cerrar = useCerrarInternacion(supabase, internacion.id);

  const [modo, setModo] = useState<'nada' | 'cargo' | 'pago' | 'cerrar'>('nada');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [pagoMonto, setPagoMonto] = useState('');
  const [medio, setMedio] = useState('efectivo');
  const [motivoEgreso, setMotivoEgreso] = useState('Alta médica');
  const [error, setError] = useState<string | null>(null);

  const total = Number(internacion.total_cargos);
  const pagado = Number(internacion.total_pagado);
  const saldo = Number(internacion.saldo);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Cargos y cobros</h2>

      <dl className="mt-3 space-y-1 text-sm">
        <Renglon termino="Total" valor={pesos(total)} />
        <Renglon termino="Cobrado" valor={pesos(pagado)} />
        <Renglon
          termino="Saldo"
          valor={pesos(saldo)}
          fuerte
          clase={saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}
        />
      </dl>

      {cargos && cargos.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {cargos.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 text-slate-700">
                {c.descripcion}
                {c.cantidad > 1 && <span className="text-slate-400"> ×{c.cantidad}</span>}
              </span>
              <span className="tabular-nums text-slate-600">{pesos(Number(c.subtotal))}</span>
            </li>
          ))}
        </ul>
      )}

      {pagos && pagos.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {pagos.map((p) => (
            <li key={p.id} className="flex justify-between gap-3">
              <span>
                {formatearFecha(p.creado_en)} · {p.medio}
              </span>
              <span className="tabular-nums">{pesos(Number(p.monto))}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {modo === 'nada' && (
        <div className="mt-4 flex flex-col gap-2">
          {puedoCobrar && activa && (
            <Boton variante="secundario" className="text-sm" onClick={() => setModo('cargo')}>
              Agregar cargo
            </Boton>
          )}
          {puedoCobrar && saldo > 0 && (
            <Boton className="text-sm" onClick={() => setModo('pago')}>
              Registrar pago
            </Boton>
          )}
          {puedoCerrar && activa && (
            <Boton variante="peligro" className="text-sm" onClick={() => setModo('cerrar')}>
              Cerrar internación
            </Boton>
          )}
        </div>
      )}

      {modo === 'cargo' && (
        <form
          className="mt-4 space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!concepto.trim() || !(Number(monto) > 0)) {
              setError('Poné concepto y un monto mayor a cero');
              return;
            }
            setError(null);
            agregar.mutate(
              { concepto, monto, cantidad },
              {
                onSuccess: () => {
                  setModo('nada');
                  setConcepto('');
                  setMonto('');
                  setCantidad('1');
                },
                onError: (e2) => setError(e2.message),
              },
            );
          }}
        >
          <Campo id="cg-concepto" etiqueta="Concepto">
            <Entrada
              id="cg-concepto"
              autoFocus
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Día de internación, curación, oxígeno…"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="cg-monto" etiqueta="Monto unitario ($)">
              <Entrada
                id="cg-monto"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </Campo>
            <Campo id="cg-cant" etiqueta="Cantidad">
              <Entrada
                id="cg-cant"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </Campo>
          </div>
          <div className="flex gap-2">
            <Boton type="submit" cargando={agregar.isPending}>
              Agregar
            </Boton>
            <Boton variante="secundario" onClick={() => setModo('nada')}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {modo === 'pago' && (
        <form
          className="mt-4 space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!(Number(pagoMonto) > 0)) {
              setError('Poné un monto mayor a cero');
              return;
            }
            setError(null);
            cobrar.mutate(
              { monto: pagoMonto, medio: medio as Parameters<typeof cobrar.mutate>[0]['medio'] },
              {
                onSuccess: () => {
                  setModo('nada');
                  setPagoMonto('');
                },
                onError: (e2) => setError(e2.message),
              },
            );
          }}
        >
          <Campo id="pg-monto" etiqueta="Monto ($)" ayuda={`Saldo pendiente: ${pesos(saldo)}`}>
            <Entrada
              id="pg-monto"
              autoFocus
              type="number"
              step="0.01"
              inputMode="decimal"
              value={pagoMonto}
              onChange={(e) => setPagoMonto(e.target.value)}
            />
          </Campo>
          <Campo id="pg-medio" etiqueta="Medio">
            <Seleccion id="pg-medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
              {MEDIOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </Seleccion>
          </Campo>
          <p className="text-xs text-slate-500">
            Salvo cuenta corriente, el cobro entra en la caja abierta.
          </p>
          <div className="flex gap-2">
            <Boton type="submit" cargando={cobrar.isPending}>
              Registrar pago
            </Boton>
            <Boton variante="secundario" onClick={() => setModo('nada')}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {modo === 'cerrar' && (
        <form
          className="mt-4 space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            cerrar.mutate(
              { motivoEgreso },
              {
                onSuccess: ({ saldo: s }) => {
                  setModo('nada');
                  if (s > 0) navigate('/internaciones');
                },
                onError: (e2) => setError(e2.message),
              },
            );
          }}
        >
          <p className="text-sm text-slate-600">
            Se numera el comprobante interno. Si queda saldo, la internación pasa a «Pendientes de
            cobro» y se puede seguir cobrando.
          </p>
          <Campo id="ce-motivo" etiqueta="Motivo de egreso">
            <Seleccion
              id="ce-motivo"
              value={motivoEgreso}
              onChange={(e) => setMotivoEgreso(e.target.value)}
            >
              {MOTIVOS_EGRESO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Seleccion>
          </Campo>
          <div className="flex gap-2">
            <Boton variante="peligro" type="submit" cargando={cerrar.isPending}>
              Confirmar alta
            </Boton>
            <Boton variante="secundario" onClick={() => setModo('nada')}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}

function Renglon({
  termino,
  valor,
  fuerte,
  clase,
}: {
  termino: string;
  valor: string;
  fuerte?: boolean;
  clase?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{termino}</dt>
      <dd className={cn('tabular-nums', fuerte ? 'font-semibold' : 'text-slate-700', clase)}>
        {valor}
      </dd>
    </div>
  );
}
