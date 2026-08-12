/**
 * Origen de los datos de salud (ver docs/stack.md, Decisión 13).
 *
 * Tutor y veterinario cargan en paralelo. El origen determina quién puede
 * editar y cómo se presenta el dato: un peso reportado por el dueño no tiene
 * el mismo valor clínico que uno medido en la balanza del consultorio.
 */

import { z } from 'zod';

export const ORIGENES = ['tutor', 'clinica'] as const;
export const origenSchema = z.enum(ORIGENES);
export type Origen = z.infer<typeof origenSchema>;

/** Columnas que llevan todas las tablas de salud escribibles por ambos. */
export interface ConOrigen {
  origen: Origen;
  cargado_por: string;
  verificado_por: string | null;
  verificado_en: string | null;
}

/**
 * Si un tutor puede editar o borrar un registro.
 *
 * Espeja la política RLS. La UI usa esto para no ofrecer acciones que el
 * servidor va a rechazar — pero quien realmente decide es la base de datos.
 */
export function tutorPuedeEditar(registro: ConOrigen, perfilId: string): boolean {
  return registro.origen === 'tutor' && registro.cargado_por === perfilId;
}

export function estaVerificado(registro: ConOrigen): boolean {
  return registro.verificado_por !== null;
}

/** Etiqueta para mostrar la procedencia del dato. */
export function etiquetaOrigen(registro: ConOrigen): string {
  if (registro.origen === 'clinica') return 'Registrado por la clínica';
  if (estaVerificado(registro)) return 'Reportado por el tutor · verificado';
  return 'Reportado por el tutor';
}
