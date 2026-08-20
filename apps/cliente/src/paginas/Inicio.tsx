import { calcularEdad, describirMascota } from '@ojosdecielo/core';
import type { ClienteSupabase } from '@ojosdecielo/db';
import { Boton, Cargando, Isotipo, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCantidadArchivadas, useMascotas } from '../features/mascotas/api.js';
import { FotoMascota } from '../features/mascotas/FotoMascota.js';

/** Sólo la primera: mostrarlas todas convertiría el inicio en una cartelera. */
function usePrimeraPromocionVigente(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: ['promocion-vigente'],
    queryFn: async (): Promise<{ titulo: string } | null> => {
      const { data, error } = await supabase
        .from('promocion')
        .select('titulo')
        .order('desde', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

/** Mensajes de la clínica que el tutor todavía no abrió, en cualquier conversación. */
function useMensajesSinLeer(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: ['mensajes-sin-leer'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('mensaje')
        .select('id', { count: 'exact', head: true })
        .eq('de_la_clinica', true)
        .is('leido_en', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function Inicio() {
  const { perfil, cerrarSesion, supabase } = useAuth();
  const [verArchivadas, setVerArchivadas] = useState(false);
  const { data: mascotas, isLoading, isError, refetch } = useMascotas(supabase, verArchivadas);
  const { data: cantidadArchivadas = 0 } = useCantidadArchivadas(supabase);
  const { data: promocion } = usePrimeraPromocionVigente(supabase);
  const { data: sinLeer = 0 } = useMensajesSinLeer(supabase);

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-8">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Isotipo className="h-11" />
          <div>
            <p className="text-sm text-slate-500">Hola</p>
            <h1 className="text-2xl font-semibold">{perfil?.nombre ?? ''}</h1>
          </div>
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
                        {m.archivado_en && ' · archivada'}
                        {m.fallecido_en && ' · falleció'}
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

            {cantidadArchivadas > 0 && (
              <Boton
                variante="texto"
                className="mt-3 w-full justify-center text-sm text-slate-500"
                onClick={() => setVerArchivadas(!verArchivadas)}
              >
                {verArchivadas
                  ? 'Ocultar archivadas'
                  : `Ver ${cantidadArchivadas} archivada${cantidadArchivadas > 1 ? 's' : ''}`}
              </Boton>
            )}
          </>
        )}
      </section>

      {promocion && (
        <Link
          to="/tienda"
          className="mt-6 block rounded-xl bg-acento-50 p-4 text-sm text-acento-700 hover:bg-acento-100"
        >
          <strong className="block">{promocion.titulo}</strong>
          Ver en la tienda
        </Link>
      )}

      <Link
        to="/turnos"
        className={
          promocion
            ? 'mt-2 flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-4 hover:bg-slate-50'
            : 'mt-8 flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-4 hover:bg-slate-50'
        }
      >
        <span className="font-medium">Turnos</span>
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </Link>

      <Link
        to="/mensajes"
        className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-4 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 font-medium">
          Mensajes
          {sinLeer > 0 && (
            <span className="inline-flex items-center gap-1 text-acento-700">
              <IconoCampana className="size-4" />
              <span className="text-xs font-semibold tabular-nums">{sinLeer}</span>
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </Link>

      <Link
        to="/tienda"
        className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-4 hover:bg-slate-50"
      >
        <span className="font-medium">Tienda</span>
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </Link>

      <Link
        to="/recordatorios"
        className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-4 hover:bg-slate-50"
      >
        <span className="font-medium">Recordatorios</span>
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </Link>

      <Link
        to="/instalar"
        className="mt-3 block rounded-xl bg-marca-50 p-4 text-sm text-marca-700 hover:bg-marca-100"
      >
        <strong className="block">Instalá la app en tu celular</strong>
        Para recibir recordatorios de vacunas y desparasitaciones.
      </Link>
    </main>
  );
}

function IconoCampana({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.5V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v4.5L3 18v1h18v-1l-2-2.5Z" />
    </svg>
  );
}
