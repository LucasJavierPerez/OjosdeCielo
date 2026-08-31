import { calcularEdad, ETIQUETA_ESPECIE } from '@ojosdecielo/core';
import { Cargando, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import { useBuscarPacientes } from '../features/pacientes/api.js';

export function Pacientes() {
  const { supabase } = useAuth();
  const [texto, setTexto] = useState('');
  const {
    data: pacientes,
    isLoading,
    isError,
    refetch,
    isPlaceholderData,
  } = useBuscarPacientes(supabase, texto);

  return (
    <Layout>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Pacientes</h1>
          {pacientes && (
            <span className="text-sm text-slate-500">
              {pacientes.length}
              {pacientes.length === 50 && '+'} resultado{pacientes.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Link
          to="/pacientes/nuevo"
          className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 font-medium text-white hover:bg-marca-700"
        >
          Nuevo paciente
        </Link>
      </div>

      <div className="mt-4">
        <label htmlFor="buscar" className="sr-only">
          Buscar paciente
        </label>
        <Entrada
          id="buscar"
          type="search"
          placeholder="Buscar por mascota, tutor, teléfono, DNI o microchip"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
          className="mt-0"
        />
      </div>

      {isLoading && <Cargando etiqueta="Buscando pacientes" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos buscar" onReintentar={() => void refetch()} />
        </div>
      )}

      {pacientes && pacientes.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo={texto ? 'Sin resultados' : 'Todavía no hay pacientes'}
            descripcion={
              texto
                ? 'Probá con el nombre del tutor o el teléfono.'
                : 'Los pacientes aparecen acá cuando un tutor registra su mascota en la app.'
            }
          />
        </div>
      )}

      {pacientes && pacientes.length > 0 && (
        <div
          className={isPlaceholderData ? 'mt-4 overflow-x-auto opacity-60' : 'mt-4 overflow-x-auto'}
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th scope="col" className="pb-2 font-medium">
                  Mascota
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Tutor responsable
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Contacto
                </th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr key={p.mascota_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5">
                    <Link
                      to={`/pacientes/${p.mascota_id}`}
                      className="font-medium text-slate-900 hover:text-marca-700"
                    >
                      {p.nombre}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {ETIQUETA_ESPECIE[p.especie]}
                      {p.raza && ` · ${p.raza}`}
                      {p.fecha_nacimiento && ` · ${calcularEdad(p.fecha_nacimiento)}`}
                      {p.fallecido_en && ' · fallecido'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {p.titular_nombre} {p.titular_apellido}
                    {p.cantidad_tutores === 0 && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                        sin cuenta
                      </span>
                    )}
                    {p.cantidad_tutores > 1 && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        +{p.cantidad_tutores - 1} tutor{p.cantidad_tutores > 2 ? 'es' : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-600">
                    {p.titular_telefono ?? '—'}
                    <span className="block text-xs text-slate-400">{p.titular_email ?? ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
