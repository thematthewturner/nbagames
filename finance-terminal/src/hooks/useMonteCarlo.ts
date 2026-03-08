import { useMemo } from 'react';
import type { MonthlyPnL } from '../types';
import { monteCarlo, mean } from '../utils/stats';

export function useMonteCarlo(monthlyPnL: MonthlyPnL[], numMonths = 12, iterations = 1000) {
  const result = useMemo(() => {
    if (monthlyPnL.length < 3) return [];

    const nets = monthlyPnL.map(m => m.net);
    const startBalance = nets.reduce((a, b) => a + b, 0);

    const sim = monteCarlo(nets, startBalance, numMonths, iterations);

    const lastMonth = monthlyPnL[monthlyPnL.length - 1];
    const [lastYear, lastMo] = lastMonth.month.split('-').map(Number);

    return sim.map(point => {
      let mo = lastMo - 1 + point.month;
      let yr = lastYear;
      while (mo > 11) { mo -= 12; yr++; }
      const monthStr = `${yr}-${String(mo + 1).padStart(2, '0')}`;
      return {
        month: monthStr,
        p10: point.p10,
        p25: point.p25,
        p50: point.p50,
        p75: point.p75,
        p90: point.p90,
      };
    });
  }, [monthlyPnL, numMonths, iterations]);

  const avgMonthlyNet = useMemo(() => {
    if (monthlyPnL.length === 0) return 0;
    return mean(monthlyPnL.map(m => m.net));
  }, [monthlyPnL]);

  return { monteCarloData: result, avgMonthlyNet };
}
