import { formatearFechaLarga, formatearHora } from '@ojosdecielo/core';
import { Campo, Cargando, Entrada, MensajeError, Seleccion, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useMascotas } from '../features/mascotas/api.js';
import {
  useEspecialidades,
  useProfesionales,
  useSlots,
  useSolicitarTurno,
} from '../features/turnos/api.js';

/** Los próximos 14 días, para elegir sin abrir un calendario completo. */
function proximosDias(cantidad = 14): string[] {
  const dias: string[] = [];
  const d = new Date();
  for (let i = 1; i <= cantidad; i++) {
    d.setDate(d.getDate() + (i === 1 ? 1 : 1));
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

export function NuevoTurno() {
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const { data: mascotas, isError: errorMascotas } = useMascotas(supabase);
  const { data: especialidades, isError: errorEsp } = useEspecialidades(supabase);
  const { data: profesionales, isError: errorProf } = useProfesionales(supabase);

  const [mascotaElegida, setMascotaId] = useState(params.get('mascota') ?? '');
  const [especialidadElegida, setEspecialidadId] = useState('');
  const [profesionalElegido, setProfesionalId] = useState('');
  const [fecha, setFecha] = useState('');

  // Valores derivados en vez de setState durante el render: si hay una sola
  // mascota o un solo profesional, no tiene sentido hacer elegir. Llamar a
  // setState acá provocaría un render extra en cada pasada.
  const mascotaId = mascotaElegida || (mascotas?.length === 1 ? (mascotas[0]?.id ?? '') : '');
  const profesionalId =
    profesionalElegido || (profesionales?.length === 1 ? (profesionales[0]?.id ?? '') : '');
  // Sin default: el primero alfabéticamente sería "Cirugía", que como opción
  // preseleccionada para una consulta de rutina no tiene sentido.
  const especialidadId = especialidadElegida;
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const solicitar = useSolicitarTurno(supabase);
  const { data: slots, isLoading: cargandoSlots } = useSlots(
    supabase,
    profesionalId,
    fecha,
    especialidadId,
  );

  // Sin esto, un fallo de cualquiera de las tres consultas dejaba la pantalla
  // en blanco sin explicación.
  if (errorMascotas || errorEsp || errorProf) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Pedir turno" volverA="/turnos" />
        <div className="mt-6">
          <MensajeError
            titulo="No pudimos cargar la agenda"
            detalle="Revisá tu conexión y volvé a intentar."
          />
        </div>
      </main>
    );
  }

  if (!mascotas || !especialidades || !profesionales) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Pedir turno" volverA="/turnos" />
        <Cargando />
      </main>
    );
  }

  if (mascotas.length === 0) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Pedir turno" volverA="/" />
        <div className="mt-6">
          <Vacio
            titulo="Primero agregá una mascota"
            descripcion="Los turnos se sacan para una mascota en particular."
          />
        </div>
      </main>
    );
  }

  if (profesionales.length === 0) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Pedir turno" volverA="/turnos" />
        <div className="mt-6">
          <Vacio
            titulo="No hay agenda disponible"
            descripcion="La clínica todavía no publicó sus horarios. Llamalos para coordinar."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Pedir turno" volverA="/turnos" />

      <div className="mt-6 space-y-4">
        {mascotas.length > 1 && (
          <Campo id="mascota" etiqueta="¿Para quién?">
            <Seleccion
              id="mascota"
              value={mascotaId}
              onChange={(e) => setMascotaId(e.target.value)}
            >
              <option value="">Elegí una mascota</option>
              {mascotas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>
        )}

        <Campo id="especialidad" etiqueta="Motivo de la visita">
          <Seleccion
            id="especialidad"
            value={especialidadId}
            onChange={(e) => {
              setEspecialidadId(e.target.value);
              setFecha('');
            }}
          >
            <option value="">Elegí el motivo</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} · {e.duracion_min} min
              </option>
            ))}
          </Seleccion>
        </Campo>

        {profesionales.length > 1 && (
          <Campo id="profesional" etiqueta="Profesional">
            <Seleccion
              id="profesional"
              value={profesionalId}
              onChange={(e) => {
                setProfesionalId(e.target.value);
                setFecha('');
              }}
            >
              <option value="">Elegí un profesional</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellido}
                </option>
              ))}
            </Seleccion>
          </Campo>
        )}

        {especialidadId && (
          <div>
            <span className="block text-sm font-medium text-slate-700">Día</span>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
              {proximosDias().map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFecha(d)}
                  className={
                    fecha === d
                      ? 'shrink-0 rounded-lg bg-marca-600 px-3 py-2 text-sm font-medium text-white'
                      : 'shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700'
                  }
                >
                  {formatearFechaLarga(`${d}T12:00:00Z`).replace(' de ', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {fecha && especialidadId && (
          <div>
            <span className="block text-sm font-medium text-slate-700">Horario</span>

            {cargandoSlots && <Cargando etiqueta="Buscando horarios" />}

            {slots && slots.length === 0 && (
              <p className="mt-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
                No hay horarios libres ese día. Probá con otro.
              </p>
            )}

            {slots && slots.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.inicio}
                    type="button"
                    onClick={() => {
                      setError(null);
                      if (!mascotaId) {
                        setError('Elegí para qué mascota es el turno');
                        return;
                      }
                      solicitar.mutate(
                        {
                          mascotaId,
                          profesionalId,
                          especialidadId,
                          inicio: s.inicio,
                          ...(motivo && { motivo }),
                        },
                        {
                          onSuccess: () => void navigate('/turnos'),
                          onError: (e) => setError(e.message),
                        },
                      );
                    }}
                    disabled={solicitar.isPending}
                    className="min-h-11 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 hover:border-marca-600 hover:bg-marca-50 disabled:opacity-50"
                  >
                    {formatearHora(s.inicio)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Campo
          id="motivo"
          etiqueta="¿Algo que quieras contarles?"
          ayuda="Opcional. Ej: hace dos días que no come bien"
        >
          <Entrada id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>

        {error && <MensajeError detalle={error} />}

        {solicitar.isPending && <p className="text-center text-sm text-slate-500">Reservando…</p>}
      </div>
    </main>
  );
}
