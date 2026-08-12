/**
 * Roles y permisos.
 *
 * ATENCIÓN: esto es *presentación*, no seguridad. La autorización real vive en
 * las políticas RLS de Postgres (ver AGENTS.md, regla 1). Estos helpers sirven
 * para no mostrar botones que van a fallar; nunca para proteger datos.
 */

import { z } from 'zod';

export const ROLES = ['cliente', 'recepcionista', 'veterinario', 'administrador'] as const;
export const rolSchema = z.enum(ROLES);
export type Rol = z.infer<typeof rolSchema>;

/** Roles que pertenecen al personal de la clínica (acceden al panel admin). */
export const ROLES_CLINICA = ['recepcionista', 'veterinario', 'administrador'] as const;

export function esPersonalClinica(rol: Rol): boolean {
  return (ROLES_CLINICA as readonly string[]).includes(rol);
}

/** Sólo un profesional matriculado puede registrar actos clínicos. */
export function puedeCargarHistoriaClinica(rol: Rol): boolean {
  return rol === 'veterinario';
}

export function puedeGestionarInventario(rol: Rol): boolean {
  return rol === 'administrador' || rol === 'recepcionista';
}

export function puedeVerMetricas(rol: Rol): boolean {
  return rol === 'administrador';
}

export function puedeOperarCaja(rol: Rol): boolean {
  return rol === 'administrador' || rol === 'recepcionista';
}

/** Rol dentro de una mascota compartida (ver docs/stack.md, Decisión 12). */
export const ROLES_TUTOR = ['titular', 'tutor'] as const;
export const rolTutorSchema = z.enum(ROLES_TUTOR);
export type RolTutor = z.infer<typeof rolTutorSchema>;

/** Sólo el titular gestiona quién más accede a la mascota. */
export function puedeGestionarAccesos(rolTutor: RolTutor): boolean {
  return rolTutor === 'titular';
}
