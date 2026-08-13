import { formatearFechaCivil } from '@ojosdecielo/core';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PesoRegistro } from './api.js';

/**
 * Evolución del peso.
 *
 * Grafica los dos orígenes en la misma línea pero con puntos distintos: lo
 * medido en la clínica lleva un punto lleno, lo reportado por el tutor uno
 * hueco. La curva es una sola porque la historia del animal es una sola.
 */
export function GraficoPeso({ pesos }: { pesos: PesoRegistro[] }) {
  // Un peso descartado por el profesional no entra en la curva: es el punto de
  // haberlo descartado.
  const vigentes = pesos.filter((p) => !p.descartado_en);
  if (vigentes.length < 2) return null;

  const datos = vigentes.map((p) => ({
    fecha: p.fecha,
    peso: Number(p.peso_kg),
    esClinica: p.origen === 'clinica',
  }));

  const valores = datos.map((d) => d.peso);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  // Un margen del 10% evita que la curva toque los bordes y que una variación
  // chica se vea como un salto dramático.
  const margen = Math.max((max - min) * 0.1, 0.2);

  return (
    <div className="mt-4 h-48 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {/* Sin margen izquierdo negativo: recortaba el primer dígito de las
            etiquetas del eje Y, y "13.62" se leía "3.62". */}
        <LineChart data={datos} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="fecha"
            tickFormatter={(v: string) => formatearFechaCivil(v).slice(0, 5)}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[Number((min - margen).toFixed(1)), Number((max + margen).toFixed(1))]}
            tickFormatter={(v: number) => v.toFixed(1)}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            formatter={(v) => [`${String(v)} kg`, 'Peso']}
            labelFormatter={(v) => formatearFechaCivil(String(v))}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 13,
            }}
          />
          <Line
            type="monotone"
            dataKey="peso"
            stroke="var(--color-marca-600, #008573)"
            strokeWidth={2}
            dot={<PuntoOrigen />}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface PropsPunto {
  cx?: number;
  cy?: number;
  payload?: { esClinica: boolean };
}

/** Punto lleno para la clínica, hueco para lo reportado por el tutor. */
function PuntoOrigen({ cx, cy, payload }: PropsPunto) {
  if (cx === undefined || cy === undefined) return null;
  const esClinica = payload?.esClinica ?? false;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={esClinica ? 'var(--color-marca-600, #008573)' : '#ffffff'}
      stroke="var(--color-marca-600, #008573)"
      strokeWidth={2}
    />
  );
}
