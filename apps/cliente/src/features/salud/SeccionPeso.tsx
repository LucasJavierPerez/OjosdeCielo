import { formatearFechaCivil, variacionPeso, variacionRelevante } from '@ojosdecielo/core';
import { useAuth } from '@ojosdecielo/ui/auth';
import { lazy, Suspense } from 'react';
import { usePesos } from './api.js';
import { EtiquetaOrigen, MotivoDescarte } from './Origen.js';
import { Seccion } from './Seccion.js';

// Recharts pesa medio megabyte. Se carga sólo cuando hay una curva que dibujar,
// para no castigar el primer arranque de la app en un celular con mala señal.
const GraficoPeso = lazy(() =>
  import('./GraficoPeso.js').then((m) => ({ default: m.GraficoPeso })),
);

export function SeccionPeso({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const { data: pesos, isLoading } = usePesos(supabase, mascotaId);

  // Del más nuevo al más viejo para la lista; el gráfico los quiere al revés.
  const recientes = [...(pesos ?? [])].reverse();
  const ultimo = recientes.find((p) => !p.descartado_en);
  const vigentes = (pesos ?? []).filter((p) => !p.descartado_en);

  return (
    <Seccion
      titulo="Peso"
      resumen={ultimo ? `${Number(ultimo.peso_kg)} kg` : undefined}
      cargando={isLoading}
      vacio={!pesos?.length}
      textoVacio="Los pesos medidos en la clínica aparecen acá."
    >
      {vigentes.length >= 2 && (
        <Suspense fallback={<div className="mt-4 h-48 animate-pulse rounded-lg bg-slate-100" />}>
          <GraficoPeso pesos={vigentes} />
        </Suspense>
      )}

      {recientes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {recientes.map((p) => {
            const posicion = vigentes.findIndex((v) => v.id === p.id);
            const anterior = posicion > 0 ? vigentes[posicion - 1] : undefined;
            const variacion =
              anterior && !p.descartado_en
                ? variacionPeso(Number(p.peso_kg), Number(anterior.peso_kg))
                : 0;

            return (
              <li key={p.id} className="py-2.5">
                <p
                  className={
                    p.descartado_en ? 'font-medium text-slate-400 line-through' : 'font-medium'
                  }
                >
                  {Number(p.peso_kg)} kg
                  {anterior && variacionRelevante(variacion) && (
                    <span className="ml-2 text-xs text-amber-700">
                      {variacion > 0 ? '↑' : '↓'} {Math.abs(variacion).toFixed(0)}%
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  {formatearFechaCivil(p.fecha)}
                  <EtiquetaOrigen registro={p} />
                </p>
                {p.nota && <p className="mt-0.5 text-xs text-slate-500">{p.nota}</p>}
                <MotivoDescarte registro={p} />
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}
