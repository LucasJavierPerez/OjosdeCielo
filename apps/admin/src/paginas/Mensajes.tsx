import { formatearFechaHora, textoRelativo } from '@ojosdecielo/core';
import { Boton, Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import {
  type ConversacionBandeja,
  useBandeja,
  useCerrarConversacion,
  useMarcarLeida,
  useMensajes,
  useResponder,
} from '../features/comunicacion/api.js';

export function Mensajes() {
  const { supabase } = useAuth();
  const [cerradas, setCerradas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const { data: bandeja, isLoading, isError, refetch } = useBandeja(supabase, cerradas);
  const seleccionada = bandeja?.find((c) => c.id === abierta);

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Mensajes</h1>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {[
            { v: false, t: 'Abiertas' },
            { v: true, t: 'Cerradas' },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => {
                setCerradas(o.v);
                setAbierta(null);
              }}
              className={
                cerradas === o.v
                  ? 'rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100'
              }
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Consultas administrativas: horarios, cómo dar una medicación, cuándo retirar un estudio. Un
        diagnóstico necesita ver al animal, no un mensaje.
      </p>

      {isLoading && <Cargando etiqueta="Cargando conversaciones" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar los mensajes"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {bandeja && bandeja.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo={cerradas ? 'No hay conversaciones cerradas' : 'No hay mensajes pendientes'}
            descripcion={
              cerradas ? undefined : 'Cuando un tutor escriba desde la app, aparece acá.'
            }
          />
        </div>
      )}

      {bandeja && bandeja.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <ul className="space-y-2">
            {bandeja.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAbierta(c.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left',
                    abierta === c.id
                      ? 'border-slate-900 bg-white'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{c.asunto}</span>
                    {c.sin_leer > 0 && (
                      <span className="shrink-0 rounded-full bg-acento-600 px-1.5 text-xs font-medium text-white">
                        {c.sin_leer}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {c.cliente}
                    {c.mascota && ` · ${c.mascota}`}
                  </p>
                  {c.ultimo_mensaje && (
                    <p className="mt-1 truncate text-sm text-slate-400">{c.ultimo_mensaje}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {textoRelativo(c.ultimo_mensaje_en)}
                    {c.espera_respuesta && !c.cerrada_en && (
                      <span className="ml-2 font-medium text-amber-700">espera respuesta</span>
                    )}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div>
            {seleccionada ? (
              <Conversacion conversacion={seleccionada} />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Elegí una conversación de la izquierda.
              </p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

function Conversacion({ conversacion }: { conversacion: ConversacionBandeja }) {
  const { supabase } = useAuth();
  const { data: mensajes, isLoading } = useMensajes(supabase, conversacion.id);
  const responder = useResponder(supabase, conversacion.id);
  const marcarLeida = useMarcarLeida(supabase);
  const cerrar = useCerrarConversacion(supabase);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Abrirla es haberla leído. Depende sólo del id y no del contador de sin
  // leer: la RPC no toca nada si ya estaba todo leído, y con el contador en
  // las dependencias el efecto se volvería a disparar con cada refetch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: al cambiar de conversación, nada más
  useEffect(() => {
    marcarLeida.mutate(conversacion.id);
  }, [conversacion.id]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-medium">{conversacion.asunto}</h2>
          <p className="text-sm text-slate-500">
            {conversacion.cliente}
            {conversacion.telefono && ` · ${conversacion.telefono}`}
            {conversacion.mascota_id && (
              <>
                {' · '}
                <Link
                  to={`/pacientes/${conversacion.mascota_id}`}
                  className="hover:text-marca-700 hover:underline"
                >
                  {conversacion.mascota}
                </Link>
              </>
            )}
          </p>
        </div>
        <Boton
          variante="texto"
          className="text-sm text-slate-500"
          cargando={cerrar.isPending}
          onClick={() => cerrar.mutate({ id: conversacion.id, cerrar: !conversacion.cerrada_en })}
        >
          {conversacion.cerrada_en ? 'Reabrir' : 'Cerrar'}
        </Boton>
      </header>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto p-4">
        {isLoading && <Cargando />}
        {mensajes?.map((m) => (
          <div key={m.id} className={m.de_la_clinica ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                m.de_la_clinica ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900',
              )}
            >
              <p className="whitespace-pre-wrap">{m.cuerpo}</p>
              <p
                className={cn(
                  'mt-1 text-[11px]',
                  m.de_la_clinica ? 'text-slate-400' : 'text-slate-500',
                )}
              >
                {formatearFechaHora(m.creado_en)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-4">
          <MensajeError detalle={error} />
        </div>
      )}

      {conversacion.cerrada_en ? (
        <p className="border-t border-slate-200 p-4 text-sm text-slate-500">
          Conversación cerrada. Reabrila para seguir escribiendo.
        </p>
      ) : (
        <form
          className="flex gap-2 border-t border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            setError(null);
            responder.mutate(texto.trim(), {
              onSuccess: () => setTexto(''),
              onError: (e2) => setError(e2.message),
            });
          }}
        >
          <label htmlFor="respuesta" className="sr-only">
            Respuesta
          </label>
          <textarea
            id="respuesta"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí la respuesta"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Boton type="submit" cargando={responder.isPending}>
            Responder
          </Boton>
        </form>
      )}
    </div>
  );
}
