import {
  ETIQUETA_APLICACION,
  estadoVencimiento,
  formatearFechaCivil,
  type TipoAplicacion,
  textoRelativo,
} from '@ojosdecielo/core';
import { cn } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { type Aplicacion, useAplicaciones } from './api.js';
import { EtiquetaOrigen } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionAplicaciones({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const { data: aplicaciones, isLoading } = useAplicaciones(supabase, mascotaId);

  const pendientes = (aplicaciones ?? []).filter((a) => {
    const estado = estadoVencimiento(a.proxima_fecha);
    return estado === 'vencida' || estado === 'proxima';
  });

  return (
    <Seccion
      titulo="Vacunas y desparasitaciones"
      resumen={pendientes.length > 0 ? `${pendientes.length} por dar` : undefined}
      cargando={isLoading}
      vacio={!aplicaciones?.length}
      textoVacio="El carnet lo carga la clínica; acá vas a ver las fechas y los avisos."
    >
      {aplicaciones && aplicaciones.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {aplicaciones.map((a) => (
            <FilaAplicacion key={a.id} aplicacion={a} />
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function FilaAplicacion({ aplicacion: a }: { aplicacion: Aplicacion }) {
  const estado = estadoVencimiento(a.proxima_fecha);

  return (
    <li className="py-2.5">
      <p className="font-medium">
        {ETIQUETA_APLICACION[a.tipo as TipoAplicacion]}
        {a.producto && <span className="font-normal text-slate-600"> · {a.producto}</span>}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {formatearFechaCivil(a.fecha)}
        <EtiquetaOrigen registro={a} />
      </p>

      {a.proxima_fecha && estado && (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            estado === 'vencida' && 'text-red-700',
            estado === 'proxima' && 'text-amber-700',
            estado === 'al_dia' && 'text-slate-500',
          )}
        >
          {estado === 'vencida' ? 'Vencida' : 'Próxima'}: {formatearFechaCivil(a.proxima_fecha)}{' '}
          <span className="font-normal">({textoRelativo(a.proxima_fecha)})</span>
        </p>
      )}

      {a.nota && <p className="mt-0.5 text-xs text-slate-500">{a.nota}</p>}
    </li>
  );
}
