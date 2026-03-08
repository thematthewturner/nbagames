import React, { useCallback } from 'react';
import type { DateRange, FilterState } from '../types';
import { fmt$, fmtPct } from '../utils/stats';

interface TopBarStats {
  netCashFlowMTD: number;
  burnRateDaily: number;
  runwayMonths: number;
  savingsRate: number;
}

interface TopBarProps {
  stats: TopBarStats;
  filterState: FilterState;
  allCategories: string[];
  allAccounts: string[];
  onDateRange: (range: DateRange) => void;
  onCategoryChange: (cats: string[]) => void;
  onAccountChange: (accts: string[]) => void;
  onCSVUpload: (file: File) => void;
  onSearchOpen: () => void;
  transactionCount: number;
}

const DATE_PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'YTD', months: -1 },
  { label: '1Y', months: 12 },
  { label: 'All', months: -2 },
];

export const TopBar: React.FC<TopBarProps> = ({
  stats,
  filterState,
  allCategories,
  allAccounts,
  onDateRange,
  onCategoryChange,
  onAccountChange,
  onCSVUpload,
  onSearchOpen,
  transactionCount,
}) => {
  const handlePreset = (months: number) => {
    const end = new Date();
    let start: Date;
    let label = '';

    if (months === -1) {
      start = new Date(end.getFullYear(), 0, 1);
      label = 'YTD';
    } else if (months === -2) {
      start = new Date(2000, 0, 1);
      label = 'All';
    } else {
      start = new Date(end);
      start.setMonth(start.getMonth() - months);
      label = DATE_PRESETS.find(p => p.months === months)?.label ?? '';
    }

    onDateRange({ start, end, label });
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) onCSVUpload(file);
  }, [onCSVUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCSVUpload(file);
  }, [onCSVUpload]);

  const posClass = (v: number) => v >= 0 ? 'text-green' : 'text-red-term';

  return (
    <div className="flex flex-col border-b border-gray-800 bg-black">
      {/* Brand bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-900">
        <div className="flex items-center gap-4">
          <span className="text-green font-bold text-sm tracking-widest">FINANCE TERMINAL</span>
          <span className="text-dim text-xs">v1.0</span>
          <span className="text-dim text-xs">|</span>
          <span className="text-muted text-xs">{transactionCount.toLocaleString()} TRANSACTIONS</span>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV Upload */}
          <label
            className="btn-terminal text-xs cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
            UPLOAD CSV
          </label>
          <button className="btn-terminal text-xs" onClick={onSearchOpen}>
            SEARCH [/]
          </button>
          <span className="text-dim text-xs">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 divide-x divide-gray-900">
        <div className="px-6 py-3">
          <div className="stat-label">Net Cash Flow MTD</div>
          <div className={`stat-value ${posClass(stats.netCashFlowMTD)}`}>{fmt$(stats.netCashFlowMTD)}</div>
        </div>
        <div className="px-6 py-3">
          <div className="stat-label">Burn Rate (Daily Avg)</div>
          <div className="stat-value text-amber">{fmt$(stats.burnRateDaily)}/day</div>
        </div>
        <div className="px-6 py-3">
          <div className="stat-label">Runway (@ Current Burn)</div>
          <div className={`stat-value ${stats.runwayMonths > 12 ? 'text-green' : stats.runwayMonths > 6 ? 'text-amber' : 'text-red-term'}`}>
            {stats.runwayMonths > 999 ? '∞' : stats.runwayMonths.toFixed(1)} mo
          </div>
        </div>
        <div className="px-6 py-3">
          <div className="stat-label">Savings Rate</div>
          <div className={`stat-value ${stats.savingsRate >= 20 ? 'text-green' : stats.savingsRate >= 10 ? 'text-amber' : 'text-red-term'}`}>
            {fmtPct(stats.savingsRate)}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-900">
        {/* Date presets */}
        <div className="flex gap-1">
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`btn-terminal text-xs ${filterState.dateRange.label === p.label ? 'active' : ''}`}
              onClick={() => handlePreset(p.months)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-dim text-xs">|</span>

        {/* Category filter */}
        <div className="flex items-center gap-1">
          <span className="text-dim text-xs">CAT:</span>
          <select
            multiple
            className="bg-transparent border border-gray-800 text-xs text-muted px-2 py-0.5 h-6 w-36"
            value={filterState.categories}
            onChange={e => {
              const vals = Array.from(e.target.selectedOptions, o => o.value);
              onCategoryChange(vals);
            }}
          >
            {allCategories.map(c => (
              <option key={c} value={c} className="bg-black">{c}</option>
            ))}
          </select>
          {filterState.categories.length > 0 && (
            <button className="text-dim text-xs hover:text-red-term" onClick={() => onCategoryChange([])}>✕</button>
          )}
        </div>

        {/* Account filter */}
        <div className="flex items-center gap-1">
          <span className="text-dim text-xs">ACCT:</span>
          <select
            multiple
            className="bg-transparent border border-gray-800 text-xs text-muted px-2 py-0.5 h-6 w-36"
            value={filterState.accounts}
            onChange={e => {
              const vals = Array.from(e.target.selectedOptions, o => o.value);
              onAccountChange(vals);
            }}
          >
            {allAccounts.map(a => (
              <option key={a} value={a} className="bg-black">{a}</option>
            ))}
          </select>
          {filterState.accounts.length > 0 && (
            <button className="text-dim text-xs hover:text-red-term" onClick={() => onAccountChange([])}>✕</button>
          )}
        </div>

        <div className="ml-auto text-dim text-xs">
          {filterState.dateRange.start.toLocaleDateString()} – {filterState.dateRange.end.toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};
