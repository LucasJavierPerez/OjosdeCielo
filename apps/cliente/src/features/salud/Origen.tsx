import { cn } from '@ojosdecielo/ui';

interface ConOrigen {
  origen: 'tutor' | 'clinica';
  verificado_por: string | null;
  descartado_en?: string | null;
  motivo_descarte?: string | null;
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

  // El descarte gana sobre todo lo demás: si el profesional dijo que el dato no
  // vale, eso es lo primero que el tutor tiene que leer.
  if (registro.descartado_en) {
    return (
      <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
        Descartado por la clínica
      </span>
    );
  }

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

/**
 * Motivo del descarte, para mostrarlo debajo del registro.
 *
 * El tutor tiene que entender por qué su dato dejó de contar, o va a pensar
 * que la app se lo comió.
 */
export function MotivoDescarte({ registro }: { registro: ConOrigen }) {
  if (!registro.descartado_en || !registro.motivo_descarte) return null;
  return <p className="mt-0.5 text-xs text-amber-700">{registro.motivo_descarte}</p>;
}
