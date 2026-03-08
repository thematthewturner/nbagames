import React, { useMemo, useState } from 'react';
import type { Transaction } from '../../types';
import { fmt$ } from '../../utils/stats';

interface HeatmapPanelProps {
  filteredTransactions: Transaction[];
}

type Mode = 'net' | 'spend' | 'income';

function getDayData(transactions: Transaction[], mode: Mode): Record<string, number> {
  const byDay: Record<string, number> = {};
  for (const t of transactions) {
    const key = t.date.toISOString().split('T')[0];
    if (!byDay[key]) byDay[key] = 0;
    if (mode === 'net') {
      byDay[key] += t.amount;
    } else if (mode === 'spend' && t.amount < 0) {
      byDay[key] += Math.abs(t.amount);
    } else if (mode === 'income' && t.amount > 0) {
      byDay[key] += t.amount;
    }
  }
  return byDay;
}

function colorForValue(value: number, min: number, max: number, mode: Mode): string {
  if (value === 0) return '#111';

  if (mode === 'net') {
    if (value > 0) {
      const intensity = Math.min(1, value / Math.max(max, 1));
      const g = Math.round(100 + intensity * 155);
      return `rgb(0, ${g}, ${Math.round(g * 0.5)})`;
    } else {
      const intensity = Math.min(1, Math.abs(value) / Math.max(Math.abs(min), 1));
      const r = Math.round(100 + intensity * 155);
      return `rgb(${r}, ${Math.round(r * 0.15)}, ${Math.round(r * 0.15)})`;
    }
  } else if (mode === 'spend') {
    const intensity = Math.min(1, value / Math.max(max, 1));
    const r = Math.round(80 + intensity * 175);
    return `rgb(${r}, ${Math.round(r * 0.15)}, ${Math.round(r * 0.15)})`;
  } else {
    const intensity = Math.min(1, value / Math.max(max, 1));
    const g = Math.round(80 + intensity * 175);
    return `rgb(0, ${g}, ${Math.round(g * 0.5)})`;
  }
}

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HeatmapPanel: React.FC<HeatmapPanelProps> = ({ filteredTransactions }) => {
  const [mode, setMode] = useState<Mode>('net');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; value: number } | null>(null);

  const dayData = useMemo(() => getDayData(filteredTransactions, mode), [filteredTransactions, mode]);

  // Build calendar grid
  const calendarData = useMemo(() => {
    const keys = Object.keys(dayData).sort();
    if (keys.length === 0) return { weeks: [], monthLabels: [] };

    const start = new Date(keys[0]);
    const end = new Date(keys[keys.length - 1]);

    // Start from Sunday of the week containing start
    const calStart = new Date(start);
    calStart.setDate(calStart.getDate() - calStart.getDay());

    const weeks: Array<Array<{ date: string; value: number; inRange: boolean }>> = [];
    const monthLabels: Array<{ col: number; label: string }> = [];

    let current = new Date(calStart);
    let weekIdx = 0;
    let lastMonth = -1;

    while (current <= end || current.getDay() !== 0 || weekIdx === 0) {
      if (current.getDay() === 0) {
        weeks.push([]);
        if (current.getMonth() !== lastMonth && current <= end) {
          monthLabels.push({ col: weekIdx, label: MONTH_ABBR[current.getMonth()] });
          lastMonth = current.getMonth();
        }
        weekIdx++;
      }

      const dateStr = current.toISOString().split('T')[0];
      const week = weeks[weeks.length - 1];
      if (week) {
        week.push({
          date: dateStr,
          value: dayData[dateStr] || 0,
          inRange: current >= start && current <= end,
        });
      }

      current.setDate(current.getDate() + 1);
      if (current > end && current.getDay() === 0) break;
    }

    return { weeks, monthLabels };
  }, [dayData]);

  const allValues = Object.values(dayData);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, -1);

  const CELL_SIZE = 11;
  const CELL_GAP = 2;
  const stride = CELL_SIZE + CELL_GAP;

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 px-2 pt-2 pb-2 items-center">
        {(['net', 'spend', 'income'] as const).map(m => (
          <button
            key={m}
            className={`btn-terminal text-xs ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
        <div className="ml-4 flex items-center gap-2 text-xs text-dim">
          {mode === 'net' && (
            <>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1a1a1a' }} /> Zero
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#00aa55' }} /> +$
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#cc2222' }} /> -$
            </>
          )}
          {mode === 'spend' && (
            <>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1a1a1a' }} /> $0
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#cc2222' }} /> High
            </>
          )}
          {mode === 'income' && (
            <>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1a1a1a' }} /> $0
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#00aa55' }} /> High
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 pb-3">
        <div className="relative" style={{ overflowX: 'auto' }}>
          {/* Month labels */}
          <div className="flex mb-1 ml-5" style={{ gap: 0 }}>
            {calendarData.monthLabels.map((ml, i) => (
              <div
                key={i}
                className="text-dim absolute"
                style={{
                  fontSize: 9,
                  left: 20 + ml.col * stride,
                  top: 0,
                  letterSpacing: '0.05em',
                }}
              >
                {ml.label}
              </div>
            ))}
          </div>

          <div className="flex mt-4 gap-0.5">
            {/* Day labels */}
            <div className="flex flex-col mr-1" style={{ gap: CELL_GAP }}>
              {WEEK_LABELS.map((d, i) => (
                <div key={i} className="text-dim flex items-center justify-center"
                  style={{ width: 12, height: CELL_SIZE, fontSize: 8 }}>
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            {calendarData.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      borderRadius: 2,
                      background: day.inRange
                        ? colorForValue(day.value, minVal, maxVal, mode)
                        : '#0a0a0a',
                      cursor: day.inRange && day.value !== 0 ? 'pointer' : 'default',
                      border: day.inRange && day.value !== 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (day.inRange) {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltip({ x: rect.left, y: rect.top, date: day.date, value: day.value });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {tooltip && (
          <div
            className="fixed z-50 bg-black border border-gray-700 p-2 text-xs pointer-events-none"
            style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          >
            <div className="text-muted">{tooltip.date}</div>
            <div className={tooltip.value >= 0 ? 'positive' : 'negative'}>{fmt$(tooltip.value)}</div>
          </div>
        )}
      </div>
    </div>
  );
};
