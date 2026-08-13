import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TurnosPorDia } from './api.js';

/**
 * Turnos por día, apilados por estado.
 *
 * Apilado y no líneas separadas: lo que la clínica mira es el alto total de la
 * barra —cuánto trabajo hubo ese día— y recién después cómo se reparte. Cuatro
 * líneas cruzándose contestan peor esa pregunta.
 */
export function GraficoTurnos({ datos }: { datos: TurnosPorDia[] }) {
  const puntos = datos.map((d) => ({
    // Sólo día y mes: con treinta barras la fecha completa no entra.
    dia: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
    Atendidos: d.atendidos,
    Confirmados: d.confirmados,
    Solicitados: d.solicitados,
    Ausentes: d.ausentes,
    Cancelados: d.cancelados,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={puntos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Atendidos" stackId="t" fill="#00483d" />
          <Bar dataKey="Confirmados" stackId="t" fill="#008573" />
          <Bar dataKey="Solicitados" stackId="t" fill="#7edac8" />
          <Bar dataKey="Ausentes" stackId="t" fill="#ae4380" />
          <Bar dataKey="Cancelados" stackId="t" fill="#cbd5e1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
