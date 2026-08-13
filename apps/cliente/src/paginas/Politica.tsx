import { Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { TextoPolitica } from '../componentes/TextoPolitica.js';

interface Politica {
  version: string;
  contenido: string;
  publicada_en: string;
}

/**
 * La política de privacidad, legible sin cuenta.
 *
 * Tiene que serlo: la persona la lee antes de registrarse, que es el momento
 * en que decide si acepta.
 *
 * El texto se guarda en la base y no en el código para que publicar una
 * versión nueva no requiera un deploy, y para que quede registro de qué decía
 * cada versión el día que alguien la aceptó.
 */
export function Politica() {
  const { supabase } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['politica'],
    queryFn: async (): Promise<Politica | null> => {
      const { data: filas, error } = await supabase
        .from('politica_privacidad')
        .select('version, contenido, publicada_en')
        .eq('vigente', true)
        .maybeSingle();
      if (error) throw error;
      return filas;
    },
  });

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-2xl px-6 py-8">
      <Link to="/ingresar" className="text-sm text-slate-500">
        ‹ Volver
      </Link>

      {isLoading && <Cargando />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar la política"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {data === null && !isLoading && (
        <p className="mt-6 text-slate-600">Todavía no hay una política publicada.</p>
      )}

      {data && (
        <>
          <TextoPolitica contenido={data.contenido} />
          <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
            Versión {data.version}
          </p>
        </>
      )}
    </main>
  );
}
