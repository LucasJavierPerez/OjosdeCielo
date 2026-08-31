import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cargoManualSchema,
  crearInternacionSchema,
  diasInternado,
  evolucionSchema,
  pagoInternacionSchema,
  saldoInternacion,
} from './internacion.js';

describe('diasInternado', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cuenta el día de ingreso como día 1', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T18:00:00Z')); // 15 h en Buenos Aires
    expect(diasInternado('2026-08-31T13:00:00Z')).toBe(1);
  });

  it('cuenta días de calendario, no períodos de 24 h', () => {
    // Ingresa el 30 a las 23 h locales, egresa el 1 a las 2 h locales: toca tres
    // días de calendario (30, 31, 1) aunque sean ~27 h reales.
    expect(diasInternado('2026-08-31T02:00:00Z', '2026-09-01T05:00:00Z')).toBe(3);
  });

  it('con internación abierta mide hasta hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T15:00:00Z'));
    expect(diasInternado('2026-08-31T15:00:00Z')).toBe(4);
  });

  it('nunca devuelve menos de 1', () => {
    expect(diasInternado('2026-08-31T15:00:00Z', '2026-08-31T16:00:00Z')).toBe(1);
  });
});

describe('saldoInternacion', () => {
  it('es lo cargado menos lo cobrado', () => {
    expect(saldoInternacion(10000, 4000)).toBe(6000);
  });

  it('no baja de cero aunque se haya pagado de más', () => {
    expect(saldoInternacion(10000, 12000)).toBe(0);
  });
});

describe('esquemas', () => {
  it('la internación necesita motivo', () => {
    expect(crearInternacionSchema.safeParse({ motivo: '' }).success).toBe(false);
    expect(crearInternacionSchema.safeParse({ motivo: 'Gastroenteritis aguda' }).success).toBe(
      true,
    );
  });

  it('el parte de evolución rechaza una temperatura fuera de rango', () => {
    expect(evolucionSchema.safeParse({ nota: 'Estable', temperatura: '80' }).success).toBe(false);
    expect(evolucionSchema.safeParse({ nota: 'Estable', temperatura: '38.5' }).success).toBe(true);
    expect(evolucionSchema.safeParse({ nota: 'Estable', temperatura: '' }).success).toBe(true);
  });

  it('un cargo manual exige monto mayor a cero', () => {
    expect(
      cargoManualSchema.safeParse({ concepto: 'Día de internación', monto: '0' }).success,
    ).toBe(false);
    expect(
      cargoManualSchema.safeParse({ concepto: 'Día de internación', monto: '4500' }).success,
    ).toBe(true);
  });

  it('el pago valida el medio', () => {
    expect(pagoInternacionSchema.safeParse({ monto: '1000', medio: 'efectivo' }).success).toBe(
      true,
    );
    expect(pagoInternacionSchema.safeParse({ monto: '1000', medio: 'cheque' }).success).toBe(false);
  });
});
