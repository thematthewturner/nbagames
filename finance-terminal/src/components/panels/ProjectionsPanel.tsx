import React, { useState } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { MonthlyPnL } from '../../types';
import { useProjections } from '../../hooks/useProjections';
import { useMonteCarlo } from '../../hooks/useMonteCarlo';
import { fmt$ } from '../../utils/stats';

interface ProjectionsPanelProps {
  monthlyPnL: MonthlyPnL[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-gray-700 p-2 text-xs">
      <div className="text-muted mb-1">{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke || p.fill }} className="flex justify-between gap-3">
          <span>{p.name}:</span><span>{fmt$(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export const ProjectionsPanel: React.FC<ProjectionsPanelProps> = ({ monthlyPnL }) => {
  const [view, setView] = useState<'projection' | 'montecarlo' | 'seasonal'>('projection');
  const [incomeAdj, setIncomeAdj] = useState(0); // % adjustment
  const [expenseAdj, setExpenseAdj] = useState(0);

  const avgIncome = monthlyPnL.length > 0
    ? monthlyPnL.reduce((s, m) => s + m.income, 0) / monthlyPnL.length : 0;
  const avgExpense = monthlyPnL.length > 0
    ? monthlyPnL.reduce((s, m) => s + m.expenses, 0) / monthlyPnL.length : 0;

  const incomeAdjAmt = avgIncome * (incomeAdj / 100);
  const expenseAdjAmt = avgExpense * (expenseAdj / 100);

  const { projections, seasonal } = useProjections(monthlyPnL, incomeAdjAmt, expenseAdjAmt);
  const { monteCarloData } = useMonteCarlo(monthlyPnL, 12, 1000);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const seasonalData = Object.entries(seasonal)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([mo, val]) => ({
      month: MONTH_NAMES[parseInt(mo)],
      seasonal: val,
    }));

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex gap-1 px-2 pt-2 flex-wrap items-center">
        {(['projection', 'montecarlo', 'seasonal'] as const).map(v => (
          <button
            key={v}
            className={`btn-terminal text-xs ${view === v ? 'active' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'montecarlo' ? 'MONTE CARLO' : v.toUpperCase()}
          </button>
        ))}
      </div>

      {view === 'projection' && (
        <>
          {/* What-if sliders */}
          <div className="px-3 flex gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-dim text-xs">INCOME ADJ: <span className={incomeAdj >= 0 ? 'positive' : 'negative'}>{incomeAdj > 0 ? '+' : ''}{incomeAdj}%</span></span>
              <input
                type="range" min="-50" max="50" value={incomeAdj}
                onChange={e => setIncomeAdj(parseInt(e.target.value))}
                className="w-28 accent-green-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-dim text-xs">EXPENSE ADJ: <span className={expenseAdj <= 0 ? 'positive' : 'negative'}>{expenseAdj > 0 ? '+' : ''}{expenseAdj}%</span></span>
              <input
                type="range" min="-50" max="50" value={expenseAdj}
                onChange={e => setExpenseAdj(parseInt(e.target.value))}
                className="w-28 accent-amber-500"
              />
            </div>
            <div className="flex gap-3 text-xs items-center">
              <span className="text-dim">Adj Net/Mo:</span>
              <span className={incomeAdjAmt - expenseAdjAmt >= 0 ? 'positive' : 'negative'}>
                {fmt$(incomeAdjAmt - expenseAdjAmt)}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-2 pb-2" style={{ minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projections.slice(-24)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                  interval={2} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
                <ReferenceLine y={0} stroke="#444" />
                {/* Uncertainty band */}
                <Area dataKey="p90" name="P90" stroke="none" fill="#00ff88" fillOpacity={0.05} legendType="none" />
                <Area dataKey="p10" name="P10" stroke="none" fill="#0a0a0a" fillOpacity={1} legendType="none" />
                <Area dataKey="p75" name="P75" stroke="none" fill="#00ff88" fillOpacity={0.1} legendType="none" />
                <Area dataKey="p25" name="P25" stroke="none" fill="#0a0a0a" fillOpacity={1} legendType="none" />
                <Line dataKey="p90" stroke="#00ff88" strokeWidth={1} strokeDasharray="3 3" dot={false} name="P90" connectNulls />
                <Line dataKey="p75" stroke="#00ff88" strokeWidth={1} strokeDasharray="2 2" dot={false} name="P75" connectNulls />
                <Line dataKey="p50" stroke="#00ff88" strokeWidth={2} dot={false} name="P50 (Median)" connectNulls />
                <Line dataKey="p25" stroke="#ffb300" strokeWidth={1} strokeDasharray="2 2" dot={false} name="P25" connectNulls />
                <Line dataKey="p10" stroke="#ff4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="P10" connectNulls />
                <Line dataKey="actual" stroke="#ffffff" strokeWidth={2} dot={false} name="Actual" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {view === 'montecarlo' && (
        <div className="flex-1 min-h-0 px-2 pb-2" style={{ minHeight: 200 }}>
          <div className="text-xs text-dim px-1 mb-1">1000-ITERATION MONTE CARLO BALANCE SIMULATION (12 MONTHS)</div>
          <ResponsiveContainer width="100%" height="88%">
            <ComposedChart data={monteCarloData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
              <ReferenceLine y={0} stroke="#ff4444" strokeDasharray="4 2" label={{ value: '$ 0', fill: '#ff4444', fontSize: 9 }} />

              <Area dataKey="p90" name="P90" fill="#00ff88" stroke="none" fillOpacity={0.06} legendType="none" />
              <Area dataKey="p10" name="P10" fill="#0a0a0a" stroke="none" fillOpacity={1} legendType="none" />
              <Area dataKey="p75" name="P75" fill="#00ff88" stroke="none" fillOpacity={0.1} legendType="none" />
              <Area dataKey="p25" name="P25" fill="#0a0a0a" stroke="none" fillOpacity={1} legendType="none" />

              <Line dataKey="p90" stroke="#00ff88" strokeWidth={1} strokeDasharray="4 2" dot={false} name="P90" />
              <Line dataKey="p75" stroke="#44ffaa" strokeWidth={1} dot={false} name="P75" />
              <Line dataKey="p50" stroke="#ffffff" strokeWidth={2.5} dot={false} name="P50 (Median)" />
              <Line dataKey="p25" stroke="#ffb300" strokeWidth={1} dot={false} name="P25" />
              <Line dataKey="p10" stroke="#ff4444" strokeWidth={1} strokeDasharray="4 2" dot={false} name="P10" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === 'seasonal' && (
        <div className="flex-1 min-h-0 px-2 pb-2" style={{ minHeight: 200 }}>
          <div className="text-xs text-dim px-1 mb-1">ESTIMATED SEASONAL COMPONENT (NET CASH FLOW DEVIATION FROM TREND)</div>
          <ResponsiveContainer width="100%" height="80%">
            <ComposedChart data={seasonalData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => fmt$(v)} />
              <Tooltip formatter={(v: any) => [fmt$(Number(v)), 'Seasonal Component']} contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#444" />
              <Area dataKey="seasonal" stroke="#00aaff" fill="#00aaff" fillOpacity={0.2}
                name="Seasonal" dot={{ fill: '#00aaff', r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-4 gap-1 text-xs px-1">
            {seasonalData.map(d => (
              <div key={d.month} className="flex justify-between">
                <span className="text-dim">{d.month}:</span>
                <span className={d.seasonal >= 0 ? 'positive' : 'negative'}>{fmt$(d.seasonal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
