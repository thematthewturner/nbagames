import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import type { MonthlyPnL } from '../../types';
import { fmt$, fmtPct } from '../../utils/stats';

interface PnLPanelProps {
  monthlyPnL: MonthlyPnL[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-gray-700 p-2 text-xs">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt$(p.value)}
        </div>
      ))}
    </div>
  );
};

function getTrailingStats(data: MonthlyPnL[], months: number) {
  const slice = data.slice(-months);
  if (slice.length === 0) return null;
  const income = slice.reduce((s, m) => s + m.income, 0);
  const expenses = slice.reduce((s, m) => s + m.expenses, 0);
  const net = income - expenses;
  const avgSavings = slice.reduce((s, m) => s + m.savingsRate, 0) / slice.length;
  return { income, expenses, net, avgSavings, months: slice.length };
}

export const PnLPanel: React.FC<PnLPanelProps> = ({ monthlyPnL }) => {
  const [trailing, setTrailing] = useState<3 | 6 | 12>(6);

  const chartData = monthlyPnL.slice(-trailing).map((m, i, arr) => {
    const prev = arr[i - 1];
    const momNet = prev ? m.net - prev.net : 0;
    return {
      month: m.month.substring(5), // MM
      fullMonth: m.month,
      income: m.income,
      expenses: m.expenses,
      net: m.net,
      savingsRate: m.savingsRate,
      momDelta: momNet,
    };
  });

  const stats3 = getTrailingStats(monthlyPnL, 3);
  const stats6 = getTrailingStats(monthlyPnL, 6);
  const stats12 = getTrailingStats(monthlyPnL, 12);

  const deltaArrow = (v: number) => v >= 0 ? '▲' : '▼';
  const deltaClass = (v: number) => v >= 0 ? 'positive' : 'negative';

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Trailing selector */}
      <div className="flex gap-1 px-2 pt-2">
        {([3, 6, 12] as const).map(n => (
          <button
            key={n}
            className={`btn-terminal text-xs ${trailing === n ? 'active' : ''}`}
            onClick={() => setTrailing(n)}
          >
            {n}M
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="flex-1 min-h-0 px-2" style={{ minHeight: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
            <ReferenceLine y={0} stroke="#333" />
            <Bar dataKey="income" name="Income" fill="#00ff88" opacity={0.8} radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#ff4444" opacity={0.8} radius={[2, 2, 0, 0]} />
            <Bar dataKey="net" name="Net" fill="#ffb300" opacity={0.9} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="px-2 pb-2 overflow-auto" style={{ maxHeight: 200 }}>
        <table className="table-terminal">
          <thead>
            <tr>
              <th>PERIOD</th>
              <th className="text-right">INCOME</th>
              <th className="text-right">EXPENSES</th>
              <th className="text-right">NET</th>
              <th className="text-right">SAV RATE</th>
            </tr>
          </thead>
          <tbody>
            {[stats3, stats6, stats12].map((s, i) => {
              if (!s) return null;
              const labels = ['3M', '6M', '12M'];
              return (
                <tr key={i}>
                  <td className="text-muted">{labels[i]}</td>
                  <td className="text-right positive">{fmt$(s.income)}</td>
                  <td className="text-right negative">{fmt$(s.expenses)}</td>
                  <td className={`text-right ${s.net >= 0 ? 'positive' : 'negative'}`}>{fmt$(s.net)}</td>
                  <td className={`text-right ${s.avgSavings >= 15 ? 'positive' : s.avgSavings >= 5 ? 'neutral' : 'negative'}`}>
                    {fmtPct(s.avgSavings)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Month-by-month detail */}
        <table className="table-terminal mt-2">
          <thead>
            <tr>
              <th>MONTH</th>
              <th className="text-right">INCOME</th>
              <th className="text-right">EXPENSES</th>
              <th className="text-right">NET</th>
              <th className="text-right">SAV%</th>
              <th className="text-right">MOM Δ</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map(m => (
              <tr key={m.fullMonth}>
                <td className="text-muted">{m.fullMonth}</td>
                <td className="text-right positive">{fmt$(m.income)}</td>
                <td className="text-right negative">{fmt$(m.expenses)}</td>
                <td className={`text-right ${m.net >= 0 ? 'positive' : 'negative'}`}>{fmt$(m.net)}</td>
                <td className={`text-right ${m.savingsRate >= 15 ? 'positive' : m.savingsRate >= 5 ? 'neutral' : 'negative'}`}>
                  {fmtPct(m.savingsRate)}
                </td>
                <td className={`text-right ${deltaClass(m.momDelta)}`}>
                  <span>{deltaArrow(m.momDelta)} {fmt$(Math.abs(m.momDelta))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
