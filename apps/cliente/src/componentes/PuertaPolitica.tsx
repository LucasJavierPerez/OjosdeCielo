import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextoPolitica } from './TextoPolitica.js';

interface PoliticaPendiente {
  version: string;
  contenido: string;
  publicada_en: string;
}

/**
 * Bloquea la app hasta que la persona acepte la política vigente.
 *
 * Hace falta por dos caminos distintos:
 *
 * 1. Con confirmación por email activada, `signUp` no devuelve sesión, así que
 *    el consentimiento no se pudo registrar en el formulario de registro. Sin
 *    esto, esas cuentas quedarían sin consentimiento y la obligación del
 *    art. 6 de la Ley 25.326 no estaría cumplida.
 * 2. Cuando la clínica publica una versión nueva, hay que volver a pedirlo sin
 *    obligar a nadie a cerrar sesión.
 *
 * Mientras se consulta no se muestra nada: un parpadeo de la app antes del
 * cartel sería peor que esperar medio segundo.
 */
export function PuertaPolitica({ children }: { children: ReactNode }) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: pendiente, isLoading } = useQuery({
    queryKey: ['politica-pendiente'],
    // No cambia mientras la persona usa la app; se revisa una vez por sesión.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<PoliticaPendiente | null> => {
      const { data, error: err } = await supabase.rpc('politica_pendiente');
      if (err) throw err;
      return (data as unknown as PoliticaPendiente | null) ?? null;
    },
  });

  const aceptar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('aceptar_politica');
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['politica-pendiente'] }),
  });

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-12">
        <Cargando />
      </main>
    );
  }

  if (!pendiente) return <>{children}</>;

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-8">
      <h1 className="text-2xl font-semibold">Antes de seguir</h1>
      <p className="mt-2 text-slate-600">
        Necesitamos que leas y aceptes cómo tratamos tus datos. Sin esto no podemos darte una
        cuenta.
      </p>

      <div className="mt-6 max-h-[55dvh] flex-1 overflow-y-auto rounded-xl border border-slate-200 p-4 text-sm">
        <TextoPolitica contenido={pendiente.contenido} />
      </div>

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      <Boton
        className="mt-4 w-full"
        cargando={aceptar.isPending}
        onClick={() => {
          setError(null);
          aceptar.mutate(undefined, { onError: (e) => setError(e.message) });
        }}
      >
        Acepto
      </Boton>

      <p className="mt-3 text-center text-xs text-slate-500">Versión {pendiente.version}</p>
    </main>
  );
}
