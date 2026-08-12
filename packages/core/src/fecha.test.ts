import { describe, expect, it } from 'vitest';
import {
  calcularEdad,
  enZonaClinica,
  formatearFecha,
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

describe('calcularEdad', () => {
  it('expresa en días a los cachorros de pocos días', () => {
    const hace5Dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(calcularEdad(hace5Dias)).toBe('5 días');
  });

  it('expresa en meses al primer año', () => {
    const hace3Meses = new Date(Date.now() - 92 * 24 * 60 * 60 * 1000);
    expect(calcularEdad(hace3Meses)).toBe('3 meses');
  });

  it('combina años y meses', () => {
    const hace2AniosY3Meses = new Date(Date.now() - (730 + 92) * 24 * 60 * 60 * 1000);
    expect(calcularEdad(hace2AniosY3Meses)).toBe('2 años y 3 meses');
  });

  it('usa singular cuando corresponde', () => {
    const hace1Anio = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
    expect(calcularEdad(hace1Anio)).toBe('1 año');
  });
});
