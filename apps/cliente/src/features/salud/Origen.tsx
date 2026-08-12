import { cn } from '@ojosdecielo/ui';

interface ConOrigen {
  origen: 'tutor' | 'clinica';
  verificado_por: string | null;
}

/**
 * Marca la procedencia de un dato de salud.
 *
 * Clínicamente no es lo mismo un peso que reportó el dueño que uno medido en
 * la balanza del consultorio. La distinción tiene que verse de un vistazo,
 * tanto en la app como en el panel (docs/stack.md, Decisión 13).
 */
export function EtiquetaOrigen({ registro }: { registro: ConOrigen }) {
  const esClinica = registro.origen === 'clinica';
  const verificado = registro.verificado_por !== null;

  const texto = esClinica ? 'Clínica' : verificado ? 'Verificado' : 'Cargado por vos';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        esClinica && 'bg-marca-100 text-marca-700',
        !esClinica && verificado && 'bg-emerald-100 text-emerald-700',
        !esClinica && !verificado && 'bg-slate-100 text-slate-600',
      )}
    >
      {texto}
    </span>
  );
}

/** Si el tutor actual puede editar o borrar este registro. */
export function puedeEditar(registro: ConOrigen & { cargado_por: string }, perfilId: string) {
  // Espeja la política RLS. La UI usa esto sólo para no ofrecer una acción que
  // el servidor va a rechazar; quien decide es la base de datos.
  return registro.origen === 'tutor' && registro.cargado_por === perfilId;
}
