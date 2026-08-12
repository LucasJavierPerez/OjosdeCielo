import { Boton, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useRef, useState } from 'react';
import { type Adjunto, urlEstudio, useAdjuntos, useSubirEstudio } from './api.js';

const TIPOS: { valor: Adjunto['tipo']; etiqueta: string }[] = [
  { valor: 'radiografia', etiqueta: 'Radiografía' },
  { valor: 'ecografia', etiqueta: 'Ecografía' },
  { valor: 'laboratorio', etiqueta: 'Laboratorio' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const ETIQUETA: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.etiqueta]),
);

const MAXIMO_BYTES = 20 * 1024 * 1024;

export function Estudios({
  mascotaId,
  consultaId,
  puedoSubir,
}: {
  mascotaId: string;
  consultaId: string;
  puedoSubir: boolean;
}) {
  const { supabase } = useAuth();
  const { data: adjuntos } = useAdjuntos(supabase, consultaId);
  const subir = useSubirEstudio(supabase, mascotaId, consultaId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<Adjunto['tipo']>('radiografia');
  const [error, setError] = useState<string | null>(null);

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    // Se valida antes de subir: no tiene sentido esperar 20 MB para que el
    // servidor lo rechace.
    if (archivo.size > MAXIMO_BYTES) {
      setError('El archivo no puede pesar más de 20 MB');
      e.target.value = '';
      return;
    }

    setError(null);
    subir.mutate(
      { archivo, tipo },
      {
        onError: (err) => setError(err.message),
        onSettled: () => {
          if (inputRef.current) inputRef.current.value = '';
        },
      },
    );
  }

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Estudios</h3>

      {adjuntos && adjuntos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {adjuntos.map((a) => (
            <FilaEstudio key={a.id} adjunto={a} />
          ))}
        </ul>
      )}

      {adjuntos?.length === 0 && !puedoSubir && (
        <p className="mt-1 text-sm text-slate-400">Sin estudios adjuntos</p>
      )}

      {puedoSubir && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`tipo-${consultaId}`} className="sr-only">
            Tipo de estudio
          </label>
          <select
            id={`tipo-${consultaId}`}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Adjunto['tipo'])}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>

          <input
            ref={inputRef}
            type="file"
            id={`archivo-${consultaId}`}
            accept="image/jpeg,image/png,image/webp,image/tiff,application/pdf,.dcm"
            onChange={alElegir}
            className="sr-only"
          />
          <label
            htmlFor={`archivo-${consultaId}`}
            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {subir.isPending ? 'Subiendo…' : 'Adjuntar archivo'}
          </label>

          <span className="text-xs text-slate-400">JPG, PNG, PDF o DICOM · hasta 20 MB</span>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <MensajeError detalle={error} />
        </div>
      )}
    </div>
  );
}

function FilaEstudio({ adjunto }: { adjunto: Adjunto }) {
  const { supabase } = useAuth();
  const [abriendo, setAbriendo] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {ETIQUETA[adjunto.tipo] ?? adjunto.tipo}
        </span>
        <span className="ml-2 truncate">{adjunto.nombre_archivo}</span>
        <span className="ml-2 text-xs text-slate-400">
          {(adjunto.tamano_bytes / 1024 / 1024).toFixed(1)} MB
        </span>
      </span>

      <Boton
        variante="texto"
        className="shrink-0 text-sm"
        cargando={abriendo}
        onClick={async () => {
          setAbriendo(true);
          // URL firmada de vida corta: el bucket es privado y nunca se expone
          // una ruta pública a un estudio médico.
          const url = await urlEstudio(supabase, adjunto.storage_path);
          setAbriendo(false);
          if (url) globalThis.open(url, '_blank', 'noopener');
        }}
      >
        Abrir
      </Boton>
    </li>
  );
}
