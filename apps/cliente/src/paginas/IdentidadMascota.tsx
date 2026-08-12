import { formatearFechaHora, textoRelativo } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { clavesMascotas, useMascota } from '../features/mascotas/api.js';

export function IdentidadMascota() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const { data: mascota, isLoading } = useMascota(supabase, id);
  const [error, setError] = useState<string | null>(null);

  const { data: token } = useQuery({
    queryKey: ['qr', id],
    queryFn: async (): Promise<string | null> => {
      const { data, error: err } = await supabase
        .from('mascota_token_qr')
        .select('token')
        .eq('mascota_id', id)
        .eq('activo', true)
        .maybeSingle();
      if (err) throw err;
      return data?.token ?? null;
    },
  });

  const { data: avisos } = useQuery({
    queryKey: ['avisos', id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('aviso_hallazgo')
        .select('*')
        .eq('mascota_id', id)
        .order('creado_en', { ascending: false });
      if (err) throw err;
      return data;
    },
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['qr', id] });
    void qc.invalidateQueries({ queryKey: clavesMascotas.una(id) });
  };

  const generar = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.rpc('generar_qr', { p_mascota_id: id });
      if (err) throw new Error(err.message);
    },
    onSuccess: invalidar,
  });

  const perdida = useMutation({
    mutationFn: async (nota: string) => {
      const { error: err } = await supabase.rpc('marcar_perdida', {
        p_mascota_id: id,
        ...(nota.trim() && { p_nota: nota.trim() }),
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: invalidar,
  });

  const encontrada = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.rpc('marcar_encontrada', { p_mascota_id: id });
      if (err) throw new Error(err.message);
    },
    onSuccess: invalidar,
  });

  const [marcando, setMarcando] = useState(false);
  const [nota, setNota] = useState('');

  if (isLoading || !mascota) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Identidad" volverA={`/mascotas/${id}`} />
        <Cargando />
      </main>
    );
  }

  const urlPublica = token ? `${globalThis.location.origin}/m/${token}` : null;
  const estaPerdida = mascota.perdida_desde !== null;

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo={`Identidad de ${mascota.nombre}`} volverA={`/mascotas/${id}`} />

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      {estaPerdida ? (
        <section className="mt-4 rounded-xl bg-red-50 p-4">
          <p className="font-medium text-red-900">{mascota.nombre} figura como perdida</p>
          <p className="mt-1 text-sm text-red-800">
            Desde {formatearFechaHora(mascota.perdida_desde ?? '')}. Quien escanee el código va a
            ver tu nombre y teléfono para poder llamarte.
          </p>
          <Boton
            className="mt-3"
            cargando={encontrada.isPending}
            onClick={() => {
              setError(null);
              encontrada.mutate(undefined, { onError: (e) => setError(e.message) });
            }}
          >
            Ya apareció
          </Boton>
        </section>
      ) : (
        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium">Si se pierde</h2>
          <p className="mt-1 text-sm text-slate-600">
            Marcala como perdida y quien escanee el código va a poder llamarte. Mientras no lo
            hagas, tu teléfono no se muestra.
          </p>

          {marcando ? (
            <div className="mt-3">
              <label htmlFor="nota" className="block text-sm font-medium text-slate-700">
                ¿Dónde se perdió?
              </label>
              <textarea
                id="nota"
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Se escapó por Rivadavia al 4000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <div className="mt-2 flex gap-2">
                <Boton
                  variante="peligro"
                  className="flex-1"
                  cargando={perdida.isPending}
                  onClick={() => {
                    setError(null);
                    perdida.mutate(nota, {
                      onSuccess: () => setMarcando(false),
                      onError: (e) => setError(e.message),
                    });
                  }}
                >
                  Marcar como perdida
                </Boton>
                <Boton variante="secundario" onClick={() => setMarcando(false)}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : (
            <Boton variante="secundario" className="mt-3" onClick={() => setMarcando(true)}>
              Marcar como perdida
            </Boton>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-medium">Código QR</h2>
        <p className="mt-1 text-sm text-slate-600">
          Imprimilo y colgalo de su collar. Quien lo escanee llega a una página con sus datos.
        </p>

        {urlPublica ? (
          <>
            <CodigoQR url={urlPublica} nombre={mascota.nombre} />

            <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-center font-mono text-xs text-slate-500">
              {urlPublica}
            </p>

            <div className="mt-3 flex gap-2">
              <Boton
                variante="secundario"
                className="flex-1 text-sm"
                onClick={async () => {
                  try {
                    if (navigator.share) {
                      await navigator.share({ url: urlPublica, title: mascota.nombre });
                      return;
                    }
                    await navigator.clipboard.writeText(urlPublica);
                  } catch {
                    // El usuario canceló el diálogo: no es un error.
                  }
                }}
              >
                Compartir
              </Boton>
              <Boton
                variante="texto"
                className="text-sm text-slate-500"
                cargando={generar.isPending}
                onClick={() => {
                  setError(null);
                  generar.mutate(undefined, { onError: (e) => setError(e.message) });
                }}
              >
                Regenerar
              </Boton>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Regenerar invalida la chapita anterior. Sirve si la perdiste o se la sacaron.
            </p>
          </>
        ) : (
          <Boton
            className="mt-3 w-full"
            cargando={generar.isPending}
            onClick={() => {
              setError(null);
              generar.mutate(undefined, { onError: (e) => setError(e.message) });
            }}
          >
            Generar código
          </Boton>
        )}
      </section>

      {avisos && avisos.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium">Avisos de quien la vio</h2>
          <ul className="mt-2 space-y-2">
            {avisos.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm">{a.mensaje}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {textoRelativo(a.creado_en)}
                  {a.contacto && ` · ${a.contacto}`}
                </p>
                {a.contacto && (
                  <a
                    href={`tel:${a.contacto.replace(/\s/g, '')}`}
                    className="mt-2 inline-block text-sm font-medium text-marca-600"
                  >
                    Llamar
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function CodigoQR({ url, nombre }: { url: string; nombre: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    // Nivel de corrección alto: la chapita se raya y se ensucia, y un QR
    // dañado que no lee no sirve de nada.
    void QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setDataUrl);
  }, [url]);

  if (!dataUrl) {
    return <div className="mt-4 aspect-square w-full animate-pulse rounded-xl bg-slate-100" />;
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <img src={dataUrl} alt={`Código QR de ${nombre}`} className="mx-auto w-full max-w-64" />
      <a
        href={dataUrl}
        download={`qr-${nombre.toLowerCase().replace(/\s/g, '-')}.png`}
        className="mt-3 block text-center text-sm font-medium text-marca-600"
      >
        Descargar para imprimir
      </a>
    </div>
  );
}
