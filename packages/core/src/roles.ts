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

/**
 * Los permisos se calculan sobre el conjunto de roles, no sobre uno.
 *
 * Una misma persona puede ser administradora, veterinaria y recepcionista: en
 * una clínica unipersonal lo es. Tener cualquiera de los roles que habilitan
 * algo alcanza para habilitarlo.
 */
export function tieneRol(roles: readonly Rol[] | null | undefined, rol: Rol): boolean {
  return Boolean(roles?.includes(rol));
}

export function esPersonalClinica(roles: readonly Rol[] | null | undefined): boolean {
  return ROLES_CLINICA.some((r) => tieneRol(roles, r));
}

/** Sólo un profesional matriculado puede registrar actos clínicos. */
export function puedeCargarHistoriaClinica(roles: readonly Rol[] | null | undefined): boolean {
  return tieneRol(roles, 'veterinario');
}

export function puedeGestionarInventario(roles: readonly Rol[] | null | undefined): boolean {
  return tieneRol(roles, 'administrador') || tieneRol(roles, 'recepcionista');
}

export function puedeVerMetricas(roles: readonly Rol[] | null | undefined): boolean {
  return tieneRol(roles, 'administrador');
}

export function puedeOperarCaja(roles: readonly Rol[] | null | undefined): boolean {
  return tieneRol(roles, 'administrador') || tieneRol(roles, 'recepcionista');
}

/** Para mostrar: «Administradora · Veterinaria». */
export const ETIQUETA_ROL: Record<Rol, string> = {
  cliente: 'Cliente',
  recepcionista: 'Recepcionista',
  veterinario: 'Veterinario',
  administrador: 'Administrador',
};

export function etiquetarRoles(roles: readonly Rol[] | null | undefined): string {
  if (!roles || roles.length === 0) return '—';
  return roles.map((r) => ETIQUETA_ROL[r] ?? r).join(' · ');
}

/** Rol dentro de una mascota compartida (ver docs/stack.md, Decisión 12). */
export const ROLES_TUTOR = ['titular', 'tutor'] as const;
export const rolTutorSchema = z.enum(ROLES_TUTOR);
export type RolTutor = z.infer<typeof rolTutorSchema>;

/** Sólo el titular gestiona quién más accede a la mascota. */
export function puedeGestionarAccesos(rolTutor: RolTutor): boolean {
  return rolTutor === 'titular';
}
