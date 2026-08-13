import { ETIQUETA_ANTECEDENTE, type TipoAntecedente } from '@ojosdecielo/core';
import type { ClienteSupabase } from '@ojosdecielo/db';
import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { claves } from './api.js';

const TIPOS = Object.entries(ETIQUETA_ANTECEDENTE) as [TipoAntecedente, string][];

/**
 * Carga de un antecedente diagnosticado por el profesional.
 *
 * El tutor ya podía cargar antecedentes desde la app, pero quedan marcados
 * como reportados por él. Esto es lo mismo del otro lado del mostrador: un
 * trigger le pone origen 'clinica' porque lo escribe personal de la clínica,
 * y no hace falta —ni se debe— mandar ese campo desde el navegador.
 */
export function FormularioAntecedente({
  mascotaId,
  onListo,
}: {
  mascotaId: string;
  onListo: () => void;
}) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoAntecedente>('patologia_cronica');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCargarAntecedente(supabase, mascotaId, qc);

  return (
    <form
      className="mt-3 rounded-lg border border-slate-200 p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!descripcion.trim()) {
          setError('Contanos de qué se trata');
          return;
        }
        setError(null);
        cargar.mutate(
          {
            tipo,
            descripcion: descripcion.trim(),
            ...(fecha && { fecha }),
          },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="a-tipo" etiqueta="Tipo">
          <select
            id="a-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAntecedente)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
          >
            {TIPOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="a-fecha" etiqueta="Desde cuándo" ayuda="Opcional">
          <Entrada
            id="a-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Campo>
      </div>

      <Campo id="a-desc" etiqueta="Descripción">
        <Entrada
          id="a-desc"
          autoFocus
          maxLength={300}
          value={descripcion}
          placeholder="Alergia a la penicilina"
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </Campo>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Boton type="submit" className="text-sm" cargando={cargar.isPending}>
          Guardar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function useCargarAntecedente(
  supabase: ClienteSupabase,
  mascotaId: string,
  qc: ReturnType<typeof useQueryClient>,
) {
  return useMutation({
    mutationFn: async (a: {
      tipo: TipoAntecedente;
      descripcion: string;
      fecha?: string;
    }): Promise<void> => {
      const { error } = await supabase.from('antecedente').insert({
        mascota_id: mascotaId,
        tipo: a.tipo,
        descripcion: a.descripcion,
        ...(a.fecha && { fecha: a.fecha }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.salud(mascotaId) }),
  });
}
