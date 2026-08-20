import { Boton, Campo, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useBuscarPacientes } from '../pacientes/api.js';
import { useCrearTurnoPersonal, useEspecialidades, useProfesionales } from './api.js';

/**
 * El personal carga un turno directo, sin pasar por "a confirmar": una
 * urgencia, un encaje entre dos turnos, alguien que llama por teléfono. La
 * fecha y hora son libres — `solicitar_turno()` no le exige al personal
 * elegir un slot de la grilla, a diferencia del tutor desde la app.
 */
export function NuevoTurno({ onListo }: { onListo: () => void }) {
  const { supabase } = useAuth();
  const [busqueda, setBusqueda] = useState('');
  const [paciente, setPaciente] = useState<{ id: string; nombre: string } | null>(null);
  const [profesionalId, setProfesionalId] = useState('');
  const [especialidadId, setEspecialidadId] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: profesionales } = useProfesionales(supabase);
  const { data: especialidades } = useEspecialidades(supabase);
  const { data: resultados } = useBuscarPacientes(supabase, busqueda);
  const crear = useCrearTurnoPersonal(supabase);

  const mostrarResultados = busqueda.length > 0 && !paciente;

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!paciente) {
          setError('Elegí el paciente');
          return;
        }
        if (!profesionalId || !especialidadId) {
          setError('Elegí profesional y especialidad');
          return;
        }
        if (!fechaHora) {
          setError('Elegí fecha y hora');
          return;
        }
        const inicio = new Date(fechaHora).toISOString();
        setError(null);
        crear.mutate(
          {
            mascotaId: paciente.id,
            profesionalId,
            especialidadId,
            inicio,
            ...(motivo.trim() && { motivo: motivo.trim() }),
          },
          { onSuccess: onListo, onError: (e2) => setError(e2.message) },
        );
      }}
    >
      <h2 className="font-medium">Nuevo turno</h2>

      <div className="mt-3">
        <Campo id="nt-paciente" etiqueta="Paciente">
          {paciente ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
              <span className="text-sm">{paciente.nombre}</span>
              <Boton
                variante="texto"
                className="text-xs"
                onClick={() => {
                  setPaciente(null);
                  setBusqueda('');
                }}
              >
                Cambiar
              </Boton>
            </div>
          ) : (
            <Entrada
              id="nt-paciente"
              autoFocus
              type="search"
              placeholder="Buscar por mascota, tutor, teléfono o DNI"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          )}
        </Campo>

        {mostrarResultados && (
          <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
            {(resultados ?? []).length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>
            )}
            {(resultados ?? []).map((p) => (
              <li key={p.mascota_id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setPaciente({ id: p.mascota_id, nombre: p.nombre });
                    setBusqueda('');
                  }}
                >
                  <span className="font-medium">{p.nombre}</span>
                  <span className="ml-2 text-slate-500">
                    {p.titular_nombre} {p.titular_apellido}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="nt-profesional" etiqueta="Profesional">
          <Seleccion
            id="nt-profesional"
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
          >
            <option value="">Elegir…</option>
            {(profesionales ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo id="nt-especialidad" etiqueta="Especialidad">
          <Seleccion
            id="nt-especialidad"
            value={especialidadId}
            onChange={(e) => setEspecialidadId(e.target.value)}
          >
            <option value="">Elegir…</option>
            {(especialidades ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      <div className="mt-3">
        <Campo id="nt-fecha" etiqueta="Fecha y hora">
          <Entrada
            id="nt-fecha"
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
          />
        </Campo>
      </div>

      <div className="mt-3">
        <Campo id="nt-motivo" etiqueta="Motivo" ayuda="Opcional">
          <Entrada id="nt-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" className="text-sm" cargando={crear.isPending}>
          Guardar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
