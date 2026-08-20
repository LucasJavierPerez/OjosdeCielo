import { ESPECIES, ETIQUETA_ESPECIE, ETIQUETA_SEXO, hoyCivil, SEXOS } from '@ojosdecielo/core';
import type { Especie, SexoMascota } from '@ojosdecielo/db';
import { Boton, Entrada, MensajeError, Seleccion } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { type DatosBasicosPaciente, useActualizarPaciente } from './api.js';

/** Corrección de la ficha básica del paciente: nombre, especie, castrado, etc. */
export function EditarPaciente({
  mascotaId,
  datos,
  onCerrar,
}: {
  mascotaId: string;
  datos: DatosBasicosPaciente;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const [d, setD] = useState<DatosBasicosPaciente>(datos);
  const [error, setError] = useState<string | null>(null);

  const guardar = useActualizarPaciente(supabase, mascotaId);

  return (
    <form
      className="mt-2 rounded-lg border border-slate-300 bg-white p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!d.nombre.trim()) {
          setError('El nombre no puede quedar vacío');
          return;
        }
        setError(null);
        guardar.mutate(d, { onSuccess: onCerrar, onError: (e2) => setError(e2.message) });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Campito id="p-nombre" etiqueta="Nombre">
          <Entrada
            id="p-nombre"
            autoFocus
            value={d.nombre}
            onChange={(e) => setD({ ...d, nombre: e.target.value })}
            className="mt-1"
          />
        </Campito>
        <Campito id="p-especie" etiqueta="Especie">
          <Seleccion
            id="p-especie"
            value={d.especie}
            onChange={(e) => setD({ ...d, especie: e.target.value as Especie })}
            className="mt-1"
          >
            {ESPECIES.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_ESPECIE[x]}
              </option>
            ))}
          </Seleccion>
        </Campito>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Campito id="p-raza" etiqueta="Raza">
          <Entrada
            id="p-raza"
            value={d.raza}
            onChange={(e) => setD({ ...d, raza: e.target.value })}
            className="mt-1"
          />
        </Campito>
        <Campito id="p-sexo" etiqueta="Sexo">
          <Seleccion
            id="p-sexo"
            value={d.sexo}
            onChange={(e) => setD({ ...d, sexo: e.target.value as SexoMascota })}
            className="mt-1"
          >
            {SEXOS.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_SEXO[x]}
              </option>
            ))}
          </Seleccion>
        </Campito>
        <Campito id="p-nacimiento" etiqueta="Nacimiento">
          <Entrada
            id="p-nacimiento"
            type="date"
            max={hoyCivil()}
            value={d.fecha_nacimiento}
            onChange={(e) => setD({ ...d, fecha_nacimiento: e.target.value })}
            className="mt-1"
          />
        </Campito>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Campito id="p-color" etiqueta="Color">
          <Entrada
            id="p-color"
            value={d.color}
            onChange={(e) => setD({ ...d, color: e.target.value })}
            className="mt-1"
          />
        </Campito>
        <Campito id="p-microchip" etiqueta="Microchip">
          <Entrada
            id="p-microchip"
            inputMode="numeric"
            value={d.microchip}
            onChange={(e) => setD({ ...d, microchip: e.target.value })}
            className="mt-1"
          />
        </Campito>
      </div>

      <fieldset className="mt-3">
        <legend className="block text-xs text-slate-500">Castrado/a</legend>
        <div className="mt-1 flex gap-4 text-sm">
          {(
            [
              ['Sí', true],
              ['No', false],
              ['No sabe', null],
            ] as const
          ).map(([etiqueta, valor]) => (
            <label key={etiqueta} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="p-castrado"
                checked={d.castrado === valor}
                onChange={() => setD({ ...d, castrado: valor })}
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Boton type="submit" className="text-sm" cargando={guardar.isPending}>
          Guardar
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function Campito({
  id,
  etiqueta,
  children,
}: {
  id: string;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-500">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
