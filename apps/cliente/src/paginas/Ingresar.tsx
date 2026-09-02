import { EntradaClave, LogoCompleto } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';

export function Ingresar() {
  const { supabase, session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (session) {
    const destino = (location.state as { desde?: string } | null)?.desde ?? '/';
    return <Navigate to={destino} replace />;
  }

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const { error: errorAuth } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (errorAuth) {
      // Mensaje genérico a propósito: distinguir "no existe" de "contraseña
      // incorrecta" permite averiguar qué emails están registrados.
      setError(
        errorAuth.message === 'Email not confirmed'
          ? 'Todavía no confirmaste tu email. Revisá tu casilla.'
          : 'Email o contraseña incorrectos.',
      );
      setEnviando(false);
    }
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <LogoCompleto className="mx-auto max-w-48" />
      {/* El nombre ya está en el logo; repetirlo en un h1 lo diría dos veces.
          El h1 queda para los lectores de pantalla, que no ven la imagen. */}
      <h1 className="sr-only">Ojos de Cielo</h1>
      <p className="mt-4 text-center text-slate-600">La salud de tu mascota, siempre a mano</p>

      <form onSubmit={alEnviar} className="mt-8 space-y-4">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-2 text-right text-sm">
            <Link to="/recuperar" className="text-marca-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-marca-600 px-4 py-3 font-medium text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Todavía no tenés cuenta?{' '}
        <Link to="/registrarse" className="font-medium text-marca-600 hover:underline">
          Registrate
        </Link>
      </p>
    </main>
  );
}
