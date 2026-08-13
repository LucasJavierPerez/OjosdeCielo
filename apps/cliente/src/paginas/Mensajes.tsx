import { formatearFechaHora, textoRelativo } from '@ojosdecielo/core';
import { Boton, Campo, Cargando, cn, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useMascotas } from '../features/mascotas/api.js';

interface ConversacionCliente {
  id: string;
  asunto: string;
  mascota_id: string | null;
  ultimo_mensaje_en: string;
  cerrada_en: string | null;
}

interface MensajeCliente {
  id: string;
  cuerpo: string;
  de_la_clinica: boolean;
  creado_en: string;
}

export function Mensajes() {
  const { supabase } = useAuth();
  const [params, setParams] = useSearchParams();
  const abierta = params.get('c');
  const [nueva, setNueva] = useState(false);

  const {
    data: conversaciones,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['mis-conversaciones'],
    queryFn: async (): Promise<ConversacionCliente[]> => {
      const { data, error } = await supabase
        .from('conversacion')
        .select('id, asunto, mascota_id, ultimo_mensaje_en, cerrada_en')
        .order('ultimo_mensaje_en', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (abierta) {
    return <Conversacion id={abierta} onVolver={() => setParams({})} />;
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Mensajes" volverA="/" />

      <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
        Para consultas de horarios, cómo dar una medicación o cuándo retirar un estudio. Si tu
        mascota está descompuesta, pedí un turno: por mensaje no se puede revisar.
      </p>

      {!nueva && (
        <Boton className="mt-4 w-full" onClick={() => setNueva(true)}>
          Escribir a la clínica
        </Boton>
      )}

      {nueva && <FormularioNueva onListo={() => setNueva(false)} />}

      {isLoading && <Cargando etiqueta="Cargando mensajes" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar tus mensajes"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {conversaciones && conversaciones.length === 0 && !nueva && (
        <div className="mt-6">
          <Vacio titulo="Sin conversaciones" descripcion="Escribinos cuando tengas una duda." />
        </div>
      )}

      {conversaciones && conversaciones.length > 0 && (
        <ul className="mt-4 space-y-2">
          {conversaciones.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setParams({ c: c.id })}
                className="w-full rounded-xl border border-slate-200 p-3 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{c.asunto}</span>
                  {c.cerrada_en && <span className="shrink-0 text-xs text-slate-400">cerrada</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{textoRelativo(c.ultimo_mensaje_en)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FormularioNueva({ onListo }: { onListo: () => void }) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const { data: mascotas } = useMascotas(supabase);
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mascotaId, setMascotaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('abrir_conversacion', {
        p_asunto: asunto.trim(),
        p_mensaje: mensaje.trim(),
        ...(mascotaId && { p_mascota_id: mascotaId }),
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mis-conversaciones'] });
      onListo();
    },
  });

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!asunto.trim() || !mensaje.trim()) {
          setError('Completá el asunto y el mensaje');
          return;
        }
        setError(null);
        abrir.mutate(undefined, { onError: (e2) => setError(e2.message) });
      }}
    >
      <Campo id="m-asunto" etiqueta="Asunto">
        <Entrada
          id="m-asunto"
          autoFocus
          maxLength={120}
          value={asunto}
          placeholder="¿Le doy la pastilla con comida?"
          onChange={(e) => setAsunto(e.target.value)}
        />
      </Campo>

      {mascotas && mascotas.length > 0 && (
        <Campo id="m-mascota" etiqueta="¿Es por alguna mascota?" ayuda="Opcional">
          <select
            id="m-mascota"
            value={mascotaId}
            onChange={(e) => setMascotaId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">Ninguna en particular</option>
            {mascotas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo id="m-cuerpo" etiqueta="Mensaje">
        <textarea
          id="m-cuerpo"
          rows={4}
          maxLength={2000}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Campo>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={abrir.isPending}>
          Enviar
        </Boton>
        <Boton variante="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function Conversacion({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: conv } = useQuery({
    queryKey: ['conversacion', id],
    queryFn: async (): Promise<ConversacionCliente> => {
      const { data, error: err } = await supabase
        .from('conversacion')
        .select('id, asunto, mascota_id, ultimo_mensaje_en, cerrada_en')
        .eq('id', id)
        .single();
      if (err) throw err;
      return data;
    },
  });

  const { data: mensajes, isLoading } = useQuery({
    queryKey: ['mis-mensajes', id],
    // La clínica responde cuando puede: sin recarga manual la pantalla queda
    // muerta mientras el tutor la mira esperando.
    refetchInterval: 15000,
    queryFn: async (): Promise<MensajeCliente[]> => {
      const { data, error: err } = await supabase
        .from('mensaje')
        .select('id, cuerpo, de_la_clinica, creado_en')
        .eq('conversacion_id', id)
        .order('creado_en');
      if (err) throw err;
      await supabase.rpc('marcar_conversacion_leida', { p_conversacion_id: id });
      return data;
    },
  });

  const responder = useMutation({
    mutationFn: async (cuerpo: string): Promise<void> => {
      const { error: err } = await supabase.from('mensaje').insert({
        conversacion_id: id,
        de_la_clinica: false,
        cuerpo,
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-mensajes', id] }),
  });

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6 py-6">
      <button type="button" onClick={onVolver} className="self-start text-sm text-slate-500">
        ‹ Mensajes
      </button>
      <h1 className="mt-2 text-xl font-semibold">{conv?.asunto ?? 'Conversación'}</h1>

      <div className="mt-4 flex-1 space-y-3">
        {isLoading && <Cargando />}
        {mensajes?.map((m) => (
          <div key={m.id} className={m.de_la_clinica ? 'flex justify-start' : 'flex justify-end'}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                m.de_la_clinica ? 'bg-slate-100 text-slate-900' : 'bg-marca-600 text-white',
              )}
            >
              {m.de_la_clinica && (
                <p className="text-[11px] font-medium text-slate-500">La clínica</p>
              )}
              <p className="whitespace-pre-wrap">{m.cuerpo}</p>
              <p
                className={cn(
                  'mt-1 text-[11px]',
                  m.de_la_clinica ? 'text-slate-500' : 'text-white/70',
                )}
              >
                {formatearFechaHora(m.creado_en)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {conv?.cerrada_en ? (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          La clínica dio por cerrada esta conversación. Si necesitás algo más, escribí una nueva.
        </p>
      ) : (
        <form
          className="mt-4 flex gap-2"
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
            Mensaje
          </label>
          <input
            id="respuesta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí tu mensaje"
            className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <Boton type="submit" cargando={responder.isPending}>
            Enviar
          </Boton>
        </form>
      )}
    </main>
  );
}
