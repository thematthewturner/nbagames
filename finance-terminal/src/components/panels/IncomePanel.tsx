import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import type { Transaction } from '../../types';
import { mean, stddev, coefficientOfVariation, fmt$, fmtPct } from '../../utils/stats';

interface IncomePanelProps {
  filteredTransactions: Transaction[];
}

const COLORS = ['#00ff88', '#ffb300', '#00aaff', '#ff44aa', '#aa44ff', '#ff6644'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-gray-700 p-2 text-xs">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.fill || p.color }}>
          {p.name}: {fmt$(p.value)}
        </div>
      ))}
    </div>
  );
};

export const IncomePanel: React.FC<IncomePanelProps> = ({ filteredTransactions }) => {
  const incomeTransactions = useMemo(
    () => filteredTransactions.filter(t => t.amount > 0 && t.category === 'Income'),
    [filteredTransactions]
  );

  // Income by source (merchant)
  const bySource = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const t of incomeTransactions) {
      if (!map[t.merchant]) map[t.merchant] = [];
      map[t.merchant].push(t.amount);
    }
    return Object.entries(map)
      .map(([source, amounts]) => ({
        source,
        total: amounts.reduce((a, b) => a + b, 0),
        count: amounts.length,
        avg: mean(amounts),
        sd: stddev(amounts),
        cv: coefficientOfVariation(amounts),
      }))
      .sort((a, b) => b.total - a.total);
  }, [incomeTransactions]);

  // Monthly income totals
  const monthlyIncome = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const t of incomeTransactions) {
      const mo = t.date.toISOString().substring(0, 7);
      byMonth[mo] = (byMonth[mo] || 0) + t.amount;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, income]) => ({ month: month.substring(5), income }));
  }, [incomeTransactions]);

  const totalIncome = bySource.reduce((s, x) => s + x.total, 0);
  const allMonthlyAmounts = monthlyIncome.map(m => m.income);
  const incomeCV = coefficientOfVariation(allMonthlyAmounts);
  const stabilityScore = Math.max(0, Math.round((1 - Math.min(incomeCV, 1)) * 100));

  // Rough tax estimate (25% effective rate)
  const estimatedTax = totalIncome * 0.25;
  const estimatedNet = totalIncome - estimatedTax;

  // Pie chart data
  const pieData = bySource.slice(0, 5).map(s => ({
    name: s.source.length > 20 ? s.source.substring(0, 20) + '…' : s.source,
    value: Math.round(s.total),
  }));

  return (
    <div className="h-full flex flex-col gap-2">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-0 border-b border-gray-900">
        <div className="px-4 py-2 border-r border-gray-900">
          <div className="stat-label">STABILITY SCORE</div>
          <div className={`stat-value ${stabilityScore >= 80 ? 'text-green' : stabilityScore >= 60 ? 'text-amber' : 'text-red-term'}`}>
            {stabilityScore}/100
          </div>
          <div className="text-dim text-xs mt-0.5">CV: {fmtPct(incomeCV * 100)}</div>
        </div>
        <div className="px-4 py-2 border-r border-gray-900">
          <div className="stat-label">GROSS (PERIOD)</div>
          <div className="stat-value positive">{fmt$(totalIncome)}</div>
        </div>
        <div className="px-4 py-2">
          <div className="stat-label">EST. TAX WITHHOLDING (~25%)</div>
          <div className="stat-value text-amber">{fmt$(estimatedTax)}</div>
          <div className="text-dim text-xs mt-0.5">Net: <span className="positive">{fmt$(estimatedNet)}</span></div>
        </div>
      </div>

      <div className="flex gap-2 flex-1 min-h-0 px-2 pb-2">
        {/* Monthly bar chart */}
        <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
          <div className="text-dim text-xs mb-1 pl-1">MONTHLY INCOME</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={monthlyIncome} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="income" name="Income" fill="#00ff88" opacity={0.8} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source breakdown */}
        <div style={{ width: 180 }}>
          <div className="text-dim text-xs mb-1">SOURCE MIX</div>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={50} dataKey="value" strokeWidth={0}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [fmt$(Number(v)), '']} contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1">
            {bySource.slice(0, 4).map((s, i) => (
              <div key={s.source} className="flex justify-between text-xs py-0.5">
                <span className="text-dim truncate max-w-28" style={{ color: COLORS[i % COLORS.length] }}>
                  {s.source.length > 16 ? s.source.substring(0, 16) + '…' : s.source}
                </span>
                <span className="positive ml-1">{fmtPct((s.total / totalIncome) * 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Source table */}
      <div className="px-2 pb-2 overflow-auto" style={{ maxHeight: 140 }}>
        <table className="table-terminal">
          <thead>
            <tr>
              <th>SOURCE</th>
              <th className="text-right">TOTAL</th>
              <th className="text-right">COUNT</th>
              <th className="text-right">AVG</th>
              <th className="text-right">STDEV</th>
              <th className="text-right">CV</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map(s => (
              <tr key={s.source}>
                <td className="text-amber">{s.source}</td>
                <td className="text-right positive">{fmt$(s.total)}</td>
                <td className="text-right text-dim">{s.count}</td>
                <td className="text-right text-muted">{fmt$(s.avg)}</td>
                <td className="text-right text-dim">{fmt$(s.sd)}</td>
                <td className={`text-right ${s.cv < 0.1 ? 'positive' : s.cv < 0.25 ? 'neutral' : 'negative'}`}>
                  {fmtPct(s.cv * 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
