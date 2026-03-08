import React, { useMemo, useState } from 'react';
import type { Transaction, AnomalyAlert } from '../../types';
import { mean, stddev, zScore, fmt$ } from '../../utils/stats';

interface AnomalyPanelProps {
  filteredTransactions: Transaction[];
}

function detectAnomalies(transactions: Transaction[]): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  // Group expenses by category
  const byCat: Record<string, Transaction[]> = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (!byCat[t.category]) byCat[t.category] = [];
    byCat[t.category].push(t);
  }

  // Z-score flagging: transactions >2σ from category mean
  for (const [cat, txns] of Object.entries(byCat)) {
    const amounts = txns.map(t => Math.abs(t.amount));
    const m = mean(amounts);
    const sd = stddev(amounts);
    if (sd === 0) continue;

    for (const t of txns) {
      const z = zScore(Math.abs(t.amount), m, sd);
      if (Math.abs(z) >= 2) {
        const severity: AnomalyAlert['severity'] = Math.abs(z) >= 3 ? 'high' : Math.abs(z) >= 2.5 ? 'medium' : 'low';
        alerts.push({
          id: `zscore-${t.date.getTime()}-${t.merchant}`,
          transaction: t,
          type: 'zscore',
          severity,
          message: `${t.merchant}: ${fmt$(Math.abs(t.amount))} is ${z.toFixed(1)}σ above ${cat} mean (${fmt$(m)})`,
          zScore: z,
        });
      }
    }
  }

  // Month-over-month category spikes (>1.5x prior 3-month avg)
  const byMonthCat: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const mo = t.date.toISOString().substring(0, 7);
    if (!byMonthCat[mo]) byMonthCat[mo] = {};
    byMonthCat[mo][t.category] = (byMonthCat[mo][t.category] || 0) + Math.abs(t.amount);
  }

  const months = Object.keys(byMonthCat).sort();
  for (let i = 3; i < months.length; i++) {
    const currentMo = months[i];
    const prior3 = months.slice(i - 3, i);
    const categories = Object.keys(byMonthCat[currentMo]);

    for (const cat of categories) {
      const currentAmt = byMonthCat[currentMo][cat];
      const priorAmts = prior3.map(mo => byMonthCat[mo]?.[cat] || 0);
      const priorAvg = mean(priorAmts);

      if (priorAvg > 50 && currentAmt > priorAvg * 1.5) {
        const ratio = currentAmt / priorAvg;
        const severity: AnomalyAlert['severity'] = ratio >= 2 ? 'high' : ratio >= 1.7 ? 'medium' : 'low';
        // Find the largest transaction in this category/month as representative
        const catTxns = transactions.filter(t =>
          t.category === cat &&
          t.date.toISOString().substring(0, 7) === currentMo &&
          t.amount < 0
        );
        if (catTxns.length === 0) continue;
        const repTxn = catTxns.sort((a, b) => a.amount - b.amount)[0];

        alerts.push({
          id: `spike-${currentMo}-${cat}`,
          transaction: repTxn,
          type: 'spike',
          severity,
          message: `${cat} in ${currentMo}: ${fmt$(currentAmt)} (+${((ratio - 1) * 100).toFixed(0)}% vs 3-mo avg of ${fmt$(priorAvg)})`,
        });
      }
    }
  }

  // Sort by severity then date
  const sevOrder = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) =>
    sevOrder[a.severity] - sevOrder[b.severity] ||
    b.transaction.date.getTime() - a.transaction.date.getTime()
  );
}

export const AnomalyPanel: React.FC<AnomalyPanelProps> = ({ filteredTransactions }) => {
  const [filter, setFilter] = useState<'all' | 'zscore' | 'spike'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const alerts = useMemo(() => detectAnomalies(filteredTransactions), [filteredTransactions]);

  const filtered = alerts
    .filter(a => filter === 'all' || a.type === filter)
    .filter(a => severityFilter === 'all' || a.severity === severityFilter);

  const sevClass = (s: AnomalyAlert['severity']) => ({
    high: 'badge-red',
    medium: 'badge-amber',
    low: 'badge-green',
  }[s]);

  const counts = {
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 pt-2 flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {(['all', 'zscore', 'spike'] as const).map(f => (
            <button key={f} className={`btn-terminal text-xs ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'zscore' ? 'Z-SCORE' : f === 'spike' ? 'SPIKES' : 'ALL'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <span className={`badge ${counts.high > 0 ? 'badge-red' : ''} cursor-pointer`} onClick={() => setSeverityFilter(f => f === 'high' ? 'all' : 'high')}>
            HIGH: {counts.high}
          </span>
          <span className={`badge ${counts.medium > 0 ? 'badge-amber' : ''} cursor-pointer`} onClick={() => setSeverityFilter(f => f === 'medium' ? 'all' : 'medium')}>
            MED: {counts.medium}
          </span>
          <span className={`badge ${counts.low > 0 ? 'badge-green' : ''} cursor-pointer`} onClick={() => setSeverityFilter(f => f === 'low' ? 'all' : 'low')}>
            LOW: {counts.low}
          </span>
        </div>
        <span className="text-dim text-xs ml-auto">{filtered.length} ALERTS</span>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2 mt-2">
        {filtered.length === 0 ? (
          <div className="text-center text-dim text-xs mt-8">NO ANOMALIES DETECTED</div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(alert => (
              <div key={alert.id} className={`p-2 border-l-2 ${
                alert.severity === 'high' ? 'border-red-500 bg-red-950/10' :
                alert.severity === 'medium' ? 'border-amber-500 bg-amber-950/10' :
                'border-green-500 bg-green-950/10'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`badge ${sevClass(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="text-dim text-xs">{alert.type === 'zscore' ? 'Z-SCORE' : 'SPIKE'}</span>
                      <span className="text-dim text-xs">
                        {alert.transaction.date.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-muted">{alert.message}</div>
                  </div>
                  <div className={`text-xs font-bold ${alert.transaction.amount < 0 ? 'negative' : 'positive'}`}>
                    {fmt$(Math.abs(alert.transaction.amount))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
