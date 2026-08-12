import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DatosMedicacion,
  formatearFechaCivil,
  medicacionActiva,
  medicacionSchema,
} from '@ojosdecielo/core';
import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBorrarMedicacion, useCargarMedicacion, useMedicacion } from './api.js';
import { EtiquetaOrigen, puedeEditar } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionMedicacion({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: medicaciones, isLoading } = useMedicacion(supabase, mascotaId);
  const borrar = useBorrarMedicacion(supabase, mascotaId);
  const [agregando, setAgregando] = useState(false);

  const activas = (medicaciones ?? []).filter(medicacionActiva);

  return (
    <Seccion
      titulo="Medicación"
      resumen={activas.length > 0 ? `${activas.length} en curso` : undefined}
      cargando={isLoading}
      vacio={!medicaciones?.length}
      textoVacio="Anotá lo que le estés dando para llevar el control."
      onAgregar={() => setAgregando(true)}
    >
      {agregando && (
        <FormularioMedicacion mascotaId={mascotaId} onCerrar={() => setAgregando(false)} />
      )}

      {medicaciones && medicaciones.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {medicaciones.map((m) => {
            const activa = medicacionActiva(m);
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
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
                </div>
                {perfil && puedeEditar(m, perfil.id) && (
                  <Boton
                    variante="texto"
                    className="shrink-0 text-xs text-slate-400"
                    cargando={borrar.isPending}
                    onClick={() => borrar.mutate(m.id)}
                  >
                    Borrar
                  </Boton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

function FormularioMedicacion({
  mascotaId,
  onCerrar,
}: {
  mascotaId: string;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const cargar = useCargarMedicacion(supabase, mascotaId);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosMedicacion>({
    resolver: zodResolver(medicacionSchema),
    defaultValues: {
      descripcion: '',
      dosis: '',
      frecuencia_horas: '',
      desde: new Date().toISOString().slice(0, 10),
      hasta: '',
    },
  });

  return (
    <form
      className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3"
      noValidate
      onSubmit={handleSubmit((datos) => {
        setError(null);
        cargar.mutate(datos, {
          onSuccess: onCerrar,
          onError: () => setError('No pudimos guardar. Probá de nuevo.'),
        });
      })}
    >
      <Campo id="desc_med" etiqueta="Medicamento" error={errors.descripcion?.message}>
        <Entrada id="desc_med" autoFocus {...register('descripcion')} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="dosis_med" etiqueta="Dosis" ayuda="Opcional" error={errors.dosis?.message}>
          <Entrada id="dosis_med" {...register('dosis')} />
        </Campo>
        <Campo
          id="frec_med"
          etiqueta="Cada (horas)"
          ayuda="Opcional"
          error={errors.frecuencia_horas?.message}
        >
          <Entrada
            id="frec_med"
            type="number"
            inputMode="numeric"
            {...register('frecuencia_horas')}
          />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="desde_med" etiqueta="Desde" error={errors.desde?.message}>
          <Entrada id="desde_med" type="date" {...register('desde')} />
        </Campo>
        <Campo id="hasta_med" etiqueta="Hasta" ayuda="Opcional" error={errors.hasta?.message}>
          <Entrada id="hasta_med" type="date" {...register('hasta')} />
        </Campo>
      </div>

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
