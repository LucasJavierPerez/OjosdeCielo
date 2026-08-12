import { describe, expect, it } from 'vitest';
import {
  calcularEdad,
  diasHastaFechaCivil,
  enZonaClinica,
  formatearFecha,
  formatearFechaCivil,
  formatearHora,
  ZONA_CLINICA,
} from './fecha.js';

describe('zona horaria de la clínica', () => {
  it('interpreta un instante UTC en horario argentino', () => {
    // 2026-08-12T02:30:00Z es todavía el 11 de agosto, 23:30, en Buenos Aires (UTC-3).
    // Este es exactamente el caso que rompe una agenda si se formatea en UTC.
    const instante = '2026-08-12T02:30:00Z';
    expect(formatearFecha(instante)).toBe('11/08/2026');
    expect(formatearHora(instante)).toBe('23:30');
  });

  it('no desplaza un instante del mediodía', () => {
    expect(formatearFecha('2026-08-12T15:00:00Z')).toBe('12/08/2026');
    expect(formatearHora('2026-08-12T15:00:00Z')).toBe('12:00');
  });

  it('usa la zona de la clínica sin importar la del dispositivo', () => {
    expect(enZonaClinica('2026-08-12T02:30:00Z').timeZone).toBe(ZONA_CLINICA);
  });
});

describe('fechas civiles (columnas date)', () => {
  it('NO desplaza la fecha por zona horaria', () => {
    // Regresión: fecha_nacimiento es una columna `date`. Pasarla por new Date()
    // la lee como medianoche UTC y en Argentina (UTC-3) muestra el día anterior.
    // Se detectó cargando una mascota nacida el 15/03 y viendo "14/03/2023".
    expect(formatearFechaCivil('2023-03-15')).toBe('15/03/2023');
    expect(formatearFechaCivil('2026-01-01')).toBe('01/01/2026');
    expect(formatearFechaCivil('2026-12-31')).toBe('31/12/2026');
  });

  it('tolera un timestamp completo quedándose con la parte de fecha', () => {
    expect(formatearFechaCivil('2023-03-15T00:00:00Z')).toBe('15/03/2023');
  });

  it('cuenta días sin que la zona horaria corra el resultado', () => {
    const hoy = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(diasHastaFechaCivil(iso(hoy))).toBe(0);

    const enDiez = new Date(hoy);
    enDiez.setDate(enDiez.getDate() + 10);
    expect(diasHastaFechaCivil(iso(enDiez))).toBe(10);
  });
});

describe('calcularEdad', () => {
  /** Fecha civil de hace N días, en el formato `yyyy-MM-dd` que guarda la base. */
  const haceDias = (dias: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  };

  it('expresa en días a los cachorros de pocos días', () => {
    expect(calcularEdad(haceDias(5))).toBe('5 días');
  });

  it('expresa en meses al primer año', () => {
    expect(calcularEdad(haceDias(92))).toBe('3 meses');
  });

  it('combina años y meses', () => {
    expect(calcularEdad(haceDias(730 + 92))).toBe('2 años y 3 meses');
  });

  it('usa singular cuando corresponde', () => {
    expect(calcularEdad(haceDias(366))).toBe('1 año');
  });
});
