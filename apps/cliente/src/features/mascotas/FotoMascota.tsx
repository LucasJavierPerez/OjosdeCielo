import type { Especie } from '@ojosdecielo/core';
import { ETIQUETA_ESPECIE, validarFoto } from '@ojosdecielo/core';
import { cn } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useRef, useState } from 'react';
import { useSubirFoto, useUrlFoto } from './api.js';

const TAMANOS = {
  sm: 'size-14 text-xl',
  lg: 'size-28 text-4xl',
} as const;

/** Foto de la mascota, o su inicial cuando todavía no cargó ninguna. */
export function FotoMascota({
  fotoUrl,
  nombre,
  especie,
  tamano = 'sm',
}: {
  fotoUrl: string | null;
  nombre: string;
  especie: Especie;
  tamano?: keyof typeof TAMANOS;
}) {
  const { supabase } = useAuth();
  const { data: url } = useUrlFoto(supabase, fotoUrl);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-marca-100 font-semibold text-marca-700',
        TAMANOS[tamano],
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Foto de ${nombre}`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{nombre.charAt(0).toUpperCase()}</span>
      )}
      <span className="sr-only">
        {ETIQUETA_ESPECIE[especie]} llamado {nombre}
      </span>
    </div>
  );
}

/** Botón para elegir y subir una foto desde el celular. */
export function SubirFotoMascota({
  mascotaId,
  fotoUrl,
  nombre,
  especie,
}: {
  mascotaId: string;
  fotoUrl: string | null;
  nombre: string;
  especie: Especie;
}) {
  const { supabase } = useAuth();
  const subir = useSubirFoto(supabase, mascotaId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    // Se valida antes de subir: no tiene sentido gastar la subida de una foto
    // de 8 MB por celular para que el servidor la rechace.
    const problema = validarFoto(archivo);
    if (problema) {
      setError(problema);
      e.target.value = '';
      return;
    }

    setError(null);
    subir.mutate(archivo, {
      onError: () => setError('No pudimos subir la foto. Probá de nuevo.'),
      onSettled: () => {
        if (inputRef.current) inputRef.current.value = '';
      },
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <FotoMascota fotoUrl={fotoUrl} nombre={nombre} especie={especie} tamano="lg" />

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={alElegir}
        className="sr-only"
        id="foto-mascota"
      />
      <label
        htmlFor="foto-mascota"
        className="cursor-pointer text-sm font-medium text-marca-600 hover:underline"
      >
        {subir.isPending ? 'Subiendo…' : fotoUrl ? 'Cambiar foto' : 'Agregar foto'}
      </label>

      {error && (
        <p role="alert" className="text-center text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
