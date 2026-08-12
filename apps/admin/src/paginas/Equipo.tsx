import type { Rol } from '@ojosdecielo/db';
import { Boton, Campo, Cargando, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type Integrante,
  useCambiarEstado,
  useCambiarRol,
  useEquipo,
  useInvitarPersonal,
} from '../features/equipo/api.js';

const ROLES_PERSONAL: { valor: Rol; etiqueta: string; detalle: string }[] = [
  { valor: 'recepcionista', etiqueta: 'Recepcionista', detalle: 'Agenda y pacientes' },
  {
    valor: 'veterinario',
    etiqueta: 'Veterinario',
    detalle: 'Historia clínica y verificación de datos',
  },
  { valor: 'administrador', etiqueta: 'Administrador', detalle: 'Todo, más gestión del equipo' },
];

const ETIQUETA_ROL: Record<string, string> = {
  recepcionista: 'Recepcionista',
  veterinario: 'Veterinario',
  administrador: 'Administrador',
  cliente: 'Cliente',
};

export function Equipo() {
  const { supabase, perfil } = useAuth();
  const { data: equipo, isLoading, isError, refetch } = useEquipo(supabase);
  const [invitando, setInvitando] = useState(false);

  const soyAdmin = perfil?.rol === 'administrador';

  return (
    <Layout>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        {soyAdmin && !invitando && <Boton onClick={() => setInvitando(true)}>Invitar</Boton>}
      </div>

      <p className="mt-1 text-sm text-slate-600">Quiénes acceden al panel y con qué permisos.</p>

      {!soyAdmin && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Sólo un administrador puede invitar personal o cambiar roles.
        </p>
      )}

      {invitando && <FormularioInvitacion onCerrar={() => setInvitando(false)} />}

      {isLoading && <Cargando etiqueta="Cargando el equipo" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar el equipo" onReintentar={() => void refetch()} />
        </div>
      )}

      {equipo && (
        <ul className="mt-6 space-y-2">
          {equipo.map((i) => (
            <FilaIntegrante key={i.id} integrante={i} puedoGestionar={soyAdmin} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function FilaIntegrante({
  integrante: i,
  puedoGestionar,
}: {
  integrante: Integrante;
  puedoGestionar: boolean;
}) {
  const { supabase } = useAuth();
  const cambiarRol = useCambiarRol(supabase);
  const cambiarEstado = useCambiarEstado(supabase);
  const [error, setError] = useState<string | null>(null);

  // Nadie se cambia el rol ni se da de baja a sí mismo: la base lo rechaza y
  // acá directamente no se ofrece.
  const editable = puedoGestionar && !i.soy_yo;

  return (
    <li
      className={
        i.activo
          ? 'rounded-xl border border-slate-200 bg-white p-4'
          : 'rounded-xl border border-slate-200 bg-slate-50 p-4'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={i.activo ? 'font-medium' : 'font-medium text-slate-400'}>
            {i.nombre} {i.apellido}
            {i.soy_yo && <span className="ml-2 text-sm font-normal text-slate-500">(vos)</span>}
            {!i.activo && (
              <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-normal text-slate-600">
                Dado de baja
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">{i.email}</p>
        </div>

        <div className="flex items-center gap-3">
          {editable ? (
            <>
              <label htmlFor={`rol-${i.id}`} className="sr-only">
                Rol de {i.nombre}
              </label>
              <Seleccion
                id={`rol-${i.id}`}
                value={i.rol}
                disabled={cambiarRol.isPending || !i.activo}
                className="mt-0 w-auto text-sm"
                onChange={(e) => {
                  setError(null);
                  cambiarRol.mutate(
                    { perfilId: i.id, rol: e.target.value as Rol },
                    { onError: (err) => setError(err.message) },
                  );
                }}
              >
                {ROLES_PERSONAL.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </Seleccion>

              <Boton
                variante="texto"
                className={i.activo ? 'text-sm text-red-700' : 'text-sm'}
                cargando={cambiarEstado.isPending}
                onClick={() => {
                  setError(null);
                  cambiarEstado.mutate(
                    { perfilId: i.id, activo: !i.activo },
                    { onError: (err) => setError(err.message) },
                  );
                }}
              >
                {i.activo ? 'Dar de baja' : 'Reactivar'}
              </Boton>
            </>
          ) : (
            <span className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600">
              {ETIQUETA_ROL[i.rol] ?? i.rol}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}
    </li>
  );
}

function FormularioInvitacion({ onCerrar }: { onCerrar: () => void }) {
  const { supabase } = useAuth();
  const invitar = useInvitarPersonal(supabase);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [datos, setDatos] = useState({
    nombre: '',
    apellido: '',
    email: '',
    rol: 'veterinario' as Rol,
  });

  if (listo) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 p-4">
        <p className="font-medium text-emerald-900">{listo}</p>
        <Boton variante="texto" className="mt-2" onClick={onCerrar}>
          Cerrar
        </Boton>
      </div>
    );
  }

  return (
    <form
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        invitar.mutate(datos, {
          onSuccess: (resultado) =>
            setListo(
              resultado === 'rol_actualizado'
                ? `${datos.email} ya tenía cuenta, así que le asignamos el rol.`
                : `Le mandamos la invitación a ${datos.email}.`,
            ),
          onError: (err) => setError(err.message),
        });
      }}
    >
      <h2 className="font-medium">Invitar a alguien al equipo</h2>
      <p className="mt-1 text-sm text-slate-600">
        Le llega un email para elegir su contraseña. Si ya tiene cuenta como cliente, le asignamos
        el rol sin crear otra.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Campo id="inv-nombre" etiqueta="Nombre">
          <Entrada
            id="inv-nombre"
            required
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
          />
        </Campo>
        <Campo id="inv-apellido" etiqueta="Apellido">
          <Entrada
            id="inv-apellido"
            required
            value={datos.apellido}
            onChange={(e) => setDatos({ ...datos, apellido: e.target.value })}
          />
        </Campo>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id="inv-email" etiqueta="Email">
          <Entrada
            id="inv-email"
            type="email"
            required
            value={datos.email}
            onChange={(e) => setDatos({ ...datos, email: e.target.value })}
          />
        </Campo>
        <Campo
          id="inv-rol"
          etiqueta="Rol"
          ayuda={ROLES_PERSONAL.find((r) => r.valor === datos.rol)?.detalle}
        >
          <Seleccion
            id="inv-rol"
            value={datos.rol}
            onChange={(e) => setDatos({ ...datos, rol: e.target.value as Rol })}
          >
            {ROLES_PERSONAL.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Boton type="submit" cargando={invitar.isPending}>
          Enviar invitación
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
