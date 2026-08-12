import { calcularEdad, describirMascota } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { Link } from 'react-router';
import { useMascotas } from '../features/mascotas/api.js';
import { FotoMascota } from '../features/mascotas/FotoMascota.js';

export function Inicio() {
  const { perfil, cerrarSesion, supabase } = useAuth();
  const { data: mascotas, isLoading, isError, refetch } = useMascotas(supabase);

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">Hola</p>
          <h1 className="text-2xl font-semibold">{perfil?.nombre ?? ''}</h1>
        </div>
        <Boton variante="texto" onClick={() => void cerrarSesion()} className="text-slate-500">
          Salir
        </Boton>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-500">Mis mascotas</h2>

        {isLoading && <Cargando etiqueta="Cargando tus mascotas" />}

        {isError && (
          <div className="mt-3">
            <MensajeError
              titulo="No pudimos cargar tus mascotas"
              detalle="Revisá tu conexión."
              onReintentar={() => void refetch()}
            />
          </div>
        )}

        {mascotas && mascotas.length === 0 && (
          <div className="mt-3">
            <Vacio
              titulo="Todavía no cargaste ninguna mascota"
              descripcion="Sumá a tu compañero para llevar su salud al día y recibir recordatorios."
              accion={
                <Link
                  to="/mascotas/nueva"
                  className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 font-medium text-white hover:bg-marca-700"
                >
                  Agregar mascota
                </Link>
              }
            />
          </div>
        )}

        {mascotas && mascotas.length > 0 && (
          <>
            <ul className="mt-3 space-y-2">
              {mascotas.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/mascotas/${m.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <FotoMascota fotoUrl={m.foto_url} nombre={m.nombre} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.nombre}</p>
                      <p className="truncate text-sm text-slate-500">
                        {describirMascota(m)}
                        {m.fecha_nacimiento && ` · ${calcularEdad(m.fecha_nacimiento)}`}
                      </p>
                    </div>
                    <span aria-hidden="true" className="text-slate-400">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              to="/mascotas/nueva"
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-300 font-medium text-marca-600 hover:bg-slate-50"
            >
              Agregar otra mascota
            </Link>
          </>
        )}
      </section>

      <Link
        to="/instalar"
        className="mt-8 block rounded-xl bg-marca-50 p-4 text-sm text-marca-700 hover:bg-marca-100"
      >
        <strong className="block">Instalá la app en tu celular</strong>
        Para recibir recordatorios de vacunas y desparasitaciones.
      </Link>
    </main>
  );
}
