import { Link } from 'react-router';

export function NoEncontrado() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="mt-2 text-slate-600">Puede que el enlace esté desactualizado.</p>
      <Link to="/" className="mt-6 font-medium text-marca-600 hover:underline">
        Volver al inicio
      </Link>
    </main>
  );
}
