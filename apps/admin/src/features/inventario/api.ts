import type { ClienteSupabase, Database, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Producto = Fila<'producto'>;
export type MedioPago = Database['public']['Enums']['medio_pago'];
export type TurnoCaja = Fila<'turno_caja'>;

export interface StockActual {
  producto_id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  stock_minimo: number;
  controla_lote: boolean;
  requiere_receta: boolean;
  visible_en_tienda: boolean;
  cantidad: number;
  bajo_minimo: boolean;
}

export interface Alerta {
  tipo: 'bajo_minimo' | 'vencido' | 'por_vencer';
  producto_id: string;
  producto: string;
  detalle: string;
  cantidad: number;
}

export interface ResumenCaja {
  caja_id: string;
  abierta_en: string;
  monto_inicial: number;
  efectivo: number;
  otros_medios: number;
  egresos: number;
  ventas: number;
  esperado_cajon: number;
}

export const clavesInv = {
  stock: ['stock'] as const,
  alertas: ['alertas'] as const,
  caja: ['caja'] as const,
};

export function useStock(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesInv.stock,
    queryFn: async (): Promise<StockActual[]> => {
      const { data, error } = await supabase.from('stock_actual').select('*').order('nombre');
      if (error) throw error;
      return data as unknown as StockActual[];
    },
  });
}

export function useAlertas(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesInv.alertas,
    queryFn: async (): Promise<Alerta[]> => {
      const { data, error } = await supabase.rpc('alertas_inventario');
      if (error) throw error;
      return data as Alerta[];
    },
  });
}

export function useCrearProducto(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      nombre: string;
      precio: number;
      categoria?: string;
      stock_minimo?: number;
      requiere_receta?: boolean;
      visible_en_tienda?: boolean;
      controla_lote?: boolean;
    }): Promise<Producto> => {
      const { data, error } = await supabase.from('producto').insert(p).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInv.stock }),
  });
}

export function useActualizarProducto(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string } & Partial<Producto>): Promise<void> => {
      const { error } = await supabase.from('producto').update(campos).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInv.stock }),
  });
}

export function useRegistrarMovimiento(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      productoId: string;
      tipo: 'ingreso' | 'ajuste' | 'vencimiento' | 'uso_clinico';
      cantidad: number;
      motivo?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_movimiento', {
        p_producto_id: m.productoId,
        p_tipo: m.tipo,
        p_cantidad: m.cantidad,
        ...(m.motivo?.trim() && { p_motivo: m.motivo.trim() }),
      });
      // El mensaje de la base dice cuántas unidades quedan, que es más útil
      // que un error genérico.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInv.stock });
      void qc.invalidateQueries({ queryKey: clavesInv.alertas });
    },
  });
}

// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------

export function useResumenCaja(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesInv.caja,
    queryFn: async (): Promise<ResumenCaja | null> => {
      const { data, error } = await supabase.rpc('resumen_caja');
      if (error) throw error;
      return (data as ResumenCaja[])[0] ?? null;
    },
  });
}

export function useAbrirCaja(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (montoInicial: number): Promise<void> => {
      const { error } = await supabase.rpc('abrir_caja', { p_monto_inicial: montoInicial });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInv.caja }),
  });
}

export function useCerrarCaja(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      declarado,
      notas,
    }: {
      declarado: number;
      notas?: string;
    }): Promise<TurnoCaja> => {
      const { data, error } = await supabase.rpc('cerrar_caja', {
        p_monto_declarado: declarado,
        ...(notas?.trim() && { p_notas: notas.trim() }),
      });
      if (error) throw new Error(error.message);
      return data as TurnoCaja;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInv.caja }),
  });
}

export function useMovimientoCaja(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      tipo: 'ingreso' | 'egreso';
      monto: number;
      medio: 'efectivo' | 'debito' | 'credito' | 'transferencia';
      concepto: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_movimiento_caja', {
        p_tipo: m.tipo,
        p_monto: m.monto,
        p_medio: m.medio,
        p_concepto: m.concepto,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInv.caja }),
  });
}

export interface ItemVenta {
  producto_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export function useVenderMostrador(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      medio,
    }: {
      items: ItemVenta[];
      medio: MedioPago;
    }): Promise<{ id: string; total: number }> => {
      const { data, error } = await supabase.rpc('vender_mostrador', {
        p_items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
        p_medio: medio,
      });
      if (error) throw new Error(error.message);
      return data as { id: string; total: number };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInv.stock });
      void qc.invalidateQueries({ queryKey: clavesInv.caja });
    },
  });
}

// ---------------------------------------------------------------------------
// Historial y flujo de caja
// ---------------------------------------------------------------------------

export interface CierreCaja {
  id: string;
  abierto_en: string;
  cerrado_en: string;
  abierto_por: string;
  cerrado_por: string | null;
  monto_inicial: number;
  monto_calculado: number;
  monto_declarado: number;
  diferencia: number;
  notas: string | null;
  ingresos: number;
  egresos: number;
  ventas: number;
}

export interface MesCaja {
  mes: string;
  ingresos: number;
  egresos: number;
  neto: number;
  efectivo: number;
  otros_medios: number;
  movimientos: number;
}

export function useHistorialCajas(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: ['historial-cajas'],
    queryFn: async (): Promise<CierreCaja[]> => {
      const { data, error } = await supabase.rpc('historial_cajas', { p_limite: 30 });
      if (error) throw error;
      return data as CierreCaja[];
    },
  });
}

export function useFlujoMensual(supabase: ClienteSupabase, habilitado: boolean) {
  return useQuery({
    queryKey: ['flujo-mensual'],
    // El servidor rechaza a quien no es administrador; no consultarlo siquiera
    // evita mostrarle un error a recepción, que no tiene la culpa.
    enabled: habilitado,
    queryFn: async (): Promise<MesCaja[]> => {
      const { data, error } = await supabase.rpc('flujo_caja_mensual', { p_meses: 12 });
      if (error) throw error;
      return data as MesCaja[];
    },
  });
}
