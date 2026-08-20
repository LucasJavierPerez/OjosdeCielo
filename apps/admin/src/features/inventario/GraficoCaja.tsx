import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MesCaja } from './api.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Cómo varía mes a mes, no sólo el total de cada uno.
 *
 * Tres líneas y no barras: lo que importa acá es la tendencia —¿viene
 * subiendo, se estancó?— y una línea la muestra mejor que comparar el alto de
 * columnas sueltas.
 */
export function GraficoCaja({
  etiquetaMes,
  meses,
}: {
  etiquetaMes: (mes: string) => string;
  meses: MesCaja[];
}) {
  const puntos = meses.map((m) => ({
    mes: etiquetaMes(m.mes),
    Entró: Number(m.ingresos),
    Salió: Number(m.egresos),
    Neto: Number(m.neto),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="capitalize" />
          <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => pesos(v)} />
          <Tooltip formatter={(v) => pesos(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="Entró" stroke="#008573" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Salió" stroke="#ae4380" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Neto" stroke="#00483d" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
