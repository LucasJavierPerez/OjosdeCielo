import { Boton, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { claves } from './api.js';

export type TablaSalud = 'peso_registro' | 'aplicacion' | 'antecedente' | 'medicacion_en_curso';

/**
 * Acciones del profesional sobre un registro de salud.
 *
 * Dos caminos según de dónde venga el dato, y la diferencia es deliberada:
 *
 * - Lo cargado por la clínica se edita y se borra como cualquier cosa propia.
 * - Lo reportado por el tutor **no se reescribe**: se descarta con un motivo.
 *   Corregirle el número al tutor dejaría un registro que dice "reportado por
 *   el tutor" con un valor que el tutor nunca dijo.
 *
 * Descartar es lo que le da al veterinario el control clínico real: el dato
 * sale de las curvas, de las alertas y de la historia, sin borrar el hecho de
 * que alguien lo reportó.
 */
export function AccionesRegistro({
  tabla,
  registro,
  mascotaId,
  puedoEditar,
}: {
  tabla: TablaSalud;
  registro: { id: string; origen: string; descartado_en?: string | null };
  mascotaId: string;
  puedoEditar: boolean;
}) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: claves.salud(mascotaId) });

  const descartar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('descartar_registro', {
        p_tabla: tabla,
        p_id: registro.id,
        p_motivo: motivo.trim(),
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      setDescartando(false);
      setMotivo('');
      void refrescar();
    },
  });

  const restaurar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('restaurar_registro', {
        p_tabla: tabla,
        p_id: registro.id,
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: refrescar,
  });

  const borrar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.from(tabla).delete().eq('id', registro.id);
      if (err) throw new Error(err.message);
    },
    onSuccess: refrescar,
  });

  if (!puedoEditar) return null;

  if (registro.descartado_en) {
    return (
      <Boton
        variante="texto"
        className="text-xs"
        cargando={restaurar.isPending}
        onClick={() => restaurar.mutate(undefined, { onError: (e) => setError(e.message) })}
      >
        Restaurar
      </Boton>
    );
  }

  if (registro.origen === 'clinica') {
    return (
      <>
        <Boton
          variante="texto"
          className="text-xs text-slate-500"
          cargando={borrar.isPending}
          onClick={() => borrar.mutate(undefined, { onError: (e) => setError(e.message) })}
        >
          Borrar
        </Boton>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </>
    );
  }

  return (
    <>
      {!descartando && (
        <Boton
          variante="texto"
          className="text-xs text-slate-500"
          onClick={() => setDescartando(true)}
        >
          Descartar
        </Boton>
      )}

      {descartando && (
        <div className="w-full min-w-56">
          <p className="text-xs text-slate-600">
            No se borra: el tutor lo reportó. Deja de contar y él va a leer el motivo.
          </p>
          <Entrada
            aria-label="Motivo del descarte"
            autoFocus
            value={motivo}
            placeholder="Error de tipeo: pesa 4,2 kg"
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-1 text-sm"
          />
          {error && (
            <div className="mt-2">
              <MensajeError detalle={error} />
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Boton
              className="text-xs"
              cargando={descartar.isPending}
              onClick={() => {
                if (!motivo.trim()) {
                  setError('Hace falta el motivo');
                  return;
                }
                setError(null);
                descartar.mutate(undefined, { onError: (e) => setError(e.message) });
              }}
            >
              Descartar
            </Boton>
            <Boton
              variante="texto"
              className="text-xs text-slate-500"
              onClick={() => setDescartando(false)}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </>
  );
}

/** Carga de un peso medido en el consultorio. */
export function FormularioPeso({ mascotaId, onListo }: { mascotaId: string; onListo: () => void }) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [peso, setPeso] = useState('');
  const [nota, setNota] = useState('Balanza de consultorio');
  const [error, setError] = useState<string | null>(null);

  const cargar = useMutation({
    mutationFn: async (fila: { peso_kg: number; nota?: string }): Promise<void> => {
      // El origen y quién lo cargó los pone un trigger del servidor: mandarlos
      // desde acá no cambiaría nada (AGENTS.md, regla 3).
      const { error: err } = await supabase
        .from('peso_registro')
        .insert({ mascota_id: mascotaId, ...fila });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.salud(mascotaId) }),
  });

  return (
    <form
      className="mt-3 rounded-lg border border-slate-200 p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const kg = Number(peso.replace(',', '.'));
        if (!kg || kg <= 0) {
          setError('Poné el peso en kilos');
          return;
        }
        setError(null);
        cargar.mutate(
          { peso_kg: kg, ...(nota.trim() && { nota: nota.trim() }) },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="peso-kg" className="block text-xs text-slate-500">
            Peso (kg)
          </label>
          <Entrada
            id="peso-kg"
            autoFocus
            inputMode="decimal"
            value={peso}
            placeholder="4,2"
            onChange={(e) => setPeso(e.target.value)}
            className="mt-1 w-24"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="peso-nota" className="block text-xs text-slate-500">
            Nota
          </label>
          <Entrada
            id="peso-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="mt-1"
          />
        </div>
        <Boton type="submit" className="text-sm" cargando={cargar.isPending}>
          Guardar
        </Boton>
        <Boton variante="texto" className="text-sm text-slate-500" onClick={onListo}>
          Cancelar
        </Boton>
      </div>

      {error && (
        <div className="mt-2">
          <MensajeError detalle={error} />
        </div>
      )}
    </form>
  );
}
