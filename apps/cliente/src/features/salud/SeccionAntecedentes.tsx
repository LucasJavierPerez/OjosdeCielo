import { zodResolver } from '@hookform/resolvers/zod';
import {
  antecedenteSchema,
  type DatosAntecedente,
  ETIQUETA_ANTECEDENTE,
  formatearFechaCivil,
  TIPOS_ANTECEDENTE,
  type TipoAntecedente,
} from '@ojosdecielo/core';
import { Boton, Campo, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAntecedentes, useBorrarAntecedente, useCargarAntecedente } from './api.js';
import { EtiquetaOrigen, puedeEditar } from './Origen.js';
import { Seccion } from './Seccion.js';

export function SeccionAntecedentes({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: antecedentes, isLoading } = useAntecedentes(supabase, mascotaId);
  const borrar = useBorrarAntecedente(supabase, mascotaId);
  const [agregando, setAgregando] = useState(false);

  return (
    <Seccion
      titulo="Alergias y antecedentes"
      cargando={isLoading}
      vacio={!antecedentes?.length}
      textoVacio="Anotá alergias, cirugías o condiciones que el veterinario deba conocer."
      onAgregar={() => setAgregando(true)}
    >
      {agregando && (
        <FormularioAntecedente mascotaId={mascotaId} onCerrar={() => setAgregando(false)} />
      )}

      {antecedentes && antecedentes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {antecedentes.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{ETIQUETA_ANTECEDENTE[a.tipo as TipoAntecedente]}</p>
                <p className="text-sm text-slate-700">{a.descripcion}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  {a.fecha && formatearFechaCivil(a.fecha)}
                  <EtiquetaOrigen registro={a} />
                </p>
              </div>
              {perfil && puedeEditar(a, perfil.id) && (
                <Boton
                  variante="texto"
                  className="shrink-0 text-xs text-slate-400"
                  cargando={borrar.isPending}
                  onClick={() => borrar.mutate(a.id)}
                >
                  Borrar
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function FormularioAntecedente({
  mascotaId,
  onCerrar,
}: {
  mascotaId: string;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const cargar = useCargarAntecedente(supabase, mascotaId);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosAntecedente>({
    resolver: zodResolver(antecedenteSchema),
    defaultValues: { tipo: 'alergia', descripcion: '', fecha: '' },
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
      <Campo id="tipo_ant" etiqueta="Tipo" error={errors.tipo?.message}>
        <Seleccion id="tipo_ant" {...register('tipo')}>
          {TIPOS_ANTECEDENTE.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_ANTECEDENTE[t]}
            </option>
          ))}
        </Seleccion>
      </Campo>

      <Campo
        id="desc_ant"
        etiqueta="Descripción"
        ayuda="Ej: alergia al pollo, castración en 2024"
        error={errors.descripcion?.message}
      >
        <Entrada id="desc_ant" autoFocus {...register('descripcion')} />
      </Campo>

      <Campo id="fecha_ant" etiqueta="Fecha" ayuda="Opcional" error={errors.fecha?.message}>
        <Entrada id="fecha_ant" type="date" {...register('fecha')} />
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
