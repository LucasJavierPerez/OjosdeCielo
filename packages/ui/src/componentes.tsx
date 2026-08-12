import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from './utils.js';

/** Spinner de carga. `role="status"` para que un lector de pantalla lo anuncie. */
export function Cargando({ etiqueta = 'Cargando' }: { etiqueta?: string }) {
  return (
    <div className="flex justify-center py-8">
      <div
        className="size-7 animate-spin rounded-full border-2 border-marca-600 border-t-transparent"
        role="status"
        aria-label={etiqueta}
      />
    </div>
  );
}

/**
 * Mensaje de error accionable.
 *
 * Nunca mostrar el error crudo de Supabase: no le dice nada al usuario y puede
 * filtrar detalles del esquema.
 */
export function MensajeError({
  titulo = 'Algo salió mal',
  detalle,
  onReintentar,
}: {
  titulo?: string;
  detalle?: string;
  onReintentar?: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm">
      <p className="font-medium text-red-800">{titulo}</p>
      {detalle && <p className="mt-1 text-red-700">{detalle}</p>}
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-3 font-medium text-red-800 underline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Estado vacío. Siempre dice qué hacer a continuación, no sólo que no hay nada. */
export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{titulo}</p>
      {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'texto';

const ESTILOS_BOTON: Record<VarianteBoton, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700',
  secundario: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  peligro: 'bg-red-600 text-white hover:bg-red-700',
  texto: 'text-marca-600 hover:underline',
};

export function Boton({
  variante = 'primario',
  cargando,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton;
  cargando?: boolean;
}) {
  return (
    <button
      // El default de <button> dentro de un form es "submit", que dispara
      // envíos accidentales. Se declara explícito donde haga falta.
      type="button"
      {...props}
      disabled={props.disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors disabled:opacity-60',
        variante === 'texto' ? 'py-1' : 'min-h-11 py-2.5',
        ESTILOS_BOTON[variante],
        className,
      )}
    >
      {cargando && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  id,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && (
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-slate-500">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const ESTILO_ENTRADA =
  'mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-50';

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(ESTILO_ENTRADA, className)} />;
}

export function Seleccion({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(ESTILO_ENTRADA, 'bg-white', className)}>
      {children}
    </select>
  );
}
