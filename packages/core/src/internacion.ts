/**
 * Dominio de la internación (hospitalización).
 *
 * Los esquemas viven acá para compartirlos entre los formularios del panel y,
 * si hiciera falta, validación del lado del servidor. La autorización real vive
 * en RLS (ver AGENTS.md, regla 1): estos helpers son presentación y validación
 * de forma, nunca control de acceso.
 */

import { differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';
import { enZonaClinica } from './fecha.js';

export const INTERNACION_ESTADOS = ['activa', 'cerrada'] as const;
export type InternacionEstado = (typeof INTERNACION_ESTADOS)[number];

export const ETIQUETA_INTERNACION_ESTADO: Record<InternacionEstado, string> = {
  activa: 'Activa',
  cerrada: 'Cerrada',
};

/** Vías de administración habituales. Texto libre en la base; esto es para sugerir. */
export const VIAS_ADMINISTRACION = [
  'Intravenosa',
  'Intramuscular',
  'Subcutánea',
  'Oral',
  'Tópica',
  'Rectal',
  'Inhalatoria',
] as const;

/** Estudios que se piden con más frecuencia en una internación. Sugerencias, no un enum. */
export const TIPOS_ESTUDIO_SUGERIDOS = [
  'Hemograma',
  'Bioquímica sanguínea',
  'Ionograma',
  'Estado ácido-base',
  'Orina completa',
  'Coagulograma',
  'Ecografía',
  'Radiografía',
  'Frotis',
  'Cultivo y antibiograma',
] as const;

/** Motivos de egreso. El motivo es texto libre; esto ordena el selector. */
export const MOTIVOS_EGRESO = [
  'Alta médica',
  'Alta voluntaria',
  'Derivación',
  'Fallecimiento',
  'Eutanasia',
] as const;

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

export const crearInternacionSchema = z.object({
  motivo: z.string().trim().min(1, 'Poné el motivo de internación').max(300),
  diagnostico: z.string().trim().max(500).optional(),
  ubicacion: z.string().trim().max(80).optional(),
  indicaciones: z.string().trim().max(1000).optional(),
});
export type DatosCrearInternacion = z.infer<typeof crearInternacionSchema>;

export const encabezadoInternacionSchema = z.object({
  diagnostico: z.string().trim().max(500).optional(),
  ubicacion: z.string().trim().max(80).optional(),
  indicaciones: z.string().trim().max(1000).optional(),
});
export type DatosEncabezadoInternacion = z.infer<typeof encabezadoInternacionSchema>;

export const evolucionSchema = z.object({
  nota: z.string().trim().min(1, 'Escribí el parte de evolución').max(2000),
  // Como texto: un <input type="number"> vacío es '' y mezclarlo con number
  // fuerza una unión que React Hook Form no resuelve bien.
  temperatura: z
    .string()
    .refine(
      (v) => v === '' || (/^\d{2}(\.\d)?$/.test(v) && Number(v) > 20 && Number(v) < 50),
      'La temperatura va entre 20 y 50 °C',
    )
    .optional(),
});
export type DatosEvolucion = z.infer<typeof evolucionSchema>;

/** Campo de monto opcional para un cargo: vacío = sin cargo. */
const montoOpcional = z
  .string()
  .refine((v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0), 'Poné un monto válido')
  .optional();

export const estudioSchema = z.object({
  tipo: z.string().trim().min(1, 'Poné el tipo de estudio').max(120),
  resultado: z.string().trim().max(2000).optional(),
  cargo_concepto: z.string().trim().max(120).optional(),
  cargo_monto: montoOpcional,
});
export type DatosEstudio = z.infer<typeof estudioSchema>;

export const medicacionInternacionSchema = z.object({
  descripcion: z.string().trim().min(1, 'Poné el nombre del medicamento').max(160),
  dosis: z.string().trim().max(120).optional(),
  via: z.string().trim().max(40).optional(),
  producto_id: z.string().uuid().optional(),
  unidades: z
    .string()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 9999),
      'Poné un número entero de unidades',
    )
    .optional(),
  cargo_concepto: z.string().trim().max(120).optional(),
  cargo_monto: montoOpcional,
});
export type DatosMedicacionInternacion = z.infer<typeof medicacionInternacionSchema>;

export const cargoManualSchema = z.object({
  concepto: z.string().trim().min(1, 'Poné el concepto del cargo').max(120),
  monto: z
    .string()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Poné un monto mayor a cero'),
  cantidad: z
    .string()
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 9999,
      'Poné una cantidad entera',
    )
    .optional(),
});
export type DatosCargoManual = z.infer<typeof cargoManualSchema>;

export const pagoInternacionSchema = z.object({
  monto: z
    .string()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Poné un monto mayor a cero'),
  medio: z.enum([
    'efectivo',
    'debito',
    'credito',
    'transferencia',
    'mercadopago',
    'cuenta_corriente',
  ]),
});
export type DatosPagoInternacion = z.infer<typeof pagoInternacionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Días de internación, contando el día de ingreso como día 1 (así se factura).
 * `ingreso` y `egreso` son instantes (`timestamptz`); se cuentan días de
 * calendario en la zona de la clínica, no períodos de 24 h.
 */
export function diasInternado(ingreso: string | Date, egreso?: string | Date | null): number {
  const desde = enZonaClinica(ingreso);
  const hasta = enZonaClinica(egreso ?? new Date());
  return Math.max(1, differenceInCalendarDays(hasta, desde) + 1);
}

/** Saldo de una internación: lo cargado menos lo cobrado. Nunca negativo para mostrar. */
export function saldoInternacion(total: number, pagado: number): number {
  return Math.max(0, Number(total) - Number(pagado));
}
