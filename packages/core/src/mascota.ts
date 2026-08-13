/**
 * Dominio de mascota: esquemas de validación y helpers de presentación.
 *
 * Los esquemas viven acá y no en la app para poder compartirlos con las Edge
 * Functions cuando haga falta validar del lado del servidor.
 */

import { z } from 'zod';
import { hoyCivil } from './fecha.js';

export const ESPECIES = ['perro', 'gato', 'ave', 'roedor', 'reptil', 'otro'] as const;
export const especieSchema = z.enum(ESPECIES);
export type Especie = z.infer<typeof especieSchema>;

export const SEXOS = ['macho', 'hembra', 'desconocido'] as const;
export const sexoSchema = z.enum(SEXOS);
export type Sexo = z.infer<typeof sexoSchema>;

export const ETIQUETA_ESPECIE: Record<Especie, string> = {
  perro: 'Perro',
  gato: 'Gato',
  ave: 'Ave',
  roedor: 'Roedor',
  reptil: 'Reptil',
  otro: 'Otro',
};

export const ETIQUETA_SEXO: Record<Sexo, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
  desconocido: 'Sin especificar',
};

const hoy = () => hoyCivil();

export const mascotaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Poné el nombre de tu mascota')
    .max(60, 'El nombre es demasiado largo'),
  especie: especieSchema,
  raza: z.string().trim().max(60, 'La raza es demasiado larga').optional(),
  // Sin .default(): haría que el tipo de entrada y el de salida difieran, y
  // React Hook Form necesita que coincidan. El default va en el formulario.
  sexo: sexoSchema,
  fecha_nacimiento: z
    .string()
    .refine((v) => v === '' || v <= hoy(), 'La fecha no puede ser futura')
    .optional(),
  castrado: z.boolean().optional(),
  color: z.string().trim().max(40, 'El color es demasiado largo').optional(),
  microchip: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^[0-9]{9,15}$/.test(v), 'El microchip son entre 9 y 15 números')
    .optional(),
});

export type DatosMascota = z.infer<typeof mascotaSchema>;

const limpiar = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);

/**
 * Argumentos para la RPC `crear_mascota`.
 *
 * Los campos sin valor se **omiten**, no se mandan como null: los parámetros de
 * la función tienen `default null`, así que omitirlos es equivalente y respeta
 * la firma que genera Supabase.
 */
export function paraCrear(datos: DatosMascota) {
  return {
    p_nombre: datos.nombre.trim(),
    p_especie: datos.especie,
    p_sexo: datos.sexo,
    ...(limpiar(datos.raza) !== undefined && { p_raza: limpiar(datos.raza) }),
    ...(limpiar(datos.fecha_nacimiento) !== undefined && {
      p_fecha_nacimiento: limpiar(datos.fecha_nacimiento),
    }),
    ...(limpiar(datos.color) !== undefined && {
      p_color: limpiar(datos.color),
    }),
    ...(limpiar(datos.microchip) !== undefined && {
      p_microchip: limpiar(datos.microchip),
    }),
    ...(datos.castrado !== undefined && { p_castrado: datos.castrado }),
  };
}

/**
 * Campos para un UPDATE de mascota.
 *
 * Acá sí van como `null` y no omitidos: el usuario puede querer **borrar** un
 * valor que había cargado, y omitir la clave dejaría el anterior intacto.
 */
export function paraActualizar(datos: DatosMascota) {
  return {
    nombre: datos.nombre.trim(),
    especie: datos.especie,
    sexo: datos.sexo,
    raza: limpiar(datos.raza) ?? null,
    fecha_nacimiento: limpiar(datos.fecha_nacimiento) ?? null,
    color: limpiar(datos.color) ?? null,
    microchip: limpiar(datos.microchip) ?? null,
    castrado: datos.castrado ?? null,
  };
}

/** Descripción corta para la tarjeta de la lista: "Perro · Mestiza · 3 años". */
export function describirMascota(m: {
  especie: Especie;
  raza: string | null;
  fecha_nacimiento: string | null;
}): string {
  const partes: string[] = [ETIQUETA_ESPECIE[m.especie]];
  if (m.raza) partes.push(m.raza);
  return partes.join(' · ');
}

export const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/** Valida una foto antes de subirla, para no gastar la subida en un rechazo del servidor. */
export function validarFoto(archivo: File): string | null {
  if (!TIPOS_FOTO.includes(archivo.type as (typeof TIPOS_FOTO)[number])) {
    return 'La foto tiene que ser JPG, PNG o WEBP';
  }
  if (archivo.size > TAMANO_MAXIMO_FOTO) {
    return 'La foto no puede pesar más de 5 MB';
  }
  return null;
}
