import { useState, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import type { Transaction, FilterState, DateRange, MonthlyPnL, CategorySummary, MerchantSummary } from '../types';
import { generateSeedData } from '../data/seedData';
import { mean, median, stddev, linearRegression } from '../utils/stats';

function makeDefaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  return { start, end, label: '1Y' };
}

export function useTransactions() {
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>(() => generateSeedData());
  const [filterState, setFilterState] = useState<FilterState>({
    dateRange: makeDefaultDateRange(),
    categories: [],
    accounts: [],
  });
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // All unique categories and accounts from raw data
  const allCategories = useMemo(() => {
    const cats = new Set(rawTransactions.map(t => t.category));
    return Array.from(cats).sort();
  }, [rawTransactions]);

  const allAccounts = useMemo(() => {
    const accts = new Set(rawTransactions.map(t => t.account));
    return Array.from(accts).sort();
  }, [rawTransactions]);

  // Filtered transactions based on FilterState
  const filteredTransactions = useMemo(() => {
    return rawTransactions.filter(t => {
      if (t.date < filterState.dateRange.start || t.date > filterState.dateRange.end) return false;
      if (filterState.categories.length > 0 && !filterState.categories.includes(t.category)) return false;
      if (filterState.accounts.length > 0 && !filterState.accounts.includes(t.account)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !t.merchant.toLowerCase().includes(q) &&
          !t.category.toLowerCase().includes(q) &&
          !t.note.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rawTransactions, filterState, searchQuery]);

  // Monthly P&L data
  const monthlyPnL = useMemo((): MonthlyPnL[] => {
    const byMonth: Record<string, { income: number; expenses: number }> = {};

    for (const t of filteredTransactions) {
      const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
      if (t.amount > 0) {
        byMonth[key].income += t.amount;
      } else {
        byMonth[key].expenses += Math.abs(t.amount);
      }
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { income, expenses }]) => ({
        month,
        income,
        expenses,
        net: income - expenses,
        savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
      }));
  }, [filteredTransactions]);

  // Category summaries
  const categorySummaries = useMemo((): CategorySummary[] => {
    const byCat: Record<string, number[]> = {};
    const byMonth: Record<string, Record<string, number>> = {};

    for (const t of filteredTransactions) {
      if (t.amount >= 0) continue; // expenses only
      const amt = Math.abs(t.amount);
      if (!byCat[t.category]) byCat[t.category] = [];
      byCat[t.category].push(amt);

      const mo = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[t.category]) byMonth[t.category] = {};
      byMonth[t.category][mo] = (byMonth[t.category][mo] || 0) + amt;
    }

    const totalSpend = Object.values(byCat).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0);

    return Object.entries(byCat).map(([cat, amounts]) => {
      const months = Object.entries(byMonth[cat] || {}).sort(([a], [b]) => a.localeCompare(b));
      const monthVals = months.map(([, v]) => v);
      const monthIdxs = months.map((_, i) => i);
      const reg = linearRegression(monthIdxs, monthVals);
      const total = amounts.reduce((a, b) => a + b, 0);

      return {
        category: cat,
        total,
        avg: mean(amounts),
        median: median(amounts),
        stddev: stddev(amounts),
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        count: amounts.length,
        slope: reg.slope,
        pctOfTotal: totalSpend > 0 ? (total / totalSpend) * 100 : 0,
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredTransactions]);

  // Merchant summaries
  const merchantSummaries = useMemo((): MerchantSummary[] => {
    const byMerchant: Record<string, { amounts: number[]; dates: Date[]; category: string }> = {};

    for (const t of filteredTransactions) {
      if (t.amount >= 0) continue;
      if (!byMerchant[t.merchant]) byMerchant[t.merchant] = { amounts: [], dates: [], category: t.category };
      byMerchant[t.merchant].amounts.push(Math.abs(t.amount));
      byMerchant[t.merchant].dates.push(t.date);
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return Object.entries(byMerchant).map(([merchant, { amounts, dates, category }]) => {
      const total = amounts.reduce((a, b) => a + b, 0);
      const count = amounts.length;
      const avgPerTxn = count > 0 ? total / count : 0;

      // Transactions per month
      const months = new Set(dates.map(d => `${d.getFullYear()}-${d.getMonth()}`));
      const transPerMonth = months.size > 0 ? count / months.size : 0;

      // Trend slope
      const sorted = dates.map((d, i) => ({ d, a: amounts[i] })).sort((a, b) => a.d.getTime() - b.d.getTime());
      const reg = linearRegression(sorted.map((_, i) => i), sorted.map(x => x.a));

      const recentSpend = sorted.filter(x => x.d >= threeMonthsAgo).reduce((s, x) => s + x.a, 0);
      const prevSpend = sorted.filter(x => x.d >= sixMonthsAgo && x.d < threeMonthsAgo).reduce((s, x) => s + x.a, 0);
      const flagged = prevSpend > 0 && recentSpend / prevSpend > 1.2;

      return {
        merchant,
        category,
        total,
        count,
        avgPerTransaction: avgPerTxn,
        transactionsPerMonth: transPerMonth,
        trend: reg.slope,
        recentSpend,
        previousSpend: prevSpend,
        flagged,
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredTransactions]);

  // CSV upload handler
  const loadCSV = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const txns: Transaction[] = rows
          .map(row => {
            // Handle Monarch Money CSV column names
            const dateStr = row['Date'] || row['date'] || '';
            const amount = parseFloat(row['Amount'] || row['amount'] || '0');
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;

            return {
              date,
              account: row['Account'] || '',
              accountNumber: row['Account #'] || '',
              institution: row['Institution'] || '',
              merchant: row['Merchant'] || row['Name'] || '',
              category: row['Category'] || 'Uncategorized',
              tag: row['Tag'] || row['Tags'] || '',
              note: row['Note'] || row['Notes'] || '',
              // Monarch: negative = outflow/expense, positive = income
              amount: amount,
              originalStatement: row['Original Statement'] || '',
            } as Transaction;
          })
          .filter((t): t is Transaction => t !== null);

        setRawTransactions(txns.sort((a, b) => b.date.getTime() - a.date.getTime()));
        // Reset filters for new data
        const dates = txns.map(t => t.date);
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        setFilterState({
          dateRange: { start: minDate, end: maxDate, label: 'All' },
          categories: [],
          accounts: [],
        });
      },
      error: (err) => console.error('CSV parse error:', err),
    });
  }, []);

  const setDateRange = useCallback((range: DateRange) => {
    setFilterState(prev => ({ ...prev, dateRange: range }));
  }, []);

  const setCategories = useCallback((cats: string[]) => {
    setFilterState(prev => ({ ...prev, categories: cats }));
  }, []);

  const setAccounts = useCallback((accts: string[]) => {
    setFilterState(prev => ({ ...prev, accounts: accts }));
  }, []);

  return {
    rawTransactions,
    filteredTransactions,
    filterState,
    setDateRange,
    setCategories,
    setAccounts,
    drillCategory,
    setDrillCategory,
    searchQuery,
    setSearchQuery,
    allCategories,
    allAccounts,
    monthlyPnL,
    categorySummaries,
    merchantSummaries,
    loadCSV,
  };
}
