import { formatearFechaCivil, medicacionActiva } from '@ojosdecielo/core';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMedicacion } from './api.js';
import { EtiquetaOrigen } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionMedicacion({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const { data: medicaciones, isLoading } = useMedicacion(supabase, mascotaId);

  const activas = (medicaciones ?? []).filter(medicacionActiva);

  return (
    <Seccion
      titulo="Medicación"
      resumen={activas.length > 0 ? `${activas.length} en curso` : undefined}
      cargando={isLoading}
      vacio={!medicaciones?.length}
      textoVacio="La medicación que indique la clínica aparece acá."
    >
      {medicaciones && medicaciones.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {medicaciones.map((m) => {
            const activa = medicacionActiva(m);
            return (
              <li key={m.id} className="py-2.5">
                <p className={activa ? 'font-medium' : 'font-medium text-slate-400'}>
                  {m.descripcion}
                  {!activa && <span className="ml-2 text-xs font-normal">(terminada)</span>}
                </p>
                {(m.dosis || m.frecuencia_horas) && (
                  <p className="text-sm text-slate-600">
                    {m.dosis}
                    {m.dosis && m.frecuencia_horas ? ' · ' : ''}
                    {m.frecuencia_horas ? `cada ${m.frecuencia_horas} h` : ''}
                  </p>
                )}
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  Desde {formatearFechaCivil(m.desde)}
                  {m.hasta && ` hasta ${formatearFechaCivil(m.hasta)}`}
                  <EtiquetaOrigen registro={m} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}
