import { useMemo } from 'react';
import type { Transaction } from '../types';
import { rollingMean, rollingStddev, ema } from '../utils/stats';

interface DailyPoint {
  date: string;
  spend: number;
  income: number;
  net: number;
}

interface RollingResult {
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
}

export function useRollingCalc(transactions: Transaction[], useEMA: boolean = false) {
  const dailyData = useMemo((): DailyPoint[] => {
    const byDay: Record<string, { spend: number; income: number }> = {};

    for (const t of transactions) {
      const key = t.date.toISOString().split('T')[0];
      if (!byDay[key]) byDay[key] = { spend: 0, income: 0 };
      if (t.amount < 0) {
        byDay[key].spend += Math.abs(t.amount);
      } else {
        byDay[key].income += t.amount;
      }
    }

    // Fill in missing days with zeros for continuity
    const keys = Object.keys(byDay).sort();
    if (keys.length === 0) return [];

    const start = new Date(keys[0]);
    const end = new Date(keys[keys.length - 1]);
    const result: DailyPoint[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      const vals = byDay[key] || { spend: 0, income: 0 };
      result.push({
        date: key,
        spend: vals.spend,
        income: vals.income,
        net: vals.income - vals.spend,
      });
    }

    return result;
  }, [transactions]);

  const rollingData = useMemo((): RollingResult[] => {
    const spends = dailyData.map(d => d.spend);
    const incomes = dailyData.map(d => d.income);

    const roll7 = rollingMean(spends, 7);
    const roll30 = rollingMean(spends, 30);
    const roll90 = rollingMean(spends, 90);
    const roll30Inc = rollingMean(incomes, 30);
    const roll30Std = rollingStddev(spends, 30);
    const ema30 = ema(spends, 2 / (30 + 1)); // EMA with span=30

    return dailyData.map((d, i) => {
      const savRate = roll30Inc[i] && roll30[i] !== null
        ? ((roll30Inc[i]! - roll30[i]!) / roll30Inc[i]!) * 100
        : null;

      const center = roll30[i];
      const sigma = roll30Std[i];

      return {
        ...d,
        roll7Spend: roll7[i],
        roll30Spend: roll30[i],
        roll90Spend: roll90[i],
        roll30Income: roll30Inc[i],
        rollingSavingsRate: savRate,
        ema30Spend: useEMA ? ema30[i] : null,
        bollUpper: center !== null && sigma !== null ? center + sigma : null,
        bollLower: center !== null && sigma !== null ? Math.max(0, center - sigma) : null,
      };
    });
  }, [dailyData, useEMA]);

  // Aggregate to monthly for cleaner chart rendering when date range is large
  const monthlyRolling = useMemo(() => {
    const byMonth: Record<string, number[]> = {};
    for (const d of dailyData) {
      const mo = d.date.substring(0, 7);
      if (!byMonth[mo]) byMonth[mo] = [];
      byMonth[mo].push(d.spend);
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([mo, vals]) => ({
      month: mo,
      avgDailySpend: vals.reduce((a, b) => a + b, 0) / vals.length,
      totalSpend: vals.reduce((a, b) => a + b, 0),
    }));
  }, [dailyData]);

  return { dailyData, rollingData, monthlyRolling };
}
