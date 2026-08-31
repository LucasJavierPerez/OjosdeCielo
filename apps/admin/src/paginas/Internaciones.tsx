import { diasInternado, ETIQUETA_ESPECIE, formatearFecha } from '@ojosdecielo/core';
import type { Especie } from '@ojosdecielo/db';
import { Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import {
  type InternacionActiva,
  type InternacionConSaldo,
  useInternacionesActivas,
  useInternacionesConSaldo,
} from '../features/internaciones/api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function Internaciones() {
  const { supabase } = useAuth();
  const [pestania, setPestania] = useState<'activas' | 'saldo'>('activas');
  const activas = useInternacionesActivas(supabase);
  const conSaldo = useInternacionesConSaldo(supabase);

  return (
    <Layout>
      <h1 className="text-xl font-semibold">Internación</h1>

      <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
        <Tab activa={pestania === 'activas'} onClick={() => setPestania('activas')}>
          Sala {activas.data && `(${activas.data.length})`}
        </Tab>
        <Tab activa={pestania === 'saldo'} onClick={() => setPestania('saldo')}>
          Pendientes de cobro {conSaldo.data && `(${conSaldo.data.length})`}
        </Tab>
      </div>

      {pestania === 'activas' && (
        <Seccion
          query={activas}
          vacio={{
            titulo: 'No hay pacientes internados',
            descripcion: 'Para internar un paciente, entrá a su ficha y usá el botón «Internar».',
          }}
        >
          {(fila) => <TarjetaActiva key={fila.id} i={fila} />}
        </Seccion>
      )}

      {pestania === 'saldo' && (
        <Seccion
          query={conSaldo}
          vacio={{
            titulo: 'Sin saldos pendientes',
            descripcion: 'Las internaciones cerradas con saldo impago aparecen acá.',
          }}
        >
          {(fila) => <TarjetaSaldo key={fila.id} i={fila} />}
        </Seccion>
      )}
    </Layout>
  );
}

function Tab({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 pb-2 font-medium',
        activa
          ? 'border-marca-600 text-marca-700'
          : 'border-transparent text-slate-500 hover:text-slate-800',
      )}
    >
      {children}
    </button>
  );
}

function Seccion<T extends { id: string }>({
  query,
  vacio,
  children,
}: {
  query: {
    data: T[] | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  };
  vacio: { titulo: string; descripcion: string };
  children: (fila: T) => ReactNode;
}) {
  if (query.isLoading) return <Cargando etiqueta="Cargando internaciones" />;
  if (query.isError) {
    return (
      <div className="mt-4">
        <MensajeError titulo="No pudimos cargar" onReintentar={() => query.refetch()} />
      </div>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <div className="mt-6">
        <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} />
      </div>
    );
  }
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{query.data.map(children)}</div>;
}

function TarjetaActiva({ i }: { i: InternacionActiva }) {
  const dias = diasInternado(i.ingreso_en);
  return (
    <Link
      to={`/internaciones/${i.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-marca-300"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-slate-900">{i.mascota}</span>
        <span className="text-xs text-slate-500">
          {ETIQUETA_ESPECIE[i.especie as Especie] ?? i.especie}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{i.motivo}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          Día {dias} · desde {formatearFecha(i.ingreso_en)}
        </span>
        {i.ubicacion && <span>· {i.ubicacion}</span>}
        <span>· {i.profesional}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-slate-500">Total {pesos(Number(i.total_cargos))}</span>
        {Number(i.saldo) > 0 ? (
          <span className="font-medium text-amber-700">Saldo {pesos(Number(i.saldo))}</span>
        ) : (
          <span className="text-emerald-700">Al día</span>
        )}
      </div>
    </Link>
  );
}

function TarjetaSaldo({ i }: { i: InternacionConSaldo }) {
  return (
    <Link
      to={`/internaciones/${i.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-marca-300"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-slate-900">{i.mascota}</span>
        <span className="text-xs text-slate-500">
          {ETIQUETA_ESPECIE[i.especie as Especie] ?? i.especie}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Alta {formatearFecha(i.egreso_en)}</span>
        <span>· {i.profesional}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Cobrado {pesos(Number(i.total_pagado))} de {pesos(Number(i.total_cargos))}
        </span>
        <span className="font-medium text-amber-700">Saldo {pesos(Number(i.saldo))}</span>
      </div>
    </Link>
  );
}
