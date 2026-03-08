export interface Transaction {
  date: Date;
  account: string;
  accountNumber: string;
  institution: string;
  merchant: string;
  category: string;
  tag: string;
  note: string;
  amount: number; // positive = income/inflow, negative = expense/outflow
  originalStatement: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  avg: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
  slope: number; // linear trend slope
  pctOfTotal: number;
}

export interface MerchantSummary {
  merchant: string;
  category: string;
  total: number;
  count: number;
  avgPerTransaction: number;
  transactionsPerMonth: number;
  trend: number; // slope
  recentSpend: number; // trailing 3 months
  previousSpend: number; // prior 3 months
  flagged: boolean; // >20% increase
}

export interface TimeSeriesPoint {
  date: string; // ISO date string YYYY-MM-DD
  value: number;
}

export interface MonthlyPnL {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
}

export interface ProjectionPoint {
  month: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  actual?: number;
}

export interface AnomalyAlert {
  id: string;
  transaction: Transaction;
  type: 'zscore' | 'spike';
  severity: 'high' | 'medium' | 'low';
  message: string;
  zScore?: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export type PanelTab = 'pnl' | 'category' | 'rolling' | 'projections' | 'merchants' | 'heatmap' | 'anomalies' | 'income';

export interface FilterState {
  dateRange: DateRange;
  categories: string[];
  accounts: string[];
}
