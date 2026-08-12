import { Link } from 'react-router';

/**
 * Encabezado con vuelta atrás.
 *
 * Usa un Link a una ruta concreta y no `history.back()`: en una PWA abierta
 * desde la pantalla de inicio el historial puede estar vacío, y el botón no
 * haría nada.
 */
export function Encabezado({
  titulo,
  volverA,
  accion,
}: {
  titulo: string;
  volverA: string;
  accion?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-3">
      <Link
        to={volverA}
        aria-label="Volver"
        className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100"
      >
        <span aria-hidden="true">‹</span>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{titulo}</h1>
      {accion}
    </header>
  );
}
