import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { type DatosConsulta, useCargarConsulta } from './api.js';

/**
 * Carga de una consulta.
 *
 * Se optimiza para el uso repetido con el paciente adelante: un solo campo
 * obligatorio, todo en una pantalla sin pasos, y foco directo en el motivo.
 * La fricción acá es la causa número uno de abandono de estos sistemas.
 */
export function FormularioConsulta({
  mascotaId,
  corrigeA,
  onListo,
  onCancelar,
}: {
  mascotaId: string;
  corrigeA?: string;
  onListo: (consultaId: string) => void;
  onCancelar: () => void;
}) {
  const { supabase } = useAuth();
  const cargar = useCargarConsulta(supabase, mascotaId);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosConsulta>({
    motivo: '',
    anamnesis: '',
    examen_fisico: '',
    diagnostico: '',
    tratamiento: '',
    evolucion: '',
    peso_kg: '',
    temperatura: '',
  });

  const set = (campo: keyof DatosConsulta) => (v: string) => setDatos({ ...datos, [campo]: v });

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!datos.motivo.trim()) {
          setError('El motivo de consulta es obligatorio');
          return;
        }
        setError(null);
        cargar.mutate(
          { ...datos, ...(corrigeA && { corrige_a: corrigeA }) },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <h2 className="font-medium">{corrigeA ? 'Corregir consulta' : 'Nueva consulta'}</h2>

      {corrigeA && (
        <p className="mt-1 text-sm text-amber-800">
          La consulta original se conserva. Esta la reemplaza en el historial, dejando el rastro de
          la corrección.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <Campo id="motivo" etiqueta="Motivo de consulta">
          <Entrada
            id="motivo"
            autoFocus
            required
            placeholder="Control, vacunación, decaimiento…"
            value={datos.motivo}
            onChange={(e) => set('motivo')(e.target.value)}
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="peso_kg" etiqueta="Peso (kg)" ayuda="Se suma a la curva del paciente">
            <Entrada
              id="peso_kg"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={datos.peso_kg}
              onChange={(e) => set('peso_kg')(e.target.value)}
            />
          </Campo>
          <Campo id="temperatura" etiqueta="Temperatura (°C)">
            <Entrada
              id="temperatura"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={datos.temperatura}
              onChange={(e) => set('temperatura')(e.target.value)}
            />
          </Campo>
        </div>

        <AreaTexto
          id="anamnesis"
          etiqueta="Anamnesis"
          valor={datos.anamnesis ?? ''}
          onCambio={set('anamnesis')}
        />
        <AreaTexto
          id="examen_fisico"
          etiqueta="Examen físico"
          valor={datos.examen_fisico ?? ''}
          onCambio={set('examen_fisico')}
        />
        <AreaTexto
          id="diagnostico"
          etiqueta="Diagnóstico"
          valor={datos.diagnostico ?? ''}
          onCambio={set('diagnostico')}
        />
        <AreaTexto
          id="tratamiento"
          etiqueta="Tratamiento"
          valor={datos.tratamiento ?? ''}
          onCambio={set('tratamiento')}
        />
        <AreaTexto
          id="evolucion"
          etiqueta="Evolución"
          valor={datos.evolucion ?? ''}
          onCambio={set('evolucion')}
        />
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Una vez guardada, la consulta no se edita ni se borra. Para corregirla se carga una nueva
        que la reemplaza en el historial.
      </p>

      <div className="mt-3 flex gap-2">
        <Boton type="submit" cargando={cargar.isPending}>
          Guardar consulta
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function AreaTexto({
  id,
  etiqueta,
  valor,
  onCambio,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={2}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
