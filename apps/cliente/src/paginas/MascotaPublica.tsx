import type { Especie } from '@ojosdecielo/core';
import { ETIQUETA_ESPECIE, textoRelativo } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

interface MascotaPublica {
  nombre: string;
  especie: Especie;
  raza: string | null;
  foto_url: string | null;
  perdida: boolean;
  perdida_desde: string | null;
  nota_extravio: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  clinica_nombre: string;
  clinica_telefono: string | null;
}

/**
 * Página pública del QR. La abre alguien que encontró a la mascota.
 *
 * Es el único punto del sistema pensado para una persona sin cuenta, y por eso
 * el que más cuidado necesita: muestra lo justo para poder devolver al animal y
 * nada más. El teléfono del tutor sólo aparece si está marcada como perdida.
 */
export function MascotaPublica() {
  const { token = '' } = useParams<{ token: string }>();
  const { supabase } = useAuth();

  // No debe indexarse: es una página con datos de una persona concreta.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['qr', token],
    retry: false,
    queryFn: async (): Promise<MascotaPublica | null> => {
      const { data: filas, error } = await supabase.rpc('mascota_por_qr', { p_token: token });
      if (error) throw error;
      return (filas as MascotaPublica[])[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-12">
        <Cargando />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold">Este código no es válido</h1>
        <p className="mt-2 text-slate-600">
          Puede que la chapita sea vieja o que el código se haya regenerado.
        </p>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-10">
      {data.perdida ? (
        <div className="rounded-xl bg-red-50 p-4 text-center">
          <p className="text-lg font-semibold text-red-900">¡{data.nombre} está perdida!</p>
          {data.perdida_desde && (
            <p className="mt-1 text-sm text-red-800">
              Se perdió {textoRelativo(data.perdida_desde)}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-marca-50 p-4 text-center text-sm text-marca-800">
          Esta mascota no figura como perdida. Si la encontraste sola, podés avisarle a su familia
          desde acá.
        </div>
      )}

      <div className="mt-6 text-center">
        <div className="mx-auto flex size-32 items-center justify-center overflow-hidden rounded-full bg-marca-100 text-5xl font-semibold text-marca-700">
          {data.nombre.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 text-2xl font-semibold">{data.nombre}</h1>
        <p className="text-slate-600">
          {ETIQUETA_ESPECIE[data.especie]}
          {data.raza && ` · ${data.raza}`}
        </p>
      </div>

      {data.nota_extravio && (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          {data.nota_extravio}
        </p>
      )}

      {data.perdida && data.contacto_telefono && (
        <a
          href={`tel:${data.contacto_telefono.replace(/\s/g, '')}`}
          className="mt-6 flex min-h-14 items-center justify-center rounded-xl bg-marca-600 text-lg font-medium text-white"
        >
          Llamar a {data.contacto_nombre}
        </a>
      )}

      {data.clinica_telefono && (
        <a
          href={`tel:${data.clinica_telefono.replace(/\s/g, '')}`}
          className="mt-3 flex min-h-12 items-center justify-center rounded-xl border border-slate-300 font-medium text-slate-700"
        >
          Llamar a {data.clinica_nombre}
        </a>
      )}

      <Aviso token={token} nombre={data.nombre} />

      <p className="mt-8 text-center text-xs text-slate-400">{data.clinica_nombre}</p>
    </main>
  );
}

function Aviso({ token, nombre }: { token: string; nombre: string }) {
  const { supabase } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [contacto, setContacto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const avisar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('avisar_hallazgo', {
        p_token: token,
        p_mensaje: mensaje,
        p_contacto: contacto || undefined,
      });
      if (err) throw new Error(err.message);
    },
  });

  if (avisar.isSuccess) {
    return (
      <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-center">
        <p className="font-medium text-emerald-900">Gracias, ya le avisamos a su familia</p>
        <p className="mt-1 text-sm text-emerald-800">Les llega una notificación con tu mensaje.</p>
      </div>
    );
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" className="mt-3 w-full" onClick={() => setAbierto(true)}>
        La vi / la tengo conmigo
      </Boton>
    );
  }

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!mensaje.trim()) {
          setError('Escribí un mensaje');
          return;
        }
        setError(null);
        avisar.mutate(undefined, { onError: (err) => setError(err.message) });
      }}
    >
      <p className="text-sm text-slate-700">
        Contales dónde viste a {nombre}. Le va a llegar a toda su familia.
      </p>

      <label htmlFor="mensaje" className="mt-3 block text-sm font-medium text-slate-700">
        Mensaje
      </label>
      <textarea
        id="mensaje"
        rows={3}
        maxLength={500}
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder="La vi en la plaza de Rivadavia y Acoyte, está bien"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
      />

      <label htmlFor="contacto" className="mt-3 block text-sm font-medium text-slate-700">
        Tu teléfono
      </label>
      <input
        id="contacto"
        type="tel"
        maxLength={120}
        value={contacto}
        onChange={(e) => setContacto(e.target.value)}
        placeholder="Opcional, para que puedan responderte"
        className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2"
      />

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={avisar.isPending} className="flex-1">
          Enviar aviso
        </Boton>
        <Boton variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
