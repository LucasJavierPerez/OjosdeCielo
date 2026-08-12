import { formatearFechaCivil } from '@ojosdecielo/core';
import { Boton, Cargando, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import {
  useArchivarMascota,
  useDejarMascota,
  useDesarchivarMascota,
  useEliminarMascota,
  useMarcarFallecida,
} from '../features/mascotas/acciones.js';
import { useMascota } from '../features/mascotas/api.js';
import { useTutores } from '../features/mascotas/tutores.js';

type Accion = 'archivar' | 'fallecida' | 'dejar' | 'eliminar';

export function AjustesMascota() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const { data: mascota, isLoading } = useMascota(supabase, id);
  const { data: tutores } = useTutores(supabase, id);
  const [abierta, setAbierta] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const archivar = useArchivarMascota(supabase, id);
  const desarchivar = useDesarchivarMascota(supabase, id);
  const fallecida = useMarcarFallecida(supabase, id);
  const dejar = useDejarMascota(supabase, id);
  const eliminar = useEliminarMascota(supabase, id);

  const [fechaFallecimiento, setFechaFallecimiento] = useState(
    new Date().toISOString().slice(0, 10),
  );

  if (isLoading || !mascota) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Ajustes" volverA={`/mascotas/${id}`} />
        <Cargando />
      </main>
    );
  }

  const yo = tutores?.find((t) => t.soy_yo);
  const soyTitular = yo?.rol === 'titular';
  const hayOtrosTutores = (tutores?.length ?? 0) > 1;
  const nombre = mascota.nombre;

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo={`Ajustes de ${nombre}`} volverA={`/mascotas/${id}`} />

      {error && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos hacerlo" detalle={error} />
        </div>
      )}

      {mascota.fallecido_en && (
        <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          Registraste que {nombre} falleció el {formatearFechaCivil(mascota.fallecido_en)}. Su ficha
          y su historial se conservan.
        </p>
      )}

      {mascota.archivado_en && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            {nombre} está archivada, así que no aparece en tu lista ni genera recordatorios.
          </p>
          <Boton
            className="mt-3"
            cargando={desarchivar.isPending}
            onClick={() =>
              desarchivar.mutate(undefined, {
                onSuccess: () => void navigate(`/mascotas/${id}`),
                onError: () => setError('No pudimos recuperarla. Probá de nuevo.'),
              })
            }
          >
            Recuperar de archivados
          </Boton>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {/* Cada opción explica qué pasa ANTES de tocarla. Son acciones que el
            usuario hace una vez y con dudas. */}

        {!mascota.fallecido_en && (
          <Opcion
            titulo="Ya no está conmigo"
            detalle={`Archiva a ${nombre}. Deja de aparecer en tu lista y no vas a recibir más recordatorios, pero podés recuperarla cuando quieras.`}
            textoBoton="Archivar"
            abierta={abierta === 'archivar'}
            deshabilitada={Boolean(mascota.archivado_en) || !soyTitular}
            motivoDeshabilitada={
              mascota.archivado_en ? 'Ya está archivada' : 'Sólo el titular puede archivarla'
            }
            cargando={archivar.isPending}
            onAbrir={() => {
              setError(null);
              setAbierta('archivar');
            }}
            onCancelar={() => setAbierta(null)}
            onConfirmar={() =>
              archivar.mutate(undefined, {
                onSuccess: () => void navigate('/'),
                onError: () => setError('No pudimos archivarla. Probá de nuevo.'),
              })
            }
          />
        )}

        {!mascota.fallecido_en && (
          <Opcion
            titulo="Falleció"
            detalle={`Guardamos su ficha y todo su historial. ${nombre} va a seguir estando, pero dejamos de mandarte recordatorios.`}
            textoBoton="Registrar"
            abierta={abierta === 'fallecida'}
            cargando={fallecida.isPending}
            onAbrir={() => {
              setError(null);
              setAbierta('fallecida');
            }}
            onCancelar={() => setAbierta(null)}
            onConfirmar={() =>
              fallecida.mutate(fechaFallecimiento, {
                onSuccess: () => void navigate(`/mascotas/${id}`),
                onError: () => setError('No pudimos registrarlo. Probá de nuevo.'),
              })
            }
          >
            <label htmlFor="fecha-fallecimiento" className="block text-sm text-slate-600">
              Fecha
            </label>
            <Entrada
              id="fecha-fallecimiento"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={fechaFallecimiento}
              onChange={(e) => setFechaFallecimiento(e.target.value)}
            />
          </Opcion>
        )}

        {!soyTitular && (
          <Opcion
            titulo="Dejar de cuidarla"
            detalle={`Salís del cuidado de ${nombre}. La ficha sigue con las otras personas que la cuidan; vos dejás de verla.`}
            textoBoton="Salir"
            peligro
            abierta={abierta === 'dejar'}
            cargando={dejar.isPending}
            onAbrir={() => {
              setError(null);
              setAbierta('dejar');
            }}
            onCancelar={() => setAbierta(null)}
            onConfirmar={() =>
              dejar.mutate(undefined, {
                onSuccess: () => void navigate('/'),
                onError: () => setError('No pudimos hacerlo. Probá de nuevo.'),
              })
            }
          />
        )}

        {soyTitular && (
          <Opcion
            titulo="Eliminar para siempre"
            detalle={
              hayOtrosTutores
                ? `Hay otras personas que cuidan a ${nombre}, así que su ficha no se puede borrar. Podés archivarla.`
                : `Se borra la ficha de ${nombre} y todo lo que cargaste. No se puede deshacer. Si la clínica registró atención médica, su historia se conserva y sólo vas a poder archivarla.`
            }
            textoBoton="Eliminar"
            peligro
            deshabilitada={hayOtrosTutores}
            motivoDeshabilitada="Hay otras personas que la cuidan"
            abierta={abierta === 'eliminar'}
            cargando={eliminar.isPending}
            onAbrir={() => {
              setError(null);
              setAbierta('eliminar');
            }}
            onCancelar={() => setAbierta(null)}
            onConfirmar={() =>
              eliminar.mutate(undefined, {
                onSuccess: () => void navigate('/'),
                // El mensaje de la base explica el motivo real, así que se
                // muestra tal cual en vez de uno genérico.
                onError: (e) => setError(e.message),
              })
            }
          />
        )}
      </div>
    </main>
  );
}

function Opcion({
  titulo,
  detalle,
  textoBoton,
  peligro,
  deshabilitada,
  motivoDeshabilitada,
  abierta,
  cargando,
  onAbrir,
  onCancelar,
  onConfirmar,
  children,
}: {
  titulo: string;
  detalle: string;
  textoBoton: string;
  peligro?: boolean;
  deshabilitada?: boolean;
  motivoDeshabilitada?: string;
  abierta: boolean;
  cargando: boolean;
  onAbrir: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="font-medium">{titulo}</h2>
      <p className="mt-1 text-sm text-slate-600">{detalle}</p>

      {deshabilitada ? (
        <p className="mt-3 text-sm text-slate-400">{motivoDeshabilitada}</p>
      ) : abierta ? (
        <div className="mt-3 space-y-3">
          {children}
          <div className="flex gap-2">
            <Boton
              variante={peligro ? 'peligro' : 'primario'}
              cargando={cargando}
              onClick={onConfirmar}
              className="flex-1 text-sm"
            >
              Sí, {textoBoton.toLowerCase()}
            </Boton>
            <Boton variante="secundario" className="text-sm" onClick={onCancelar}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <Boton
          variante={peligro ? 'texto' : 'secundario'}
          className={peligro ? 'mt-3 text-red-700' : 'mt-3 text-sm'}
          onClick={onAbrir}
        >
          {textoBoton}
        </Boton>
      )}
    </section>
  );
}
