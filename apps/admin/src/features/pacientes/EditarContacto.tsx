import { Boton, Entrada, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { clavesClinica } from '../clinica/api.js';
import { claves } from './api.js';

interface Datos {
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  dni: string;
  direccion: string;
}

/**
 * Corrección de los datos de contacto del tutor.
 *
 * Dos caminos según si la persona tiene cuenta, y la diferencia importa:
 *
 * - Sin cuenta: la fila vive en `contacto_tutor` y se edita entera, email
 *   incluido. Ese email es además el que la vincula si algún día se registra.
 * - Con cuenta: se edita `perfil` por RPC y **el email no se toca**. En
 *   `perfil` es una copia del de `auth.users`, que es con el que la persona
 *   entra; cambiarlo acá no cambiaría su login, sólo mostraría un correo con
 *   el que nadie puede ingresar. Ese cambio lo hace el tutor desde su cuenta.
 */
export function EditarContacto({
  mascotaId,
  contacto,
  onCerrar,
}: {
  mascotaId: string;
  contacto:
    | { tipo: 'registrado'; perfilId: string; datos: Datos }
    | { tipo: 'sin_cuenta'; contactoId: string; datos: Datos };
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [d, setD] = useState<Datos>(contacto.datos);
  const [error, setError] = useState<string | null>(null);

  const registrado = contacto.tipo === 'registrado';

  const guardar = useMutation({
    mutationFn: async (): Promise<void> => {
      if (contacto.tipo === 'registrado') {
        const { error: err } = await supabase.rpc('actualizar_datos_tutor', {
          p_perfil_id: contacto.perfilId,
          p_nombre: d.nombre.trim(),
          p_apellido: d.apellido.trim(),
          ...(d.telefono.trim() && { p_telefono: d.telefono.trim() }),
          ...(d.dni.trim() && { p_dni: d.dni.trim() }),
        });
        if (err) throw new Error(err.message);
        return;
      }

      const { error: err } = await supabase
        .from('contacto_tutor')
        .update({
          nombre: d.nombre.trim(),
          apellido: d.apellido.trim(),
          telefono: d.telefono.trim() || null,
          email: d.email.trim() || null,
          dni: d.dni.trim() || null,
          direccion: d.direccion.trim() || null,
        })
        .eq('id', contacto.contactoId);
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.tutores(mascotaId) });
      void qc.invalidateQueries({ queryKey: clavesClinica.contacto(mascotaId) });
      onCerrar();
    },
  });

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
        guardar.mutate(undefined, { onError: (e2) => setError(e2.message) });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Campito id="c-nombre" etiqueta="Nombre">
          <Entrada
            id="c-nombre"
            autoFocus
            value={d.nombre}
            onChange={(e) => setD({ ...d, nombre: e.target.value })}
            className="mt-1"
          />
        </Campito>
        <Campito id="c-apellido" etiqueta="Apellido">
          <Entrada
            id="c-apellido"
            value={d.apellido}
            onChange={(e) => setD({ ...d, apellido: e.target.value })}
            className="mt-1"
          />
        </Campito>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Campito id="c-telefono" etiqueta="Teléfono">
          <Entrada
            id="c-telefono"
            type="tel"
            value={d.telefono}
            onChange={(e) => setD({ ...d, telefono: e.target.value })}
            className="mt-1"
          />
        </Campito>
        <Campito id="c-dni" etiqueta="DNI">
          <Entrada
            id="c-dni"
            value={d.dni}
            onChange={(e) => setD({ ...d, dni: e.target.value })}
            className="mt-1"
          />
        </Campito>
      </div>

      {!registrado && (
        <div className="mt-2">
          <Campito id="c-direccion" etiqueta="Dirección">
            <Entrada
              id="c-direccion"
              value={d.direccion}
              onChange={(e) => setD({ ...d, direccion: e.target.value })}
              className="mt-1"
              placeholder="Se usa para las visitas a domicilio"
            />
          </Campito>
        </div>
      )}

      <div className="mt-2">
        <Campito id="c-email" etiqueta="Email">
          <Entrada
            id="c-email"
            type="email"
            value={d.email}
            disabled={registrado}
            onChange={(e) => setD({ ...d, email: e.target.value })}
            className="mt-1 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </Campito>
        {registrado && (
          <p className="mt-1 text-xs text-slate-500">
            Es el email con el que ingresa a la app. Sólo lo puede cambiar desde su cuenta.
          </p>
        )}
      </div>

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
