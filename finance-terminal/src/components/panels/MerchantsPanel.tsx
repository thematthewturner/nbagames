import React, { useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { MerchantSummary, Transaction } from '../../types';
import { fmt$ } from '../../utils/stats';

interface MerchantsPanelProps {
  merchantSummaries: MerchantSummary[];
  filteredTransactions: Transaction[];
}

type SortKey = 'total' | 'count' | 'avgPerTransaction' | 'transactionsPerMonth' | 'trend';

// Mini sparkline for each merchant
const Sparkline: React.FC<{ merchant: string; transactions: Transaction[] }> = ({ merchant, transactions }) => {
  const byMonth: Record<string, number> = {};
  for (const t of transactions) {
    if (t.merchant !== merchant || t.amount >= 0) continue;
    const mo = t.date.toISOString().substring(0, 7);
    byMonth[mo] = (byMonth[mo] || 0) + Math.abs(t.amount);
  }
  const data = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({ v }));

  if (data.length < 2) return <span className="text-dim">—</span>;

  return (
    <div style={{ width: 60, height: 22, display: 'inline-block' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line dataKey="v" stroke="#00aaff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MerchantsPanel: React.FC<MerchantsPanelProps> = ({
  merchantSummaries,
  filteredTransactions,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const sorted = [...merchantSummaries]
    .sort((a, b) => sortDir * (a[sortKey] - b[sortKey]))
    .slice(0, 20);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(-1); }
  };

  const th = (key: SortKey, label: string) => (
    <th
      className={`text-right cursor-pointer hover:text-green ${sortKey === key ? 'text-green' : ''}`}
      onClick={() => handleSort(key)}
    >
      {label} {sortKey === key ? (sortDir === -1 ? '▼' : '▲') : ''}
    </th>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 pt-2 pb-1 flex items-center gap-3">
        <span className="text-dim text-xs">TOP 20 MERCHANTS</span>
        <span className="text-dim text-xs">|</span>
        <span className="badge badge-red text-xs">
          {merchantSummaries.filter(m => m.flagged).length} FLAGGED ↑20%
        </span>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2">
        <table className="table-terminal">
          <thead>
            <tr>
              <th>MERCHANT</th>
              <th>CATEGORY</th>
              {th('total', 'TOTAL')}
              {th('count', 'TXN')}
              {th('avgPerTransaction', 'AVG/TXN')}
              {th('transactionsPerMonth', 'TXN/MO')}
              {th('trend', 'TREND')}
              <th className="text-right">SPARKLINE</th>
              <th className="text-right">FLAG</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <tr key={m.merchant}>
                <td className="text-amber max-w-xs truncate" style={{ maxWidth: 140 }}>{m.merchant}</td>
                <td className="text-dim text-xs">{m.category}</td>
                <td className="text-right negative">{fmt$(m.total)}</td>
                <td className="text-right text-muted">{m.count}</td>
                <td className="text-right text-muted">{fmt$(m.avgPerTransaction)}</td>
                <td className="text-right text-dim">{m.transactionsPerMonth.toFixed(1)}</td>
                <td className={`text-right ${m.trend > 5 ? 'negative' : m.trend < -5 ? 'positive' : 'text-dim'}`}>
                  {m.trend > 5 ? '▲' : m.trend < -5 ? '▼' : '→'} {fmt$(Math.abs(m.trend))}
                </td>
                <td className="text-right">
                  <Sparkline merchant={m.merchant} transactions={filteredTransactions} />
                </td>
                <td className="text-right">
                  {m.flagged && (
                    <span className="badge badge-red">+{((m.recentSpend / (m.previousSpend || 1) - 1) * 100).toFixed(0)}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
