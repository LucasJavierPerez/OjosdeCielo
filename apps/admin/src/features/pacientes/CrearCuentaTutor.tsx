import { Boton, Campo, Entrada, EntradaClave, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useCrearCuentaTutor } from './api.js';

interface Prefill {
  nombre: string;
  apellido: string;
  email: string;
}

/**
 * Alta de la cuenta de un tutor desde el panel: email + contraseña que le
 * pasás a la persona.
 *
 * El servidor sólo la deja crear/vincular si esa persona ya figura como
 * contacto de este paciente (por eso el email arranca precargado y conviene no
 * cambiarlo). El teléfono y el DNI viven en el contacto; se corrigen desde
 * «Corregir datos», no acá.
 */
export function CrearCuentaTutor({
  mascotaId,
  prefill,
  onCerrar,
}: {
  mascotaId: string;
  prefill: Prefill;
  onCerrar: () => void;
}) {
  const { supabase } = useAuth();
  const crear = useCrearCuentaTutor(supabase, mascotaId);
  const [nombre, setNombre] = useState(prefill.nombre);
  const [apellido, setApellido] = useState(prefill.apellido);
  const [email, setEmail] = useState(prefill.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim() || !apellido.trim()) {
          setError('Poné nombre y apellido');
          return;
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
          setError('Poné un email válido');
          return;
        }
        if (password.length < 8) {
          setError('La contraseña necesita al menos 8 caracteres');
          return;
        }
        setError(null);
        crear.mutate(
          {
            mascota_id: mascotaId,
            email: email.trim(),
            password,
            nombre: nombre.trim(),
            apellido: apellido.trim(),
          },
          { onSuccess: onCerrar, onError: (err) => setError(err.message) },
        );
      }}
    >
      <p className="text-xs text-slate-500">
        Le creás la cuenta y le pasás el email y la contraseña. Después la puede cambiar desde
        «¿Olvidaste tu contraseña?». El email tiene que ser el mismo que cargaste en el contacto.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Campo id="ct-nombre" etiqueta="Nombre">
          <Entrada
            id="ct-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1"
          />
        </Campo>
        <Campo id="ct-apellido" etiqueta="Apellido">
          <Entrada
            id="ct-apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className="mt-1"
          />
        </Campo>
      </div>

      <Campo id="ct-email" etiqueta="Email">
        <Entrada
          id="ct-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
        />
      </Campo>

      <Campo id="ct-pass" etiqueta="Contraseña" ayuda="Al menos 8 caracteres">
        <EntradaClave
          id="ct-pass"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Campo>

      {error && <MensajeError detalle={error} />}

      <div className="flex gap-2">
        <Boton type="submit" className="text-sm" cargando={crear.isPending}>
          Crear cuenta
        </Boton>
        <Boton variante="secundario" className="text-sm" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
