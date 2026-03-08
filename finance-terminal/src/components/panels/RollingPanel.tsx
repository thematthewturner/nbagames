import React, { useState } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { fmt$ } from '../../utils/stats';

interface RollingPanelProps {
  rollingData: Array<{
    date: string;
    spend: number;
    income: number;
    net: number;
    roll7Spend: number | null;
    roll30Spend: number | null;
    roll90Spend: number | null;
    roll30Income: number | null;
    rollingSavingsRate: number | null;
    ema30Spend: number | null;
    bollUpper: number | null;
    bollLower: number | null;
  }>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-gray-700 p-2 text-xs max-w-xs">
      <div className="text-muted mb-1">{label}</div>
      {payload.filter((p: any) => p.value !== null && p.value !== undefined).map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color || p.stroke }} className="flex justify-between gap-3">
          <span>{p.name}:</span>
          <span>{typeof p.value === 'number' ? fmt$(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export const RollingPanel: React.FC<RollingPanelProps> = ({ rollingData }) => {
  const [showEMA, setShowEMA] = useState(false);
  const [showBoll, setShowBoll] = useState(true);
  const [view, setView] = useState<'spend' | 'savings'>('spend');

  // Sample data to avoid overwhelming the chart (take every Nth point)
  const stride = Math.max(1, Math.floor(rollingData.length / 120));
  const chartData = rollingData
    .filter((_, i) => i % stride === 0)
    .map(d => ({
      ...d,
      date: d.date.substring(5), // MM-DD
    }));

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex gap-1 px-2 pt-2 flex-wrap">
        <button
          className={`btn-terminal text-xs ${view === 'spend' ? 'active' : ''}`}
          onClick={() => setView('spend')}
        >SPEND</button>
        <button
          className={`btn-terminal text-xs ${view === 'savings' ? 'active' : ''}`}
          onClick={() => setView('savings')}
        >SAVINGS RATE</button>
        <button
          className={`btn-terminal text-xs ${showBoll ? 'active btn-terminal-amber' : ''}`}
          onClick={() => setShowBoll(v => !v)}
        >BOLLINGER</button>
        <button
          className={`btn-terminal text-xs ${showEMA ? 'active btn-terminal-amber' : ''}`}
          onClick={() => setShowEMA(v => !v)}
        >EMA</button>
      </div>

      <div className="flex-1 min-h-0 px-2 pb-2" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          {view === 'spend' ? (
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                interval={Math.floor(chartData.length / 10)} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
              <ReferenceLine y={0} stroke="#333" />

              {/* Bollinger band area */}
              {showBoll && (
                <>
                  <Area dataKey="bollUpper" name="Upper Band" stroke="none" fill="#ffb300" fillOpacity={0.08} legendType="none" />
                  <Area dataKey="bollLower" name="Lower Band" stroke="none" fill="#0a0a0a" fillOpacity={1} legendType="none" />
                  <Line dataKey="bollUpper" stroke="#ffb300" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Boll +1σ" />
                  <Line dataKey="bollLower" stroke="#ffb300" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Boll -1σ" />
                </>
              )}

              <Line dataKey="roll7Spend" stroke="#00aaff" strokeWidth={1} dot={false} name="7D Roll Avg" connectNulls />
              <Line dataKey="roll30Spend" stroke="#00ff88" strokeWidth={2} dot={false} name="30D Roll Avg" connectNulls />
              <Line dataKey="roll90Spend" stroke="#ffb300" strokeWidth={1.5} dot={false} name="90D Roll Avg" connectNulls />
              {showEMA && (
                <Line dataKey="ema30Spend" stroke="#ff44aa" strokeWidth={1.5} dot={false} name="EMA-30" strokeDasharray="4 2" connectNulls />
              )}
            </ComposedChart>
          ) : (
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                interval={Math.floor(chartData.length / 10)} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
              <ReferenceLine y={20} stroke="#00ff88" strokeDasharray="4 2" label={{ value: '20% target', fill: '#00ff88', fontSize: 9 }} />
              <ReferenceLine y={0} stroke="#333" />
              <Area
                dataKey="rollingSavingsRate"
                name="Rolling Savings Rate"
                stroke="#00ff88"
                fill="#00ff88"
                fillOpacity={0.1}
                connectNulls
                dot={false}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
