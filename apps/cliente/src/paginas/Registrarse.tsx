import { EntradaClave, Isotipo } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link } from 'react-router';

export function Registrarse() {
  const { supabase } = useAuth();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [acepta, setAcepta] = useState(false);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }

    if (!acepta) {
      setError('Para crear la cuenta hace falta aceptar la política de privacidad.');
      return;
    }

    setEnviando(true);

    // El rol nunca viaja acá: lo fija el trigger en 'cliente'. Si se tomara de
    // metadata, cualquiera podría registrarse como veterinario.
    const { error: errorAuth } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre, apellido } },
    });

    if (errorAuth) {
      setError('No pudimos crear la cuenta. Probá de nuevo en un momento.');
      setEnviando(false);
      return;
    }

    // El consentimiento se registra recién ahora porque necesita la sesión, y
    // la versión la elige el servidor: si la mandara el navegador se podría
    // dejar constancia de haber aceptado un texto que nunca se mostró.
    //
    // Si la confirmación por email está activada todavía no hay sesión y esto
    // no hace nada; en ese caso lo pide la app al primer ingreso, que es para
    // lo que existe politica_pendiente().
    await supabase.rpc('aceptar_politica');

    setListo(true);
  }

  if (listo) {
    return (
      <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold">Revisá tu email</h1>
        <p className="mt-2 text-slate-600">
          Te mandamos un mensaje a <strong>{email}</strong> para confirmar tu cuenta. Si no lo ves,
          fijate en spam.
        </p>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Isotipo className="mx-auto h-16" />
      <h1 className="mt-4 text-2xl font-semibold">Crear cuenta</h1>

      <form onSubmit={alEnviar} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              id="nombre"
              autoComplete="given-name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
            />
          </div>
          <div>
            <label htmlFor="apellido" className="block text-sm font-medium text-slate-700">
              Apellido
            </label>
            <input
              id="apellido"
              autoComplete="family-name"
              required
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <EntradaClave
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="ayuda-password"
          />
          <p id="ayuda-password" className="mt-1 text-xs text-slate-500">
            Al menos 8 caracteres
          </p>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-slate-300"
          />
          <span>
            Leí y acepto la{' '}
            <Link to="/politica" className="font-medium text-marca-600 underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || !acepta}
          className="w-full rounded-lg bg-marca-600 px-4 py-3 font-medium text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{' '}
        <Link to="/ingresar" className="font-medium text-marca-600 hover:underline">
          Ingresá
        </Link>
      </p>
    </main>
  );
}
