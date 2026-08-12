import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DatosPeso,
  formatearFechaCivil,
  pesoSchema,
  variacionPeso,
  variacionRelevante,
} from '@ojosdecielo/core';
import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBorrarPeso, useCargarPeso, usePesos } from './api.js';
import { EtiquetaOrigen, puedeEditar } from './Origen.js';
import { Seccion } from './Seccion.js';

// Recharts pesa medio megabyte. Se carga sólo cuando hay una curva que dibujar,
// para no castigar el primer arranque de la app en un celular con mala señal.
const GraficoPeso = lazy(() =>
  import('./GraficoPeso.js').then((m) => ({ default: m.GraficoPeso })),
);

export function SeccionPeso({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: pesos, isLoading } = usePesos(supabase, mascotaId);
  const [agregando, setAgregando] = useState(false);

  // Del más nuevo al más viejo para la lista; el gráfico los quiere al revés.
  const recientes = [...(pesos ?? [])].reverse();
  const ultimo = recientes[0];

  return (
    <Seccion
      titulo="Peso"
      resumen={ultimo ? `${Number(ultimo.peso_kg)} kg` : undefined}
      cargando={isLoading}
      vacio={!pesos?.length}
      textoVacio="Todavía no registraste el peso. Con dos mediciones vas a ver la evolución."
      onAgregar={() => setAgregando(true)}
    >
      {pesos && pesos.length >= 2 && (
        <Suspense fallback={<div className="mt-4 h-48 animate-pulse rounded-lg bg-slate-100" />}>
          <GraficoPeso pesos={pesos} />
        </Suspense>
      )}

      {agregando && <FormularioPeso mascotaId={mascotaId} onCerrar={() => setAgregando(false)} />}

      {recientes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {recientes.map((p, i) => {
            const anterior = recientes[i + 1];
            const variacion = anterior
              ? variacionPeso(Number(p.peso_kg), Number(anterior.peso_kg))
              : 0;

            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">
                    {Number(p.peso_kg)} kg
                    {anterior && variacionRelevante(variacion) && (
                      <span
                        className={
                          variacion > 0
                            ? 'ml-2 text-xs text-amber-700'
                            : 'ml-2 text-xs text-amber-700'
                        }
                      >
                        {variacion > 0 ? '↑' : '↓'} {Math.abs(variacion).toFixed(0)}%
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {formatearFechaCivil(p.fecha)}
                    <EtiquetaOrigen registro={p} />
                  </p>
                  {p.nota && <p className="mt-0.5 text-xs text-slate-500">{p.nota}</p>}
                </div>
                {perfil && puedeEditar(p, perfil.id) && (
                  <BotonBorrar mascotaId={mascotaId} id={p.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

function BotonBorrar({ mascotaId, id }: { mascotaId: string; id: string }) {
  const { supabase } = useAuth();
  const borrar = useBorrarPeso(supabase, mascotaId);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <Boton
        variante="texto"
        className="shrink-0 text-xs text-slate-400"
        onClick={() => setConfirmando(true)}
      >
        Borrar
      </Boton>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Boton
        variante="texto"
        className="text-xs text-red-700"
        cargando={borrar.isPending}
        onClick={() => borrar.mutate(id)}
      >
        Confirmar
      </Boton>
      <Boton
        variante="texto"
        className="text-xs text-slate-400"
        onClick={() => setConfirmando(false)}
      >
        No
      </Boton>
    </div>
  );
}

function FormularioPeso({ mascotaId, onCerrar }: { mascotaId: string; onCerrar: () => void }) {
  const { supabase } = useAuth();
  const cargar = useCargarPeso(supabase, mascotaId);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosPeso>({
    resolver: zodResolver(pesoSchema),
    defaultValues: { fecha: new Date().toISOString().slice(0, 10), nota: '' },
  });

  return (
    <form
      className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3"
      noValidate
      onSubmit={handleSubmit((datos) => {
        setError(null);
        cargar.mutate(datos, {
          onSuccess: onCerrar,
          onError: () => setError('No pudimos guardar el peso. Probá de nuevo.'),
        });
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo id="peso_kg" etiqueta="Peso (kg)" error={errors.peso_kg?.message}>
          <Entrada
            id="peso_kg"
            type="number"
            step="0.01"
            inputMode="decimal"
            autoFocus
            {...register('peso_kg', { valueAsNumber: true })}
          />
        </Campo>
        <Campo id="fecha_peso" etiqueta="Fecha" error={errors.fecha?.message}>
          <Entrada id="fecha_peso" type="date" {...register('fecha')} />
        </Campo>
      </div>

      <Campo id="nota_peso" etiqueta="Nota" ayuda="Opcional" error={errors.nota?.message}>
        <Entrada id="nota_peso" {...register('nota')} />
      </Campo>

      {error && <MensajeError detalle={error} />}

      <div className="flex gap-2">
        <Boton type="submit" cargando={cargar.isPending} className="flex-1 text-sm">
          Guardar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
