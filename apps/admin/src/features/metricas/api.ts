import type { ClienteSupabase } from '@ojosdecielo/db';
import { useQuery } from '@tanstack/react-query';

export interface ResumenMetricas {
  pacientes_nuevos: number;
  consultas: number;
  turnos_atendidos: number;
  ausentismo: number;
  recetas_emitidas: number;
}

export interface TurnosPorDia {
  dia: string;
  solicitados: number;
  confirmados: number;
  atendidos: number;
  cancelados: number;
  ausentes: number;
}

export interface MetricaProfesional {
  profesional_id: string;
  profesional: string;
  atendidos: number;
  cancelados: number;
  ausentes: number;
  consultas: number;
}

export interface PacienteInactivo {
  mascota_id: string;
  mascota: string;
  especie: string;
  ultima_atencion: string | null;
  meses_sin_venir: number;
  tutor: string | null;
  telefono: string | null;
  email: string | null;
}

export interface MetricasVentas {
  facturado: number;
  ordenes: number;
  por_medio: { medio: string; monto: number }[];
  por_canal: { canal: string; monto: number; ordenes: number }[];
  productos: { producto: string; unidades: number; monto: number }[];
}

export interface Rango {
  desde: string;
  hasta: string;
}

export const clavesMetricas = {
  resumen: (r: Rango) => ['metricas-resumen', r.desde, r.hasta] as const,
  turnos: (r: Rango) => ['metricas-turnos', r.desde, r.hasta] as const,
  profesionales: (r: Rango) => ['metricas-profesionales', r.desde, r.hasta] as const,
  ventas: (r: Rango) => ['metricas-ventas', r.desde, r.hasta] as const,
  inactivos: (meses: number) => ['pacientes-inactivos', meses] as const,
};

export function useResumen(supabase: ClienteSupabase, rango: Rango) {
  return useQuery({
    queryKey: clavesMetricas.resumen(rango),
    queryFn: async (): Promise<ResumenMetricas> => {
      const { data, error } = await supabase.rpc('metricas_resumen', {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data as unknown as ResumenMetricas;
    },
  });
}

export function useTurnosPorDia(supabase: ClienteSupabase, rango: Rango) {
  return useQuery({
    queryKey: clavesMetricas.turnos(rango),
    queryFn: async (): Promise<TurnosPorDia[]> => {
      const { data, error } = await supabase.rpc('metricas_turnos', {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data as TurnosPorDia[];
    },
  });
}

export function useMetricasProfesionales(supabase: ClienteSupabase, rango: Rango) {
  return useQuery({
    queryKey: clavesMetricas.profesionales(rango),
    queryFn: async (): Promise<MetricaProfesional[]> => {
      const { data, error } = await supabase.rpc('metricas_profesionales', {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data as MetricaProfesional[];
    },
  });
}

export function useMetricasVentas(supabase: ClienteSupabase, rango: Rango, habilitado: boolean) {
  return useQuery({
    queryKey: clavesMetricas.ventas(rango),
    // El servidor rechaza a quien no es administrador; no consultarlo siquiera
    // evita un error rojo en pantalla para recepción, que no tiene la culpa.
    enabled: habilitado,
    queryFn: async (): Promise<MetricasVentas> => {
      const { data, error } = await supabase.rpc('metricas_ventas', {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data as unknown as MetricasVentas;
    },
  });
}

export function usePacientesInactivos(supabase: ClienteSupabase, meses: number) {
  return useQuery({
    queryKey: clavesMetricas.inactivos(meses),
    queryFn: async (): Promise<PacienteInactivo[]> => {
      const { data, error } = await supabase.rpc('pacientes_inactivos', { p_meses: meses });
      if (error) throw error;
      return data as PacienteInactivo[];
    },
  });
}
