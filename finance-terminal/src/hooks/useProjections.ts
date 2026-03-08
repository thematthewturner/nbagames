import { useMemo } from 'react';
import type { MonthlyPnL, ProjectionPoint } from '../types';
import { linearRegression } from '../utils/stats';

/**
 * Simple seasonal decomposition:
 * Estimates seasonal component as (actual - trend) averaged per calendar month.
 */
function estimateSeasonality(monthlyPnL: MonthlyPnL[]): Record<number, number> {
  if (monthlyPnL.length < 12) return {};

  const nets = monthlyPnL.map(m => m.net);
  const idxs = monthlyPnL.map((_, i) => i);
  const reg = linearRegression(idxs, nets);

  const residualsByMonth: Record<number, number[]> = {};
  monthlyPnL.forEach((m, i) => {
    const trend = reg.intercept + reg.slope * i;
    const residual = m.net - trend;
    const calendarMonth = parseInt(m.month.split('-')[1]) - 1;
    if (!residualsByMonth[calendarMonth]) residualsByMonth[calendarMonth] = [];
    residualsByMonth[calendarMonth].push(residual);
  });

  const seasonal: Record<number, number> = {};
  for (const [mo, residuals] of Object.entries(residualsByMonth)) {
    seasonal[parseInt(mo)] = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  }
  return seasonal;
}

export function useProjections(monthlyPnL: MonthlyPnL[], incomeAdjust = 0, expenseAdjust = 0) {
  const { projections, seasonal } = useMemo(() => {
    if (monthlyPnL.length < 3) {
      return { projections: [], seasonal: {} };
    }

    const nets = monthlyPnL.map(m => m.net + incomeAdjust - expenseAdjust);
    const idxs = monthlyPnL.map((_, i) => i);
    const reg = linearRegression(idxs, nets);
    const seasonality = estimateSeasonality(monthlyPnL);

    // Historical actual points
    const actuals: ProjectionPoint[] = monthlyPnL.map(m => ({
      month: m.month,
      p10: m.net,
      p25: m.net,
      p50: m.net,
      p75: m.net,
      p90: m.net,
      actual: m.net,
    }));

    // Future 12 months
    const lastMonth = monthlyPnL[monthlyPnL.length - 1];
    const [lastYear, lastMo] = lastMonth.month.split('-').map(Number);
    const futurePoints: ProjectionPoint[] = [];

    for (let k = 1; k <= 12; k++) {
      const futureIdx = idxs.length + k - 1;
      const trendValue = reg.intercept + reg.slope * futureIdx;
      const calMo = (lastMo - 1 + k) % 12;
      const seasonalAdj = seasonality[calMo] || 0;
      const projected = trendValue + seasonalAdj;

      // Simple uncertainty: grows with sqrt(k)
      const uncertainty = Math.abs(projected) * 0.15 * Math.sqrt(k);

      let mo = lastMo - 1 + k;
      let yr = lastYear;
      while (mo > 11) { mo -= 12; yr++; }
      const monthStr = `${yr}-${String(mo + 1).padStart(2, '0')}`;

      futurePoints.push({
        month: monthStr,
        p10: projected - uncertainty * 1.5,
        p25: projected - uncertainty * 0.8,
        p50: projected,
        p75: projected + uncertainty * 0.8,
        p90: projected + uncertainty * 1.5,
      });
    }

    return {
      projections: [...actuals, ...futurePoints],
      seasonal: seasonality,
    };
  }, [monthlyPnL, incomeAdjust, expenseAdjust]);

  return { projections, seasonal };
}
