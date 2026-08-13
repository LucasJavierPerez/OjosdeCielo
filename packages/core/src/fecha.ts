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

/**
 * `dd/MM/yyyy` para un **instante** (`timestamptz`), convertido a la zona de la
 * clínica. Para columnas `date` usar `formatearFechaCivil`.
 */
export function formatearFecha(fecha: Date | string): string {
  return format(enZonaClinica(fecha), 'dd/MM/yyyy', { locale: es });
}

/**
 * `dd/MM/yyyy` para una **fecha civil** — columnas `date` como
 * `fecha_nacimiento` o `aplicacion.proxima_fecha`.
 *
 * No convierte de zona horaria, y ese es todo el punto: "2023-03-15" es el 15
 * de marzo en cualquier lugar del mundo. Pasarla por `new Date()` la
 * interpretaría como medianoche UTC y en Argentina (UTC-3) mostraría el 14.
 */
export function formatearFechaCivil(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  if (!anio || !mes || !dia) return fecha;
  return `${dia}/${mes}/${anio}`;
}

/**
 * Hoy, como fecha civil `yyyy-MM-dd` en la zona de la clínica.
 *
 * Existe para no volver a escribir `new Date().toISOString().slice(0, 10)`,
 * que es lo mismo pero **en UTC**: en Argentina (UTC-3), a partir de las 21 h
 * devuelve el día siguiente. Con eso la agenda abría en el día equivocado y
 * los formularios proponían mañana como fecha por defecto.
 */
export function hoyCivil(): string {
  return format(ahora(), 'yyyy-MM-dd');
}

/**
 * Una fecha civil `yyyy-MM-dd` a partir de un `Date`, leyendo sus partes
 * locales. Igual que `hoyCivil()`, evita el desplazamiento de `toISOString()`.
 */
export function aFechaCivil(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Suma días a una fecha civil sin salir de fecha civil. */
export function sumarDiasCiviles(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return fecha;
  // Date.UTC y no el constructor local: el horario de verano de cualquier
  // zona podría comerse o duplicar una hora y correr el día.
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días de calendario entre hoy y una fecha civil. Negativo si ya pasó. */
export function diasHastaFechaCivil(fecha: string): number {
  const hoy = hoyCivil();
  const [a1, m1, d1] = hoy.split('-').map(Number);
  const [a2, m2, d2] = fecha.slice(0, 10).split('-').map(Number);
  if (!a1 || !m1 || !d1 || !a2 || !m2 || !d2) return 0;
  // Date.UTC evita que el horario de verano de cualquier zona altere la resta.
  const msPorDia = 86_400_000;
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / msPorDia);
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

/**
 * Edad legible a partir de la fecha de nacimiento.
 *
 * Acepta la fecha civil que guarda la base (`yyyy-MM-dd`) sin convertirla de
 * zona: ver `formatearFechaCivil`.
 */
export function calcularEdad(fechaNacimiento: string): string {
  const dias = Math.abs(diasHastaFechaCivil(fechaNacimiento));
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);

  if (anios === 0 && meses === 0) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (anios === 0) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  if (meses === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return `${anios} ${anios === 1 ? 'año' : 'años'} y ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}
