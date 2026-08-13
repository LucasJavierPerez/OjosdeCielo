import { formatearFechaHora, puedeCargarHistoriaClinica } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { type EntradaHistorial, useHistorial } from './api.js';
import { Estudios } from './Estudios.js';
import { FormularioConsulta } from './FormularioConsulta.js';

export function Historial({ mascotaId }: { mascotaId: string }) {
  const { supabase, perfil } = useAuth();
  const { data: historial, isLoading, isError, refetch } = useHistorial(supabase, mascotaId);
  const [cargando, setCargando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);

  const puedoCargar = perfil ? puedeCargarHistoriaClinica(perfil.roles) : false;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">Historia clínica</h2>
        {puedoCargar && !cargando && !corrigiendo && (
          <Boton onClick={() => setCargando(true)}>Nueva consulta</Boton>
        )}
      </div>

      {!puedoCargar && (
        <p className="mt-2 text-sm text-slate-500">
          Registrar consultas es exclusivo del veterinario.
        </p>
      )}

      {(cargando || corrigiendo) && (
        <div className="mt-3">
          <FormularioConsulta
            mascotaId={mascotaId}
            {...(corrigiendo ? { corrigeA: corrigiendo } : {})}
            onListo={() => {
              setCargando(false);
              setCorrigiendo(null);
            }}
            onCancelar={() => {
              setCargando(false);
              setCorrigiendo(null);
            }}
          />
        </div>
      )}

      {isLoading && <Cargando etiqueta="Cargando la historia clínica" />}

      {isError && (
        <div className="mt-3">
          <MensajeError
            titulo="No pudimos cargar la historia clínica"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {historial && historial.length === 0 && !cargando && (
        <div className="mt-3">
          <Vacio
            titulo="Sin consultas registradas"
            descripcion={
              puedoCargar
                ? 'La primera consulta que cargues va a aparecer acá.'
                : 'Todavía no hay atención registrada para este paciente.'
            }
          />
        </div>
      )}

      {historial && historial.length > 0 && (
        <ol className="mt-4 space-y-3">
          {historial.map((c) => (
            <Consulta
              key={c.id}
              consulta={c}
              mascotaId={mascotaId}
              puedoCargar={puedoCargar}
              onCorregir={() => setCorrigiendo(c.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Consulta({
  consulta: c,
  mascotaId,
  puedoCargar,
  onCorregir,
}: {
  consulta: EntradaHistorial;
  mascotaId: string;
  puedoCargar: boolean;
  onCorregir: () => void;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{c.motivo}</p>
          <p className="text-sm text-slate-500">
            {formatearFechaHora(c.fecha)} · {c.profesional}
            {c.corrige_a && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                Corrige una anterior
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {c.adjuntos > 0 && (
            <span className="text-slate-500">
              {c.adjuntos} estudio{c.adjuntos > 1 ? 's' : ''}
            </span>
          )}
          <Boton variante="texto" className="text-sm" onClick={() => setAbierta(!abierta)}>
            {abierta ? 'Ocultar' : 'Ver'}
          </Boton>
        </div>
      </div>

      {(c.peso_kg !== null || c.temperatura !== null) && (
        <p className="mt-2 text-sm text-slate-600">
          {c.peso_kg !== null && `${Number(c.peso_kg)} kg`}
          {c.peso_kg !== null && c.temperatura !== null && ' · '}
          {c.temperatura !== null && `${Number(c.temperatura)} °C`}
        </p>
      )}

      {abierta && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <Bloque titulo="Anamnesis" texto={c.anamnesis} />
          <Bloque titulo="Examen físico" texto={c.examen_fisico} />
          <Bloque titulo="Diagnóstico" texto={c.diagnostico} />
          <Bloque titulo="Tratamiento" texto={c.tratamiento} />
          <Bloque titulo="Evolución" texto={c.evolucion} />

          <Estudios mascotaId={mascotaId} consultaId={c.id} puedoSubir={puedoCargar} />

          {puedoCargar && (
            <div className="border-t border-slate-100 pt-3">
              <Boton variante="texto" className="text-sm" onClick={onCorregir}>
                Corregir esta consulta
              </Boton>
              <p className="mt-1 text-xs text-slate-500">
                No se edita: se carga una nueva que la reemplaza, dejando el rastro.
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Bloque({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</h3>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{texto}</p>
    </div>
  );
}
