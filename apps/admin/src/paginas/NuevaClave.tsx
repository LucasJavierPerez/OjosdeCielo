import { Cargando, EntradaClave, Isotipo } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

export function NuevaClave() {
  const { supabase, session, cargando } = useAuth();
  const navigate = useNavigate();
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (clave.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres');
      return;
    }
    if (clave !== repetir) {
      setError('Las dos contraseñas no coinciden');
      return;
    }
    setError(null);
    setGuardando(true);
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    setGuardando(false);
    if (err) {
      setError('No pudimos cambiarla. Pedí un enlace nuevo.');
      return;
    }
    setListo(true);
    setTimeout(() => navigate('/agenda', { replace: true }), 1200);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="text-center">
        <Isotipo className="mx-auto h-14" />
        <h1 className="mt-4 text-xl font-semibold">Nueva contraseña</h1>
      </div>

      {cargando ? (
        <Cargando etiqueta="Verificando el enlace" />
      ) : !session ? (
        <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          El enlace venció o no es válido.{' '}
          <Link to="/recuperar" className="font-medium underline">
            Pedí uno nuevo
          </Link>
          .
        </p>
      ) : listo ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          Listo. Entrando al panel…
        </p>
      ) : (
        <form onSubmit={alEnviar} className="mt-8 space-y-4">
          <div>
            <label htmlFor="clave" className="block text-sm font-medium text-slate-700">
              Contraseña nueva
            </label>
            <EntradaClave
              id="clave"
              autoComplete="new-password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="repetir" className="block text-sm font-medium text-slate-700">
              Repetir
            </label>
            <EntradaClave
              id="repetir"
              autoComplete="new-password"
              required
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-lg bg-marca-600 px-4 py-2.5 font-medium text-white hover:bg-marca-700 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </main>
  );
}
