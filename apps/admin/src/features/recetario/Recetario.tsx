import {
  formatearFechaCivil,
  formatearFechaHora,
  hoyCivil,
  puedeCargarHistoriaClinica,
  sumarDiasCiviles,
} from '@ojosdecielo/core';
import { Boton, Campo, Cargando, cn, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import {
  type ItemNuevo,
  type RecetaConItems,
  useAnularReceta,
  useEmitirReceta,
  useMarcarDispensada,
  useRecetas,
} from './api.js';

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-800' },
  dispensada: { texto: 'Dispensada', clase: 'bg-slate-100 text-slate-600' },
  anulada: { texto: 'Anulada', clase: 'bg-red-100 text-red-800' },
};

// Un mes es el vencimiento habitual de una receta; el veterinario lo cambia.
const enUnMes = () => sumarDiasCiviles(hoyCivil(), 30);

export function Recetario({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: recetas, isLoading, isError, refetch } = useRecetas(supabase, mascotaId);
  const [emitiendo, setEmitiendo] = useState(false);

  const puedoRecetar = perfil ? puedeCargarHistoriaClinica(perfil.rol) : false;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">Recetas</h2>
        {puedoRecetar && !emitiendo && (
          <Boton onClick={() => setEmitiendo(true)}>Nueva receta</Boton>
        )}
      </div>

      {!puedoRecetar && (
        <p className="mt-2 text-sm text-slate-500">Recetar es exclusivo del veterinario.</p>
      )}

      {emitiendo && (
        <div className="mt-3">
          <FormularioReceta mascotaId={mascotaId} onListo={() => setEmitiendo(false)} />
        </div>
      )}

      {isLoading && <Cargando etiqueta="Cargando recetas" />}

      {isError && (
        <div className="mt-3">
          <MensajeError
            titulo="No pudimos cargar las recetas"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {recetas && recetas.length === 0 && !emitiendo && (
        <div className="mt-3">
          <Vacio titulo="Sin recetas" descripcion="Las recetas emitidas van a aparecer acá." />
        </div>
      )}

      {recetas && recetas.length > 0 && (
        <ol className="mt-4 space-y-3">
          {recetas.map((r) => (
            <FilaReceta key={r.id} receta={r} mascotaId={mascotaId} puedoRecetar={puedoRecetar} />
          ))}
        </ol>
      )}
    </section>
  );
}

function FilaReceta({
  receta,
  mascotaId,
  puedoRecetar,
}: {
  receta: RecetaConItems;
  mascotaId: string;
  puedoRecetar: boolean;
}) {
  const { supabase } = useAuth();
  const anular = useAnularReceta(supabase, mascotaId);
  const dispensar = useMarcarDispensada(supabase, mascotaId);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const estado = ETIQUETA_ESTADO[receta.estado] ?? {
    texto: receta.estado,
    clase: 'bg-slate-100 text-slate-600',
  };
  const vencida = receta.vence_el < hoyCivil();

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', estado.clase)}>
            {estado.texto}
          </span>
          {receta.estado === 'vigente' && vencida && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Vencida
            </span>
          )}
          <span className="ml-2 text-sm text-slate-500">
            {formatearFechaHora(receta.emitida_en)} · vence {formatearFechaCivil(receta.vence_el)}
          </span>
        </div>
        <span className="font-mono text-xs text-slate-400">{receta.codigo}</span>
      </div>

      {receta.diagnostico && <p className="mt-2 text-sm">{receta.diagnostico}</p>}

      <ul className="mt-3 space-y-1.5 text-sm">
        {[...receta.items]
          .sort((a, b) => a.orden - b.orden)
          .map((i) => (
            <li key={i.id}>
              <span className="font-medium">{i.descripcion}</span>
              {i.cronico && (
                <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
                  Crónico
                </span>
              )}
              <span className="block text-slate-500">
                {i.cantidad} · {i.dosis}
                {i.duracion && ` · ${i.duracion}`}
              </span>
            </li>
          ))}
      </ul>

      {receta.indicaciones && (
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
          {receta.indicaciones}
        </p>
      )}

      {receta.estado === 'anulada' && receta.motivo_anulacion && (
        <p className="mt-3 text-sm text-red-700">Anulada: {receta.motivo_anulacion}</p>
      )}

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {receta.estado === 'vigente' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Boton
            variante="secundario"
            className="text-sm"
            cargando={dispensar.isPending}
            onClick={() => {
              setError(null);
              dispensar.mutate(receta.id, { onError: (e) => setError(e.message) });
            }}
          >
            Marcar dispensada
          </Boton>

          {puedoRecetar && !anulando && (
            <Boton
              variante="texto"
              className="text-sm text-slate-500"
              onClick={() => setAnulando(true)}
            >
              Anular
            </Boton>
          )}
        </div>
      )}

      {anulando && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-900">
            Anular no borra nada: la receta queda con el motivo asentado y la página de verificación
            pasa a decir que no vale.
          </p>
          <Campo id={`motivo-${receta.id}`} etiqueta="Motivo">
            <Entrada
              id={`motivo-${receta.id}`}
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Dosis mal calculada"
            />
          </Campo>
          <div className="mt-3 flex gap-2">
            <Boton
              cargando={anular.isPending}
              onClick={() => {
                if (!motivo.trim()) {
                  setError('Hace falta el motivo');
                  return;
                }
                setError(null);
                anular.mutate(
                  { id: receta.id, motivo: motivo.trim() },
                  {
                    onSuccess: () => {
                      setAnulando(false);
                      setMotivo('');
                    },
                    onError: (e) => setError(e.message),
                  },
                );
              }}
            >
              Anular receta
            </Boton>
            <Boton variante="secundario" onClick={() => setAnulando(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

const ITEM_VACIO: ItemNuevo = { descripcion: '', cantidad: '', dosis: '', cronico: false };

function FormularioReceta({ mascotaId, onListo }: { mascotaId: string; onListo: () => void }) {
  const { supabase } = useAuth();
  const emitir = useEmitirReceta(supabase, mascotaId);
  const [venceEl, setVenceEl] = useState(enUnMes());
  const [diagnostico, setDiagnostico] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [items, setItems] = useState<ItemNuevo[]>([{ ...ITEM_VACIO }]);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (i: number, campos: Partial<ItemNuevo>) =>
    setItems((prev) => prev.map((it, n) => (n === i ? { ...it, ...campos } : it)));

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const completos = items.filter(
          (i) => i.descripcion.trim() && i.cantidad.trim() && i.dosis.trim(),
        );
        if (completos.length === 0) {
          setError('Cargá al menos un medicamento con cantidad y dosis');
          return;
        }
        setError(null);
        emitir.mutate(
          {
            venceEl,
            items: completos.map((i) => ({
              descripcion: i.descripcion.trim(),
              cantidad: i.cantidad.trim(),
              dosis: i.dosis.trim(),
              cronico: i.cronico,
              ...(i.duracion?.trim() && { duracion: i.duracion.trim() }),
            })),
            ...(diagnostico.trim() && { diagnostico }),
            ...(indicaciones.trim() && { indicaciones }),
          },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <h3 className="font-medium">Nueva receta</h3>
      <p className="mt-1 text-sm text-slate-500">
        Una vez emitida no se edita. Si hay un error se anula y se emite otra.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="r-vence" etiqueta="Vence el">
          <Entrada
            id="r-vence"
            type="date"
            value={venceEl}
            onChange={(e) => setVenceEl(e.target.value)}
          />
        </Campo>
        <Campo id="r-diagnostico" etiqueta="Diagnóstico" ayuda="Opcional">
          <Entrada
            id="r-diagnostico"
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
          />
        </Campo>
      </div>

      <h4 className="mt-5 text-sm font-medium text-slate-500">Medicamentos</h4>
      <ul className="mt-2 space-y-3">
        {items.map((it, i) => (
          // Las filas no tienen id propio hasta que se emite la receta y el
          // usuario puede reordenarlas mentalmente pero no en la UI: el índice
          // alcanza como clave y no hay riesgo de reordenamiento.
          // biome-ignore lint/suspicious/noArrayIndexKey: filas sin identidad propia
          <li key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id={`m-desc-${i}`} etiqueta="Medicamento">
                <Entrada
                  id={`m-desc-${i}`}
                  value={it.descripcion}
                  placeholder="Enalapril 5 mg"
                  onChange={(e) => cambiar(i, { descripcion: e.target.value })}
                />
              </Campo>
              <Campo id={`m-cant-${i}`} etiqueta="Cantidad">
                <Entrada
                  id={`m-cant-${i}`}
                  value={it.cantidad}
                  placeholder="30 comprimidos"
                  onChange={(e) => cambiar(i, { cantidad: e.target.value })}
                />
              </Campo>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo id={`m-dosis-${i}`} etiqueta="Dosis">
                <Entrada
                  id={`m-dosis-${i}`}
                  value={it.dosis}
                  placeholder="Medio comprimido cada 12 h"
                  onChange={(e) => cambiar(i, { dosis: e.target.value })}
                />
              </Campo>
              <Campo id={`m-dur-${i}`} etiqueta="Duración" ayuda="Opcional">
                <Entrada
                  id={`m-dur-${i}`}
                  value={it.duracion ?? ''}
                  placeholder="30 días"
                  onChange={(e) => cambiar(i, { duracion: e.target.value })}
                />
              </Campo>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={it.cronico}
                  onChange={(e) => cambiar(i, { cronico: e.target.checked })}
                  className="size-4 rounded border-slate-300"
                />
                Tratamiento crónico
                <span className="text-xs text-slate-500">
                  (el tutor puede pedir reposición sin volver)
                </span>
              </label>
              {items.length > 1 && (
                <Boton
                  variante="texto"
                  className="text-sm text-slate-500"
                  onClick={() => setItems((prev) => prev.filter((_, n) => n !== i))}
                >
                  Quitar
                </Boton>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Boton
        variante="secundario"
        className="mt-3 text-sm"
        onClick={() => setItems((prev) => [...prev, { ...ITEM_VACIO }])}
      >
        Agregar medicamento
      </Boton>

      <Campo id="r-indicaciones" etiqueta="Indicaciones generales" ayuda="Opcional">
        <textarea
          id="r-indicaciones"
          rows={2}
          value={indicaciones}
          onChange={(e) => setIndicaciones(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Campo>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={emitir.isPending}>
          Emitir receta
        </Boton>
        <Boton variante="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
