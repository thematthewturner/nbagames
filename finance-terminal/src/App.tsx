import { useState, useEffect, useMemo, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { PnLPanel } from './components/panels/PnLPanel';
import { CategoryPanel } from './components/panels/CategoryPanel';
import { RollingPanel } from './components/panels/RollingPanel';
import { ProjectionsPanel } from './components/panels/ProjectionsPanel';
import { MerchantsPanel } from './components/panels/MerchantsPanel';
import { HeatmapPanel } from './components/panels/HeatmapPanel';
import { AnomalyPanel } from './components/panels/AnomalyPanel';
import { IncomePanel } from './components/panels/IncomePanel';
import { SearchModal } from './components/SearchModal';
import { useTransactions } from './hooks/useTransactions';
import { useRollingCalc } from './hooks/useRollingCalc';
import type { PanelTab } from './types';

const PANEL_TABS: { id: PanelTab; label: string; color: string }[] = [
  { id: 'pnl', label: 'P&L', color: '#00ff88' },
  { id: 'category', label: 'CATEGORIES', color: '#ffb300' },
  { id: 'rolling', label: 'ROLLING', color: '#00aaff' },
  { id: 'projections', label: 'PROJECTIONS', color: '#00ff88' },
  { id: 'merchants', label: 'MERCHANTS', color: '#ffb300' },
  { id: 'heatmap', label: 'HEATMAP', color: '#00aaff' },
  { id: 'anomalies', label: 'ANOMALIES', color: '#ff4444' },
  { id: 'income', label: 'INCOME', color: '#00ff88' },
];

const DEFAULT_LAYOUT: PanelTab[] = ['pnl', 'category', 'rolling', 'merchants', 'projections', 'anomalies'];

function PanelHeader({
  tab,
  allTabs,
  onSwap,
}: {
  tab: PanelTab;
  allTabs: typeof PANEL_TABS;
  onSwap: (t: PanelTab) => void;
}) {
  const current = allTabs.find(t => t.id === tab)!;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="panel-header flex items-center justify-between relative"
      style={{ borderTopColor: current.color }}
    >
      <span style={{ color: current.color }}>{current.label}</span>
      <button
        className="text-dim text-xs hover:text-white px-1"
        onClick={() => setMenuOpen(v => !v)}
        title="Switch panel"
      >
        ⊞
      </button>
      {menuOpen && (
        <div
          className="absolute top-6 right-0 z-30 bg-black border border-gray-700 shadow-lg"
          style={{ minWidth: 140 }}
          onMouseLeave={() => setMenuOpen(false)}
        >
          {allTabs.map(t => (
            <button
              key={t.id}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-900 ${tab === t.id ? 'text-green' : 'text-muted'}`}
              onClick={() => { onSwap(t.id); setMenuOpen(false); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function renderPanel(
  tab: PanelTab,
  props: {
    monthlyPnL: any[];
    filteredTransactions: any[];
    categorySummaries: any[];
    merchantSummaries: any[];
    drillCategory: string | null;
    setDrillCategory: (c: string | null) => void;
    rollingData: any[];
  }
) {
  const {
    monthlyPnL, filteredTransactions, categorySummaries,
    merchantSummaries, drillCategory, setDrillCategory, rollingData,
  } = props;

  switch (tab) {
    case 'pnl': return <PnLPanel monthlyPnL={monthlyPnL} />;
    case 'category': return (
      <CategoryPanel
        filteredTransactions={filteredTransactions}
        categorySummaries={categorySummaries}
        onDrill={setDrillCategory}
        drillCategory={drillCategory}
      />
    );
    case 'rolling': return <RollingPanel rollingData={rollingData} />;
    case 'projections': return <ProjectionsPanel monthlyPnL={monthlyPnL} />;
    case 'merchants': return (
      <MerchantsPanel
        merchantSummaries={merchantSummaries}
        filteredTransactions={filteredTransactions}
      />
    );
    case 'heatmap': return <HeatmapPanel filteredTransactions={filteredTransactions} />;
    case 'anomalies': return <AnomalyPanel filteredTransactions={filteredTransactions} />;
    case 'income': return <IncomePanel filteredTransactions={filteredTransactions} />;
    default: return null;
  }
}

export default function App() {
  const {
    filteredTransactions,
    rawTransactions,
    filterState,
    setDateRange,
    setCategories,
    setAccounts,
    drillCategory,
    setDrillCategory,
    allCategories,
    allAccounts,
    monthlyPnL,
    categorySummaries,
    merchantSummaries,
    loadCSV,
  } = useTransactions();

  const [layout, setLayout] = useState<PanelTab[]>([...DEFAULT_LAYOUT]);
  const [searchOpen, setSearchOpen] = useState(false);

  const { rollingData } = useRollingCalc(filteredTransactions);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !searchOpen && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // Top-bar stats (always use full raw data, not filtered)
  const topBarStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mtdTxns = rawTransactions.filter(t => t.date >= monthStart && t.date <= now);
    const netCashFlowMTD = mtdTxns.reduce((s, t) => s + t.amount, 0);

    // Daily burn rate over last 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30Expenses = rawTransactions.filter(t => t.date >= thirtyDaysAgo && t.amount < 0);
    const burnRateDaily = last30Expenses.length > 0
      ? Math.abs(last30Expenses.reduce((s, t) => s + t.amount, 0)) / 30
      : 0;

    // Runway: cumulative savings / monthly burn
    const totalCumulative = rawTransactions.reduce((s, t) => s + t.amount, 0);
    const monthlyBurn = burnRateDaily * 30;
    const runwayMonths = monthlyBurn > 0 ? Math.max(0, totalCumulative / monthlyBurn) : 9999;

    // Savings rate over last 3 months
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recent = rawTransactions.filter(t => t.date >= threeMonthsAgo);
    const recentIncome = recent.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const recentExpenses = recent.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const savingsRate = recentIncome > 0 ? ((recentIncome - recentExpenses) / recentIncome) * 100 : 0;

    return { netCashFlowMTD, burnRateDaily, runwayMonths, savingsRate };
  }, [rawTransactions]);

  const swapPanel = useCallback((slotIdx: number, newTab: PanelTab) => {
    setLayout(prev => {
      const next = [...prev];
      next[slotIdx] = newTab;
      return next;
    });
  }, []);

  const panelProps = {
    monthlyPnL,
    filteredTransactions,
    categorySummaries,
    merchantSummaries,
    drillCategory,
    setDrillCategory,
    rollingData,
  };

  const totalNet = rawTransactions.reduce((s, t) => s + t.amount, 0);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100vh', minWidth: 1280, background: '#0a0a0a', color: '#e0e0e0' }}
    >
      <TopBar
        stats={topBarStats}
        filterState={filterState}
        allCategories={allCategories}
        allAccounts={allAccounts}
        onDateRange={setDateRange}
        onCategoryChange={setCategories}
        onAccountChange={setAccounts}
        onCSVUpload={loadCSV}
        onSearchOpen={() => setSearchOpen(true)}
        transactionCount={filteredTransactions.length}
      />

      {/* 3-column × 2-row panel grid */}
      <div
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '2px',
          padding: '2px',
          background: '#050505',
        }}
      >
        {layout.slice(0, 6).map((tab, i) => {
          const panelDef = PANEL_TABS.find(p => p.id === tab)!;
          return (
            <div
              key={i}
              className="flex flex-col overflow-hidden"
              style={{
                background: '#0d0d0d',
                border: '1px solid #1f1f1f',
                borderTop: `2px solid ${panelDef?.color || '#00ff88'}`,
              }}
            >
              <PanelHeader
                tab={tab}
                allTabs={PANEL_TABS}
                onSwap={(newTab) => swapPanel(i, newTab)}
              />
              <div className="flex-1 min-h-0 overflow-hidden">
                {renderPanel(tab, panelProps)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom status bar */}
      <div
        className="flex items-center px-3 border-t border-gray-900"
        style={{ height: 26, background: '#080808', fontSize: 10, color: '#555' }}
      >
        <span className="mr-4">
          PANELS:
          {PANEL_TABS.map(t => (
            <span
              key={t.id}
              className="ml-2 cursor-default"
              style={{ color: layout.includes(t.id) ? t.color : '#333' }}
              title={layout.includes(t.id) ? 'Visible' : 'Hidden — click ⊞ on any panel to show'}
            >
              {t.label}
            </span>
          ))}
        </span>
        <span className="ml-auto">
          {filteredTransactions.length.toLocaleString()} TXN
          {' · '}
          NET CUMULATIVE:{' '}
          <span style={{ color: totalNet >= 0 ? '#00ff88' : '#ff4444' }}>
            ${Math.abs(totalNet).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            {totalNet < 0 ? ' (DEFICIT)' : ''}
          </span>
          {' · '}
          <span className="text-dim">/ to search · ESC to close</span>
        </span>
      </div>

      {searchOpen && (
        <SearchModal
          transactions={rawTransactions}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
