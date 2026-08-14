import {
  ETIQUETA_APLICACION,
  hoyCivil,
  sugerirProximaFecha,
  TIPOS_APLICACION,
  type TipoAplicacion,
} from '@ojosdecielo/core';
import { Boton, Campo, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { claves } from './api.js';

const TIPOS_APLIC = TIPOS_APLICACION.map((t) => [t, ETIQUETA_APLICACION[t]] as const);

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

/** Carga de una vacuna o desparasitación aplicada por la clínica. */
export function FormularioAplicacion({
  mascotaId,
  onListo,
}: {
  mascotaId: string;
  onListo: () => void;
}) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoAplicacion>('vacuna');
  const [producto, setProducto] = useState('');
  const [fecha, setFecha] = useState(hoyCivil());
  const [proximaFecha, setProximaFecha] = useState(sugerirProximaFecha(hoyCivil(), 'vacuna'));
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useMutation({
    mutationFn: async (a: {
      tipo: TipoAplicacion;
      fecha: string;
      producto?: string;
      proxima_fecha?: string;
      nota?: string;
    }): Promise<void> => {
      const { error: err } = await supabase.from('aplicacion').insert({
        mascota_id: mascotaId,
        ...a,
      });
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
        if (!fecha) {
          setError('Poné la fecha');
          return;
        }
        if (fecha > hoyCivil()) {
          setError('La fecha no puede ser futura');
          return;
        }
        if (proximaFecha && proximaFecha <= fecha) {
          setError('La próxima fecha tiene que ser posterior');
          return;
        }
        setError(null);
        cargar.mutate(
          {
            tipo,
            fecha,
            ...(producto.trim() && { producto: producto.trim() }),
            ...(proximaFecha && { proxima_fecha: proximaFecha }),
            ...(nota.trim() && { nota: nota.trim() }),
          },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="ap-tipo" etiqueta="Tipo">
          <select
            id="ap-tipo"
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as TipoAplicacion;
              setTipo(t);
              // Sólo pisa la sugerencia si el usuario no la tocó a mano.
              setProximaFecha((actual) =>
                actual === sugerirProximaFecha(fecha, tipo)
                  ? sugerirProximaFecha(fecha, t)
                  : actual,
              );
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
          >
            {TIPOS_APLIC.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="ap-producto" etiqueta="Producto" ayuda="Opcional">
          <Entrada
            id="ap-producto"
            value={producto}
            placeholder="Antirrábica"
            onChange={(e) => setProducto(e.target.value)}
          />
        </Campo>

        <Campo id="ap-fecha" etiqueta="Fecha">
          <Entrada
            id="ap-fecha"
            type="date"
            value={fecha}
            onChange={(e) => {
              const f = e.target.value;
              setFecha(f);
              setProximaFecha((actual) =>
                actual === sugerirProximaFecha(fecha, tipo) ? sugerirProximaFecha(f, tipo) : actual,
              );
            }}
          />
        </Campo>

        <Campo id="ap-proxima" etiqueta="Próxima fecha" ayuda="Sugerida, se puede cambiar">
          <Entrada
            id="ap-proxima"
            type="date"
            value={proximaFecha}
            onChange={(e) => setProximaFecha(e.target.value)}
          />
        </Campo>
      </div>

      <Campo id="ap-nota" etiqueta="Nota" ayuda="Opcional">
        <Entrada id="ap-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
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

/** Carga de una medicación indicada por el veterinario. */
export function FormularioMedicacion({
  mascotaId,
  onListo,
}: {
  mascotaId: string;
  onListo: () => void;
}) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [descripcion, setDescripcion] = useState('');
  const [dosis, setDosis] = useState('');
  const [frecuenciaHoras, setFrecuenciaHoras] = useState('');
  const [desde, setDesde] = useState(hoyCivil());
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useMutation({
    mutationFn: async (m: {
      descripcion: string;
      desde: string;
      dosis?: string;
      frecuencia_horas?: number;
      hasta?: string;
    }): Promise<void> => {
      const { error: err } = await supabase.from('medicacion_en_curso').insert({
        mascota_id: mascotaId,
        ...m,
      });
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
        if (!descripcion.trim()) {
          setError('Poné el nombre del medicamento');
          return;
        }
        if (!desde) {
          setError('Poné desde cuándo');
          return;
        }
        if (frecuenciaHoras && !/^\d+$/.test(frecuenciaHoras)) {
          setError('La frecuencia tiene que ser un número de horas');
          return;
        }
        if (hasta && hasta < desde) {
          setError('La fecha de fin no puede ser anterior al inicio');
          return;
        }
        setError(null);
        cargar.mutate(
          {
            descripcion: descripcion.trim(),
            desde,
            ...(dosis.trim() && { dosis: dosis.trim() }),
            ...(frecuenciaHoras && { frecuencia_horas: Number(frecuenciaHoras) }),
            ...(hasta && { hasta }),
          },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <Campo id="me-desc" etiqueta="Medicamento">
        <Entrada
          id="me-desc"
          autoFocus
          value={descripcion}
          placeholder="Meloxicam"
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </Campo>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="me-dosis" etiqueta="Dosis" ayuda="Opcional">
          <Entrada
            id="me-dosis"
            value={dosis}
            placeholder="0,5 mg"
            onChange={(e) => setDosis(e.target.value)}
          />
        </Campo>

        <Campo id="me-frecuencia" etiqueta="Cada cuántas horas" ayuda="Opcional">
          <Entrada
            id="me-frecuencia"
            inputMode="numeric"
            value={frecuenciaHoras}
            placeholder="24"
            onChange={(e) => setFrecuenciaHoras(e.target.value)}
          />
        </Campo>

        <Campo id="me-desde" etiqueta="Desde">
          <Entrada
            id="me-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </Campo>

        <Campo id="me-hasta" etiqueta="Hasta" ayuda="Opcional">
          <Entrada
            id="me-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </Campo>
      </div>

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
