import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aFechaCivil,
  calcularEdad,
  diasHastaFechaCivil,
  enZonaClinica,
  formatearFecha,
  formatearFechaCivil,
  formatearHora,
  hoyCivil,
  sumarDiasCiviles,
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
    expect(diasHastaFechaCivil(hoyCivil())).toBe(0);
    expect(diasHastaFechaCivil(sumarDiasCiviles(hoyCivil(), 10))).toBe(10);
  });
});

describe('hoyCivil', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Regresión del bug que apareció en toda la aplicación: `toISOString()`
   * devuelve UTC, y en Argentina (UTC-3) a partir de las 21 h eso ya es el día
   * siguiente. La agenda abría en el día equivocado y los formularios
   * proponían mañana. Se congela el reloj a las 23:00 de Buenos Aires, que es
   * el momento en que las dos respuestas difieren.
   */
  it('devuelve el día de la clínica a las 23 h, no el de UTC', () => {
    // 2026-08-13T02:00:00Z = 12 de agosto, 23:00, en Buenos Aires.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T02:00:00Z'));

    expect(hoyCivil()).toBe('2026-08-12');
    // Lo que hacía el código viejo, para dejar la diferencia a la vista.
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-13');
  });

  it('coincide con UTC en horario de oficina', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T15:00:00Z'));
    expect(hoyCivil()).toBe('2026-08-12');
  });
});

describe('sumarDiasCiviles', () => {
  it('cruza un fin de mes', () => {
    expect(sumarDiasCiviles('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('resta con días negativos', () => {
    expect(sumarDiasCiviles('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respeta un año bisiesto', () => {
    expect(sumarDiasCiviles('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('no se corre al cruzar el cambio de horario de verano del hemisferio norte', () => {
    // Marzo es cuando una implementación con horas locales pierde o gana una
    // hora y termina devolviendo el día equivocado.
    expect(sumarDiasCiviles('2026-03-07', 1)).toBe('2026-03-08');
    expect(sumarDiasCiviles('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('devuelve la entrada si no es una fecha civil', () => {
    expect(sumarDiasCiviles('no es fecha', 1)).toBe('no es fecha');
  });
});

describe('aFechaCivil', () => {
  it('usa las partes locales y no las de UTC', () => {
    // 23:00 local del 12 de agosto en una máquina en UTC-3.
    const d = new Date(2026, 7, 12, 23, 0, 0);
    expect(aFechaCivil(d)).toBe('2026-08-12');
  });
});

describe('calcularEdad', () => {
  /** Fecha civil de hace N días, en el formato `yyyy-MM-dd` que guarda la base. */
  const haceDias = (dias: number): string => sumarDiasCiviles(hoyCivil(), -dias);

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
