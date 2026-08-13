import type { Rol } from '@ojosdecielo/core';
import { cn } from '@ojosdecielo/ui';

export const ROLES_PERSONAL: { valor: Rol; etiqueta: string; detalle: string }[] = [
  { valor: 'recepcionista', etiqueta: 'Recepcionista', detalle: 'Agenda, caja e inventario' },
  { valor: 'veterinario', etiqueta: 'Veterinario', detalle: 'Historia clínica y recetas' },
  { valor: 'administrador', etiqueta: 'Administrador', detalle: 'Facturación y equipo' },
];

/**
 * Selección múltiple de roles.
 *
 * Casillas y no un desplegable: los tres roles se combinan libremente y en una
 * clínica unipersonal se marcan los tres. Un `select` obligaría a elegir uno,
 * que es exactamente el modelo que dejamos atrás.
 */
export function SelectorRoles({
  id,
  roles,
  onCambiar,
  deshabilitado,
  bloqueados = [],
}: {
  id: string;
  roles: Rol[];
  onCambiar: (roles: Rol[]) => void;
  deshabilitado?: boolean;
  /** Roles que no se pueden desmarcar; por ejemplo el propio de administrador. */
  bloqueados?: readonly Rol[];
}) {
  const alternar = (rol: Rol) =>
    onCambiar(roles.includes(rol) ? roles.filter((r) => r !== rol) : [...roles, rol]);

  return (
    <fieldset disabled={deshabilitado} className="min-w-0">
      <legend className="sr-only">Roles</legend>
      <div className="flex flex-wrap gap-1.5">
        {ROLES_PERSONAL.map((r) => {
          const marcado = roles.includes(r.valor);
          const fijo = bloqueados.includes(r.valor);
          return (
            <label
              key={r.valor}
              title={fijo ? 'No podés sacarte este rol a vos mismo' : r.detalle}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1 text-sm',
                marcado
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50',
                (deshabilitado || fijo) && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                id={`${id}-${r.valor}`}
                checked={marcado}
                disabled={fijo}
                onChange={() => alternar(r.valor)}
                className="sr-only"
              />
              {r.etiqueta}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
