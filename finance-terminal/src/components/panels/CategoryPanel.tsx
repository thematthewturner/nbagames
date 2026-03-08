import React, { useState, useMemo } from 'react';
import {
  Treemap, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import type { Transaction, CategorySummary } from '../../types';
import { fmt$, fmtPct } from '../../utils/stats';

const COLORS = [
  '#00ff88', '#ffb300', '#00aaff', '#ff4444', '#aa44ff',
  '#ff6644', '#44ffcc', '#ffdd00', '#ff44aa', '#44aaff',
  '#88ff00', '#ff8844', '#00ffcc', '#ffaa44', '#4488ff',
];

interface CategoryPanelProps {
  filteredTransactions: Transaction[];
  categorySummaries: CategorySummary[];
  onDrill: (category: string | null) => void;
  drillCategory: string | null;
}

// Custom treemap content renderer
const TreemapContent = (props: any) => {
  const { x, y, width, height, name, fill, value } = props;
  if (width < 30 || height < 20) return <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#0a0a0a', strokeWidth: 2 }} />;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#0a0a0a', strokeWidth: 2 }} />
      <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#000" fontSize={Math.min(12, width / 8)} fontWeight="bold">
        {name?.length > width / 7 ? name.substring(0, Math.floor(width / 7)) + '…' : name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="#000" fontSize={Math.min(10, width / 9)}>
        {fmt$(value)}
      </text>
    </g>
  );
};

export const CategoryPanel: React.FC<CategoryPanelProps> = ({
  filteredTransactions,
  categorySummaries,
  onDrill,
  drillCategory,
}) => {
  const [view, setView] = useState<'treemap' | 'stacked' | 'table'>('treemap');

  // Treemap data (current month or full period expenses)
  const treemapData = useMemo(() => {
    return categorySummaries
      .filter(c => c.category !== 'Income' && c.category !== 'Transfer')
      .map((c, i) => ({
        name: c.category,
        value: Math.round(c.total),
        fill: COLORS[i % COLORS.length],
      }));
  }, [categorySummaries]);

  // Stacked area: monthly spend by category
  const stackedData = useMemo(() => {
    const byMonth: Record<string, Record<string, number>> = {};
    for (const t of filteredTransactions) {
      if (t.amount >= 0) continue;
      const mo = t.date.toISOString().substring(0, 7);
      if (!byMonth[mo]) byMonth[mo] = {};
      byMonth[mo][t.category] = (byMonth[mo][t.category] || 0) + Math.abs(t.amount);
    }

    const categories = categorySummaries
      .filter(c => c.category !== 'Income' && c.category !== 'Transfer')
      .slice(0, 8)
      .map(c => c.category);

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cats]) => ({
        month: month.substring(5),
        ...Object.fromEntries(categories.map(cat => [cat, cats[cat] || 0])),
      }));
  }, [filteredTransactions, categorySummaries]);

  // Merchant drill-down
  const merchantBreakdown = useMemo(() => {
    if (!drillCategory) return [];
    const byMerchant: Record<string, number> = {};
    for (const t of filteredTransactions) {
      if (t.category === drillCategory && t.amount < 0) {
        byMerchant[t.merchant] = (byMerchant[t.merchant] || 0) + Math.abs(t.amount);
      }
    }
    return Object.entries(byMerchant)
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTransactions, drillCategory]);

  const topCategories = categorySummaries
    .filter(c => c.category !== 'Income' && c.category !== 'Transfer')
    .slice(0, 8);

  const slopeArrow = (slope: number) => slope > 1 ? '▲' : slope < -1 ? '▼' : '→';
  const slopeClass = (slope: number) => slope > 5 ? 'negative' : slope < -5 ? 'positive' : 'neutral';

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex gap-1 px-2 pt-2">
        {(['treemap', 'stacked', 'table'] as const).map(v => (
          <button
            key={v}
            className={`btn-terminal text-xs ${view === v ? 'active' : ''}`}
            onClick={() => setView(v)}
          >
            {v.toUpperCase()}
          </button>
        ))}
        {drillCategory && (
          <button className="btn-terminal text-xs text-amber ml-2" onClick={() => onDrill(null)}>
            ← {drillCategory}
          </button>
        )}
      </div>

      {drillCategory ? (
        <div className="px-2 pb-2 overflow-auto flex-1">
          <div className="text-xs text-dim mb-2 px-1">MERCHANT BREAKDOWN — {drillCategory.toUpperCase()}</div>
          <table className="table-terminal">
            <thead>
              <tr>
                <th>MERCHANT</th>
                <th className="text-right">TOTAL</th>
                <th className="text-right">% OF CAT</th>
              </tr>
            </thead>
            <tbody>
              {merchantBreakdown.map(m => {
                const catTotal = merchantBreakdown.reduce((s, x) => s + x.total, 0);
                return (
                  <tr key={m.merchant}>
                    <td className="text-muted">{m.merchant}</td>
                    <td className="text-right negative">{fmt$(m.total)}</td>
                    <td className="text-right text-dim">{fmtPct((m.total / catTotal) * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {view === 'treemap' && (
            <div className="flex-1 min-h-0 px-2" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  content={<TreemapContent />}
                  onClick={(d: any) => d?.name && onDrill(d.name)}
                >
                  <Tooltip formatter={(v: any) => [fmt$(Number(v)), 'Total Spend']} contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 11 }} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}

          {view === 'stacked' && (
            <div className="flex-1 min-h-0 px-2" style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stackedData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: any, name: any) => [fmt$(Number(v)), name]}
                    contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
                  {topCategories.map((cat, i) => (
                    <Area
                      key={cat.category}
                      type="monotone"
                      dataKey={cat.category}
                      stackId="1"
                      stroke={COLORS[i % COLORS.length]}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={0.7}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {view === 'table' && (
            <div className="flex-1 overflow-auto px-2 pb-2">
              <table className="table-terminal">
                <thead>
                  <tr>
                    <th>CATEGORY</th>
                    <th className="text-right">TOTAL</th>
                    <th className="text-right">AVG</th>
                    <th className="text-right">MED</th>
                    <th className="text-right">STDEV</th>
                    <th className="text-right">MIN</th>
                    <th className="text-right">MAX</th>
                    <th className="text-right">% TOT</th>
                    <th className="text-right">TREND</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySummaries
                    .filter(c => c.category !== 'Income' && c.category !== 'Transfer')
                    .map(c => (
                      <tr key={c.category} className="cursor-pointer" onClick={() => onDrill(c.category)}>
                        <td className="text-amber hover:text-green">{c.category}</td>
                        <td className="text-right negative">{fmt$(c.total)}</td>
                        <td className="text-right text-muted">{fmt$(c.avg)}</td>
                        <td className="text-right text-muted">{fmt$(c.median)}</td>
                        <td className="text-right text-dim">{fmt$(c.stddev)}</td>
                        <td className="text-right text-dim">{fmt$(c.min)}</td>
                        <td className="text-right text-dim">{fmt$(c.max)}</td>
                        <td className="text-right text-muted">{fmtPct(c.pctOfTotal)}</td>
                        <td className={`text-right ${slopeClass(c.slope)}`}>{slopeArrow(c.slope)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
