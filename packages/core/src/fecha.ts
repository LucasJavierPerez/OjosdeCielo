/**
 * Manejo de fechas del proyecto.
 *
 * Regla del repositorio: todo instante se guarda en UTC (`timestamptz`) y se
 * presenta en la zona de la clínica. Nunca usar `new Date()` sin zona para
 * lógica de turnos o recordatorios — el servidor corre en UTC y el dispositivo
 * del usuario puede estar en cualquier lado.
 */

import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';

export const ZONA_CLINICA = 'America/Argentina/Buenos_Aires';

/** Convierte un instante a la zona de la clínica para presentarlo o hacer cálculos de calendario. */
export function enZonaClinica(fecha: Date | string): TZDate {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return new TZDate(d, ZONA_CLINICA);
}

/** Ahora, en la zona de la clínica. */
export function ahora(): TZDate {
  return TZDate.tz(ZONA_CLINICA);
}

/** `dd/MM/yyyy` — el formato que espera un usuario argentino. */
export function formatearFecha(fecha: Date | string): string {
  return format(enZonaClinica(fecha), 'dd/MM/yyyy', { locale: es });
}

/** `dd/MM/yyyy HH:mm` */
export function formatearFechaHora(fecha: Date | string): string {
  return format(enZonaClinica(fecha), 'dd/MM/yyyy HH:mm', { locale: es });
}

/** `HH:mm` */
export function formatearHora(fecha: Date | string): string {
  return format(enZonaClinica(fecha), 'HH:mm', { locale: es });
}

/** `martes 12 de agosto` — para encabezados de agenda. */
export function formatearFechaLarga(fecha: Date | string): string {
  return format(enZonaClinica(fecha), "EEEE d 'de' MMMM", { locale: es });
}

/**
 * Días de calendario hasta una fecha, en la zona de la clínica.
 * Negativo si ya pasó. Cuenta días de calendario, no períodos de 24 h:
 * "mañana" es mañana aunque falten sólo 3 horas.
 */
export function diasHasta(fecha: Date | string): number {
  return differenceInCalendarDays(enZonaClinica(fecha), ahora());
}

/** Texto relativo para recordatorios y listados de turnos. */
export function textoRelativo(fecha: Date | string): string {
  const dias = diasHasta(fecha);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  if (dias > 0) return `en ${dias} días`;
  return `hace ${Math.abs(dias)} días`;
}

export function estaVencido(fecha: Date | string): boolean {
  return isBefore(enZonaClinica(fecha), ahora());
}

export function esFuturo(fecha: Date | string): boolean {
  return isAfter(enZonaClinica(fecha), ahora());
}

/** Próxima fecha de una aplicación periódica (vacuna, desparasitación). */
export function proximaAplicacion(desde: Date | string, intervaloDias: number): Date {
  return addDays(enZonaClinica(desde), intervaloDias);
}

/** Edad legible a partir de la fecha de nacimiento. */
export function calcularEdad(fechaNacimiento: Date | string): string {
  const dias = Math.abs(diasHasta(fechaNacimiento));
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);

  if (anios === 0 && meses === 0) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (anios === 0) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  if (meses === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return `${anios} ${anios === 1 ? 'año' : 'años'} y ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}
