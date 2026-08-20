import { formatearFechaHora, puedeVerMetricas } from '@ojosdecielo/core';
import { Boton, Campo, Cargando, cn, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type Campana,
  type Segmento,
  useBorrarCampana,
  useCampanas,
  useCancelarCampana,
  useCrearCampana,
  useLanzarCampana,
  useReintentarEnvio,
  useVistaPrevia,
} from '../features/comunicacion/api.js';

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  enviando: { texto: 'Enviando', clase: 'bg-amber-100 text-amber-800' },
  enviada: { texto: 'Enviada', clase: 'bg-emerald-100 text-emerald-800' },
  cancelada: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-500' },
};

export function Campanas() {
  const { supabase, perfil } = useAuth();
  const { data: campanas, isLoading, isError, refetch } = useCampanas(supabase);
  const [creando, setCreando] = useState(false);

  const esAdmin = perfil ? puedeVerMetricas(perfil.roles) : false;

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Campañas</h1>
        {esAdmin && !creando && <Boton onClick={() => setCreando(true)}>Nueva campaña</Boton>}
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Un aviso push a un grupo de tutores. Llega sólo a quien instaló la app y no silenció las
        campañas.
      </p>

      {!esAdmin && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Podés ver las campañas, pero crearlas y enviarlas es del administrador: un push sale a
          cientos de personas y no se puede deshacer.
        </p>
      )}

      {creando && <FormularioCampana onCerrar={() => setCreando(false)} />}

      {isLoading && <Cargando etiqueta="Cargando campañas" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar las campañas"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {campanas && campanas.length === 0 && !creando && (
        <div className="mt-6">
          <Vacio
            titulo="Todavía no hay campañas"
            descripcion="Por ejemplo: avisarle a los tutores de perros que tienen la antirrábica vencida."
          />
        </div>
      )}

      {campanas && campanas.length > 0 && (
        <ul className="mt-4 space-y-3">
          {campanas.map((c) => (
            <FilaCampana key={c.id} campana={c} esAdmin={esAdmin} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function FilaCampana({ campana, esAdmin }: { campana: Campana; esAdmin: boolean }) {
  const { supabase } = useAuth();
  const reintentar = useReintentarEnvio(supabase);
  const cancelar = useCancelarCampana(supabase);
  const borrar = useBorrarCampana(supabase);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const estado = ETIQUETA_ESTADO[campana.estado] ?? {
    texto: campana.estado,
    clase: 'bg-slate-100 text-slate-600',
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', estado.clase)}>
            {estado.texto}
          </span>
          <span className="ml-2 font-medium">{campana.titulo}</span>
        </div>
        <span className="text-sm text-slate-500">
          {campana.enviada_en
            ? formatearFechaHora(campana.enviada_en)
            : formatearFechaHora(campana.creada_en)}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-700">{campana.cuerpo}</p>

      <p className="mt-2 text-xs text-slate-500">
        {campana.destinatarios !== null ? `${campana.destinatarios} destinatarios` : 'Sin enviar'}
        {campana.url && ` · lleva a ${campana.url}`}
      </p>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {esAdmin && campana.estado === 'enviando' && (
        <Boton
          variante="secundario"
          className="mt-3 text-sm"
          cargando={reintentar.isPending}
          onClick={() => {
            setError(null);
            reintentar.mutate(campana.id, { onError: (e) => setError(e.message) });
          }}
        >
          Retomar el envío
        </Boton>
      )}

      {esAdmin && campana.estado === 'borrador' && (
        <Boton
          variante="texto"
          className="mt-3 text-sm text-slate-500"
          cargando={cancelar.isPending}
          onClick={() => {
            setError(null);
            cancelar.mutate(campana.id, { onError: (e) => setError(e.message) });
          }}
        >
          Descartar
        </Boton>
      )}

      {esAdmin && !confirmandoBorrado && (
        <Boton
          variante="texto"
          className="mt-3 ml-3 text-sm text-red-700"
          onClick={() => setConfirmandoBorrado(true)}
        >
          Borrar
        </Boton>
      )}

      {esAdmin && confirmandoBorrado && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-slate-600">¿Borrar esta campaña de la lista?</span>
          <Boton
            variante="texto"
            className="text-red-700"
            cargando={borrar.isPending}
            onClick={() => {
              setError(null);
              borrar.mutate(campana.id, { onError: (e) => setError(e.message) });
            }}
          >
            Sí, borrar
          </Boton>
          <Boton
            variante="texto"
            className="text-slate-500"
            onClick={() => setConfirmandoBorrado(false)}
          >
            Cancelar
          </Boton>
        </div>
      )}
    </li>
  );
}

const ESPECIES = [
  { valor: '', texto: 'Todas' },
  { valor: 'perro', texto: 'Perros' },
  { valor: 'gato', texto: 'Gatos' },
] as const;

function FormularioCampana({ onCerrar }: { onCerrar: () => void }) {
  const { supabase } = useAuth();
  const crear = useCrearCampana(supabase);
  const lanzar = useLanzarCampana(supabase);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [url, setUrl] = useState('/turnos/nuevo');
  const [especie, setEspecie] = useState('');
  const [vacunaVencida, setVacunaVencida] = useState('');
  const [sinVenir, setSinVenir] = useState('');

  const segmento: Segmento = {
    ...(especie && { especie: especie as 'perro' | 'gato' }),
    ...(vacunaVencida && { vacuna_vencida_dias: Number(vacunaVencida) }),
    ...(sinVenir && { sin_venir_meses: Number(sinVenir) }),
  };

  const { data: previa, isFetching } = useVistaPrevia(supabase, segmento);

  const enviar = () => {
    if (!titulo.trim() || !cuerpo.trim()) {
      setError('El título y el mensaje son obligatorios');
      return;
    }
    setError(null);
    crear.mutate(
      { titulo: titulo.trim(), cuerpo: cuerpo.trim(), segmento, url },
      {
        onSuccess: (c) =>
          lanzar.mutate(c.id, {
            onSuccess: (r) => {
              setResultado(`Enviada a ${r.enviados} dispositivos.`);
              setTimeout(onCerrar, 1500);
            },
            onError: (e) => setError(e.message),
          }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Nueva campaña</h2>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <Campo id="c-titulo" etiqueta="Título" ayuda="Lo que se lee en la notificación">
            <Entrada
              id="c-titulo"
              maxLength={80}
              value={titulo}
              placeholder="Antirrábica al día"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </Campo>

          <Campo id="c-cuerpo" etiqueta="Mensaje">
            <textarea
              id="c-cuerpo"
              rows={3}
              maxLength={300}
              value={cuerpo}
              placeholder="Tu perro tiene la antirrábica vencida. Sacá turno cuando quieras."
              onChange={(e) => setCuerpo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>

          <Campo id="c-url" etiqueta="A dónde lleva" ayuda="Ruta de la app">
            <Entrada id="c-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Campo>
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-500">A quién le llega</h3>

          <div className="mt-2 space-y-3">
            <div>
              <span className="text-sm">Especie</span>
              <div className="mt-1 flex gap-1 rounded-lg border border-slate-200 p-1">
                {ESPECIES.map((e) => (
                  <button
                    key={e.valor}
                    type="button"
                    onClick={() => setEspecie(e.valor)}
                    className={
                      especie === e.valor
                        ? 'rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white'
                        : 'rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100'
                    }
                  >
                    {e.texto}
                  </button>
                ))}
              </div>
            </div>

            <Campo
              id="c-vacuna"
              etiqueta="Con la vacuna vencida hace más de (días)"
              ayuda="Vacío: no filtra por vacunas"
            >
              <Entrada
                id="c-vacuna"
                type="number"
                min="0"
                value={vacunaVencida}
                placeholder="30"
                onChange={(e) => setVacunaVencida(e.target.value)}
              />
            </Campo>

            <Campo
              id="c-sinvenir"
              etiqueta="Sin consulta hace más de (meses)"
              ayuda="Vacío: no filtra por antigüedad"
            >
              <Entrada
                id="c-sinvenir"
                type="number"
                min="0"
                value={sinVenir}
                placeholder="12"
                onChange={(e) => setSinVenir(e.target.value)}
              />
            </Campo>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            {isFetching ? (
              <p className="text-sm text-slate-500">Calculando alcance…</p>
            ) : (
              <>
                <p className="font-medium">
                  {previa?.total ?? 0} {previa?.total === 1 ? 'tutor' : 'tutores'}
                </p>
                {previa && previa.total > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                    {previa.muestra.map((m, i) => (
                      // Dos tutores pueden llamarse igual: la clave lleva el
                      // índice porque el nombre no identifica la fila.
                      // biome-ignore lint/suspicious/noArrayIndexKey: nombres repetidos
                      <li key={`${m.nombre}-${i}`}>
                        {m.nombre}
                        {m.mascotas && <span className="text-slate-400"> · {m.mascotas}</span>}
                      </li>
                    ))}
                    {previa.total > previa.muestra.length && (
                      <li className="text-slate-400">
                        y {previa.total - previa.muestra.length} más
                      </li>
                    )}
                  </ul>
                )}
                {previa?.total === 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    Con estos criterios no le llega a nadie. Revisalos antes de enviar.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      {resultado && (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{resultado}</p>
      )}

      <p className="mt-4 text-sm text-slate-500">
        Una vez enviada no se puede deshacer. Mirá la lista de arriba antes de tocar el botón.
      </p>

      <div className="mt-3 flex gap-2">
        <Boton
          cargando={crear.isPending || lanzar.isPending}
          disabled={!previa || previa.total === 0}
          onClick={enviar}
        >
          Enviar a {previa?.total ?? 0}
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </section>
  );
}
