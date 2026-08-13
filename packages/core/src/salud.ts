/**
 * Dominio de los datos de salud (docs/stack.md, Decisión 13).
 *
 * Tutor y veterinario cargan en paralelo. `origen` no viaja desde el cliente:
 * lo fija un trigger en la base según quién escribe.
 */

import { z } from 'zod';
import { diasHastaFechaCivil, hoyCivil, sumarDiasCiviles } from './fecha.js';

const hoy = () => hoyCivil();

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

// Sin z.coerce: haría que el tipo de entrada difiera del de salida, y React
// Hook Form necesita que coincidan. La conversión se hace en el formulario con
// `valueAsNumber`, que es lo que corresponde para un <input type="number">.
export const pesoSchema = z.object({
  fecha: z
    .string()
    .min(1, 'Poné la fecha')
    .refine((v) => v <= hoy(), 'La fecha no puede ser futura'),
  peso_kg: z
    .number({ message: 'Poné un número' })
    .positive('El peso tiene que ser mayor a cero')
    .max(999, 'Ese peso no parece correcto'),
  nota: z.string().trim().max(200).optional(),
});

export type DatosPeso = z.infer<typeof pesoSchema>;

/** Variación entre dos pesos consecutivos, para señalar cambios bruscos. */
export function variacionPeso(actual: number, anterior: number): number {
  if (anterior === 0) return 0;
  return ((actual - anterior) / anterior) * 100;
}

/**
 * Un cambio de más del 10% entre mediciones consecutivas merece atención.
 * No es un diagnóstico: es una señal para que el tutor consulte.
 */
export function variacionRelevante(porcentaje: number): boolean {
  return Math.abs(porcentaje) >= 10;
}

// ---------------------------------------------------------------------------
// Vacunas y desparasitaciones
// ---------------------------------------------------------------------------

export const TIPOS_APLICACION = [
  'vacuna',
  'desparasitacion_interna',
  'desparasitacion_externa',
] as const;
export type TipoAplicacion = (typeof TIPOS_APLICACION)[number];

export const ETIQUETA_APLICACION: Record<TipoAplicacion, string> = {
  vacuna: 'Vacuna',
  desparasitacion_interna: 'Desparasitación interna',
  desparasitacion_externa: 'Desparasitación externa',
};

/** Intervalos habituales, para sugerir la próxima fecha al cargar. */
export const INTERVALO_SUGERIDO_DIAS: Record<TipoAplicacion, number> = {
  vacuna: 365,
  desparasitacion_interna: 90,
  desparasitacion_externa: 30,
};

export const aplicacionSchema = z
  .object({
    tipo: z.enum(TIPOS_APLICACION),
    producto: z.string().trim().max(80).optional(),
    fecha: z
      .string()
      .min(1, 'Poné la fecha')
      .refine((v) => v <= hoy(), 'La fecha no puede ser futura'),
    proxima_fecha: z.string().optional(),
    nota: z.string().trim().max(200).optional(),
  })
  .refine((d) => !d.proxima_fecha || d.proxima_fecha > d.fecha, {
    message: 'La próxima fecha tiene que ser posterior',
    path: ['proxima_fecha'],
  });

export type DatosAplicacion = z.infer<typeof aplicacionSchema>;

/** Suma el intervalo típico a la fecha de aplicación. Trabaja en fecha civil. */
export function sugerirProximaFecha(fecha: string, tipo: TipoAplicacion): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(fecha)) return '';
  return sumarDiasCiviles(fecha, INTERVALO_SUGERIDO_DIAS[tipo]);
}

export type EstadoVencimiento = 'vencida' | 'proxima' | 'al_dia';

export function estadoVencimiento(proximaFecha: string | null): EstadoVencimiento | null {
  if (!proximaFecha) return null;
  const dias = diasHastaFechaCivil(proximaFecha);
  if (dias < 0) return 'vencida';
  if (dias <= 30) return 'proxima';
  return 'al_dia';
}

// ---------------------------------------------------------------------------
// Antecedentes
// ---------------------------------------------------------------------------

export const TIPOS_ANTECEDENTE = ['alergia', 'cirugia', 'patologia_cronica', 'otro'] as const;
export type TipoAntecedente = (typeof TIPOS_ANTECEDENTE)[number];

export const ETIQUETA_ANTECEDENTE: Record<TipoAntecedente, string> = {
  alergia: 'Alergia',
  cirugia: 'Cirugía',
  patologia_cronica: 'Patología crónica',
  otro: 'Otro',
};

export const antecedenteSchema = z.object({
  tipo: z.enum(TIPOS_ANTECEDENTE),
  descripcion: z.string().trim().min(1, 'Contanos de qué se trata').max(300),
  fecha: z.string().optional(),
});

export type DatosAntecedente = z.infer<typeof antecedenteSchema>;

// ---------------------------------------------------------------------------
// Medicación
// ---------------------------------------------------------------------------

export const medicacionSchema = z
  .object({
    descripcion: z.string().trim().min(1, 'Poné el nombre del medicamento').max(120),
    dosis: z.string().trim().max(80).optional(),
    // Como texto: un campo numérico opcional vacío es '' en el DOM, y mezclarlo
    // con number obliga a una unión que React Hook Form no resuelve bien.
    frecuencia_horas: z
      .string()
      .refine(
        (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 720),
        'Poné un número de horas entre 1 y 720',
      )
      .optional(),
    desde: z.string().min(1, 'Poné desde cuándo'),
    hasta: z.string().optional(),
  })
  .refine((d) => !d.hasta || d.hasta >= d.desde, {
    message: 'La fecha de fin no puede ser anterior al inicio',
    path: ['hasta'],
  });

export type DatosMedicacion = z.infer<typeof medicacionSchema>;

export function medicacionActiva(m: { desde: string; hasta: string | null }): boolean {
  const h = hoy();
  return m.desde <= h && (m.hasta === null || m.hasta >= h);
}
