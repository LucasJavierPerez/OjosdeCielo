import { Isotipo } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link } from 'react-router';

export function RecuperarClave() {
  const { supabase } = useAuth();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${globalThis.location.origin}/nueva-clave`,
    });
    setEnviado(true);
    setEnviando(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="text-center">
        <Isotipo className="mx-auto h-14" />
        <h1 className="mt-4 text-xl font-semibold">Recuperar contraseña</h1>
      </div>

      {enviado ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          Si hay una cuenta con ese email, te llega un enlace para elegir una contraseña nueva.
        </p>
      ) : (
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white hover:bg-marca-700 disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link to="/ingresar" className="font-medium text-marca-600 hover:underline">
          Volver
        </Link>
      </p>
    </main>
  );
}
