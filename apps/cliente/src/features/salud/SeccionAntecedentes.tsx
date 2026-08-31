import { ETIQUETA_ANTECEDENTE, formatearFechaCivil, type TipoAntecedente } from '@ojosdecielo/core';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useAntecedentes } from './api.js';
import { EtiquetaOrigen } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionAntecedentes({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const { data: antecedentes, isLoading } = useAntecedentes(supabase, mascotaId);

  return (
    <Seccion
      titulo="Alergias y antecedentes"
      cargando={isLoading}
      vacio={!antecedentes?.length}
      textoVacio="Las alergias, cirugías y condiciones que cargue la clínica aparecen acá."
    >
      {antecedentes && antecedentes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {antecedentes.map((a) => (
            <li key={a.id} className="py-2.5">
              <p className="font-medium">{ETIQUETA_ANTECEDENTE[a.tipo as TipoAntecedente]}</p>
              <p className="text-sm text-slate-700">{a.descripcion}</p>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                {a.fecha && formatearFechaCivil(a.fecha)}
                <EtiquetaOrigen registro={a} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
