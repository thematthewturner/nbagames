import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine, Legend,
} from 'recharts';
import type { MonthlyPnL, Debt, SavingsGoal, CategorySummary } from '../../types';
import { mean, fmt$, fmtPct } from '../../utils/stats';

interface ScenariosPanelProps {
  monthlyPnL: MonthlyPnL[];
  categorySummaries: CategorySummary[];
}

// ─── Debt payoff engine ────────────────────────────────────────────────────

type DebtStrategy = 'avalanche' | 'snowball';

interface PayoffResult {
  months: number;
  totalInterest: number;
  schedule: { month: number; totalBalance: number; totalInterest: number }[];
  debtOrder: string[];
}

/**
 * Simulate debt payoff with a fixed total monthly budget.
 * Avalanche: pay highest-APR debt first (minimises total interest).
 * Snowball:  pay lowest-balance debt first (builds momentum, costs more interest).
 *
 * Each month:
 *  1. Accrue monthly interest on every remaining balance.
 *  2. Pay the minimum on all debts.
 *  3. Throw the leftover ("extra") at the target debt per the chosen strategy.
 */
function simulatePayoff(debts: Debt[], extraMonthly: number, strategy: DebtStrategy): PayoffResult {
  const remaining = debts.map(d => ({ ...d }));
  const minTotal = remaining.reduce((s, d) => s + d.minPayment, 0);
  const totalPayment = minTotal + extraMonthly;

  let month = 0;
  let cumulativeInterest = 0;
  const schedule: PayoffResult['schedule'] = [];
  const debtOrder: string[] = [];

  while (remaining.some(d => d.balance > 0.01) && month < 600) {
    month++;
    let interestThisMonth = 0;

    // Step 1: accrue interest
    for (const d of remaining) {
      if (d.balance <= 0) continue;
      const monthlyRate = d.apr / 12;
      const interest = d.balance * monthlyRate;
      d.balance += interest;
      interestThisMonth += interest;
    }
    cumulativeInterest += interestThisMonth;

    // Step 2: pay minimums
    let budgetLeft = totalPayment;
    for (const d of remaining) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance);
      d.balance = Math.max(0, d.balance - pay);
      budgetLeft -= pay;
    }

    // Step 3: throw extra at the target debt
    const active = remaining
      .filter(d => d.balance > 0.01)
      .sort((a, b) =>
        strategy === 'avalanche'
          ? b.apr - a.apr          // highest APR first
          : a.balance - b.balance  // lowest balance first
      );

    if (active.length > 0 && budgetLeft > 0) {
      active[0].balance = Math.max(0, active[0].balance - budgetLeft);
    }

    // Record newly paid-off debts in order
    for (const d of remaining) {
      if (d.balance < 0.01 && !debtOrder.includes(d.name)) {
        debtOrder.push(d.name);
        d.balance = 0;
      }
    }

    const totalBalance = remaining.reduce((s, d) => s + d.balance, 0);
    schedule.push({ month, totalBalance, totalInterest: cumulativeInterest });
    if (totalBalance < 0.01) break;
  }

  return { months: month, totalInterest: cumulativeInterest, schedule, debtOrder };
}

// ─── Savings goal engine ───────────────────────────────────────────────────

interface GoalProjection {
  monthsToGoal: number;
  totalContributed: number;
  interestEarned: number;
  schedule: { month: number; balance: number }[];
}

/**
 * Projects a savings goal with monthly compounding at the given annual return rate.
 * Default 4.5% represents a competitive HYSA or short-term bond fund.
 */
function projectSavingsGoal(goal: SavingsGoal, annualReturn: number): GoalProjection {
  const monthlyRate = annualReturn / 12;
  let balance = goal.currentAmount;
  const schedule: { month: number; balance: number }[] = [{ month: 0, balance }];
  let month = 0;

  while (balance < goal.targetAmount && month < 600) {
    month++;
    balance = balance * (1 + monthlyRate) + goal.monthlyContribution;
    schedule.push({ month, balance: Math.min(balance, goal.targetAmount * 2) });
    if (balance >= goal.targetAmount) break;
  }

  const totalContributed = goal.monthlyContribution * month;
  const interestEarned = balance - goal.currentAmount - totalContributed;
  return { monthsToGoal: month, totalContributed, interestEarned, schedule };
}

// ─── Seed data ────────────────────────────────────────────────────────────

const SEED_DEBTS: Debt[] = [
  { id: 'd1', name: 'Credit Card (Amex)',  balance: 4800,  apr: 0.2499, minPayment: 96  },
  { id: 'd2', name: 'Credit Card (Citi)',  balance: 2200,  apr: 0.2199, minPayment: 44  },
  { id: 'd3', name: 'Auto Loan',           balance: 18500, apr: 0.0699, minPayment: 478 },
  { id: 'd4', name: 'Student Loan',        balance: 12000, apr: 0.0499, minPayment: 130 },
];

const SEED_GOALS: SavingsGoal[] = [
  { id: 'g1', name: 'Emergency Fund (6mo)', targetAmount: 36000, currentAmount: 12000, monthlyContribution: 800 },
  { id: 'g2', name: 'Vacation Fund',        targetAmount: 8000,  currentAmount: 1200,  monthlyContribution: 400 },
  { id: 'g3', name: 'New Car Down Payment', targetAmount: 10000, currentAmount: 3500,  monthlyContribution: 300 },
];

const ADJUSTABLE_CATEGORIES = [
  'Dining Out', 'Shopping', 'Entertainment', 'Subscriptions',
  'Travel', 'Groceries', 'Health & Fitness', 'Personal Care', 'Gifts & Donations',
];

// ─── Reusable atoms ───────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, prefix = '', suffix = '', step = 1, min = 0,
}: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-dim" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <div className="flex items-center border border-gray-800 focus-within:border-green-600" style={{ background: '#0a0a0a' }}>
        {prefix && <span className="px-1 text-dim text-xs">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="bg-transparent text-xs text-green outline-none px-1 py-0.5"
          style={{ width: 80, fontFamily: 'Courier New, monospace' }}
        />
        {suffix && <span className="px-1 text-dim text-xs">{suffix}</span>}
      </div>
    </label>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-gray-700 p-2 text-xs">
      <div className="text-muted mb-1">Mo {label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke || p.fill }}>
          {p.name}: {fmt$(p.value)}
        </div>
      ))}
    </div>
  );
};

// ─── Debt Payoff Tab ──────────────────────────────────────────────────────

function DebtPayoffTab({ freeCash }: { freeCash: number }) {
  const [debts, setDebts] = useState<Debt[]>(SEED_DEBTS);
  const [extra, setExtra] = useState(() => Math.max(0, Math.round(freeCash)));
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const avalanche = useMemo(() => simulatePayoff(debts, extra, 'avalanche'), [debts, extra]);
  const snowball   = useMemo(() => simulatePayoff(debts, extra, 'snowball'),  [debts, extra]);

  const interestSaved = snowball.totalInterest - avalanche.totalInterest;
  const monthsSaved   = snowball.months - avalanche.months;
  const totalDebt     = debts.reduce((s, d) => s + d.balance, 0);

  // Sample at most 40 chart points from the longer series
  const maxMonths = Math.max(avalanche.months, snowball.months, 1);
  const stride = Math.max(1, Math.floor(maxMonths / 40));
  const chartData = Array.from({ length: Math.ceil(maxMonths / stride) }, (_, i) => {
    const mo = (i + 1) * stride;
    const av = avalanche.schedule.find(s => s.month >= mo) ?? avalanche.schedule[avalanche.schedule.length - 1];
    const sn = snowball.schedule.find(s  => s.month >= mo) ?? snowball.schedule[snowball.schedule.length - 1];
    return { month: mo, avalanche: av?.totalBalance ?? 0, snowball: sn?.totalBalance ?? 0 };
  });

  const updateDebt = (idx: number, field: keyof Debt, val: string | number) =>
    setDebts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));

  const addDebt = () => {
    const id = `d${Date.now()}`;
    setDebts(prev => [...prev, { id, name: 'New Debt', balance: 1000, apr: 0.15, minPayment: 25 }]);
    setEditIdx(debts.length);
  };

  const removeDebt = (idx: number) => {
    setDebts(prev => prev.filter((_, i) => i !== idx));
    setEditIdx(null);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-px" style={{ background: '#050505', border: '1px solid #1a1a1a' }}>
        {[
          { label: 'TOTAL DEBT',          value: fmt$(totalDebt),                    cls: 'negative' },
          { label: 'AVALANCHE PAYOFF',    value: `${avalanche.months} mo`,            cls: 'text-green' },
          { label: 'SNOWBALL PAYOFF',     value: `${snowball.months} mo`,             cls: 'text-amber' },
          {
            label: 'AVALANCHE ADVANTAGE',
            value: `${fmt$(Math.abs(interestSaved))} int · ${Math.abs(monthsSaved)} mo faster`,
            cls: interestSaved >= 0 ? 'positive' : 'negative',
          },
        ].map(({ label, value, cls }) => (
          <div key={label} className="px-3 py-2" style={{ background: '#0d0d0d' }}>
            <div className="stat-label">{label}</div>
            <div className={`font-bold ${cls}`} style={{ fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left column: debt editor */}
        <div style={{ width: 290, flexShrink: 0 }} className="flex flex-col gap-2 overflow-auto">
          <div className="flex items-center justify-between">
            <span className="text-dim text-xs" style={{ letterSpacing: '0.08em' }}>DEBTS</span>
            <button className="btn-terminal text-xs" onClick={addDebt}>+ ADD</button>
          </div>

          {debts.map((d, i) => (
            <div
              key={d.id}
              className={`border p-2 cursor-pointer ${editIdx === i ? 'border-green-700 bg-green-950/10' : 'border-gray-800'}`}
              onClick={() => setEditIdx(editIdx === i ? null : i)}
            >
              <div className="flex justify-between items-center">
                <span className="text-amber text-xs font-bold">{d.name}</span>
                <div className="flex gap-2 items-center">
                  <span className="negative text-xs">{fmt$(d.balance)}</span>
                  <span className="text-dim text-xs">@ {fmtPct(d.apr * 100)}</span>
                </div>
              </div>
              <div className="text-dim text-xs mt-0.5">Min: {fmt$(d.minPayment)}/mo</div>

              {editIdx === i && (
                <div className="mt-2 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                  <div className="col-span-2">
                    <span className="text-dim" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Name</span>
                    <input
                      className="block w-full bg-transparent border border-gray-800 text-xs text-green px-1 py-0.5 outline-none"
                      style={{ fontFamily: 'Courier New, monospace' }}
                      value={d.name}
                      onChange={e => updateDebt(i, 'name', e.target.value)}
                    />
                  </div>
                  <NumInput label="Balance"     value={d.balance}     onChange={v => updateDebt(i, 'balance', v)}     prefix="$" step={100} />
                  <NumInput label="APR %"        value={+(d.apr * 100).toFixed(2)} onChange={v => updateDebt(i, 'apr', v / 100)} suffix="%" step={0.1} />
                  <NumInput label="Min Payment" value={d.minPayment}  onChange={v => updateDebt(i, 'minPayment', v)}  prefix="$" step={5} />
                  <button className="btn-terminal text-xs text-red-term border-red-900 mt-1" onClick={() => removeDebt(i)}>
                    REMOVE
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Extra payment input */}
          <div className="border border-gray-800 p-2">
            <NumInput label="Extra monthly payment" value={extra} onChange={setExtra} prefix="$" step={50} />
            <div className="text-dim mt-1" style={{ fontSize: 9 }}>
              Estimated free cash: ~{fmt$(Math.max(0, freeCash))}/mo
            </div>
          </div>

          {/* Recommended payoff order */}
          <div className="border border-gray-800 p-2">
            <div className="text-dim text-xs mb-1" style={{ letterSpacing: '0.08em' }}>RECOMMENDED ORDER</div>
            {(['avalanche', 'snowball'] as const).map(s => {
              const res = s === 'avalanche' ? avalanche : snowball;
              return (
                <div key={s} className="mb-1">
                  <span className={`text-xs font-bold ${s === 'avalanche' ? 'text-green' : 'text-amber'}`}>
                    {s === 'avalanche' ? '↑ APR' : '↓ Bal'}:{' '}
                  </span>
                  <span className="text-muted text-xs">{res.debtOrder.join(' → ')}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: chart + interest table */}
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="text-dim text-xs px-1" style={{ letterSpacing: '0.08em' }}>REMAINING BALANCE OVER TIME</div>
          <div className="flex-1 min-h-0" style={{ minHeight: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                  label={{ value: 'months', fill: '#555', fontSize: 9, position: 'insideBottomRight', offset: 0 }} />
                <YAxis tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
                <ReferenceLine y={0} stroke="#333" />
                <Line dataKey="avalanche" name="Avalanche (↑ APR)" stroke="#00ff88" strokeWidth={2.5} dot={false} />
                <Line dataKey="snowball"  name="Snowball (↓ Bal)"  stroke="#ffb300" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cost comparison */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: 'AVALANCHE', res: avalanche, color: '#00ff88' },
              { label: 'SNOWBALL',  res: snowball,  color: '#ffb300' },
            ] as const).map(({ label, res, color }) => (
              <div key={label} className="p-2 border border-gray-800">
                <div className="text-xs font-bold mb-1" style={{ color, letterSpacing: '0.08em' }}>{label}</div>
                <div className="grid grid-cols-2 gap-x-2 text-xs">
                  <span className="text-dim">Months:</span>       <span className="text-muted">{res.months}</span>
                  <span className="text-dim">Total interest:</span><span className="negative">{fmt$(res.totalInterest)}</span>
                  <span className="text-dim">Total paid:</span>   <span className="text-muted">{fmt$(totalDebt + res.totalInterest)}</span>
                  <span className="text-dim">Debt-free:</span>
                  <span className="text-muted" style={{ fontSize: 9 }}>
                    {new Date(Date.now() + res.months * 30 * 24 * 3600 * 1000)
                      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Savings Goals Tab ────────────────────────────────────────────────────

function SavingsGoalsTab({ freeCash }: { freeCash: number }) {
  const [goals, setGoals] = useState<SavingsGoal[]>(SEED_GOALS);
  const [selectedId, setSelectedId] = useState<string>(SEED_GOALS[0].id);
  const [annualReturn, setAnnualReturn] = useState(4.5);

  const selected = goals.find(g => g.id === selectedId) ?? goals[0];
  const projection = useMemo(
    () => selected ? projectSavingsGoal(selected, annualReturn / 100) : null,
    [selected, annualReturn]
  );

  const totalMonthlySaved = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const remaining = freeCash - totalMonthlySaved;

  // Sample chart to max 30 points
  const stride = projection ? Math.max(1, Math.floor(projection.monthsToGoal / 30)) : 1;
  const chartData = projection?.schedule.filter((_, i) => i % stride === 0 || i === projection.schedule.length - 1) ?? [];

  const updateGoal = (id: string, field: keyof SavingsGoal, val: string | number) =>
    setGoals(prev => prev.map(g => g.id === id ? { ...g, [field]: val } : g));

  const addGoal = () => {
    const id = `g${Date.now()}`;
    setGoals(prev => [...prev, { id, name: 'New Goal', targetAmount: 5000, currentAmount: 0, monthlyContribution: 200 }]);
    setSelectedId(id);
  };

  const removeGoal = (id: string) => {
    const next = goals.filter(g => g.id !== id);
    setGoals(next);
    if (next.length > 0) setSelectedId(next[0].id);
  };

  return (
    <div className="flex gap-3 h-full">
      {/* Goal list */}
      <div style={{ width: 270, flexShrink: 0 }} className="flex flex-col gap-2 overflow-auto">
        <div className="flex items-center justify-between">
          <span className="text-dim text-xs" style={{ letterSpacing: '0.08em' }}>GOALS</span>
          <button className="btn-terminal text-xs" onClick={addGoal}>+ ADD</button>
        </div>

        {goals.map(g => {
          const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
          const isSelected = g.id === selectedId;
          return (
            <div
              key={g.id}
              className={`border p-2 cursor-pointer ${isSelected ? 'border-green-700' : 'border-gray-800'}`}
              style={{ background: isSelected ? 'rgba(0,255,136,0.03)' : '#0a0a0a' }}
              onClick={() => setSelectedId(g.id)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`text-xs font-bold ${isSelected ? 'text-green' : 'text-amber'}`}>{g.name}</span>
                <span className="text-dim text-xs">{fmtPct(pct)}</span>
              </div>
              <div className="h-1 bg-gray-900 rounded w-full">
                <div className="h-1 rounded" style={{ width: `${pct}%`, background: pct >= 100 ? '#00ff88' : '#ffb300' }} />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-muted">{fmt$(g.currentAmount)}</span>
                <span className="text-dim">/ {fmt$(g.targetAmount)}</span>
              </div>

              {isSelected && (
                <div className="mt-2 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                  <div className="col-span-2">
                    <span className="text-dim" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Name</span>
                    <input
                      className="block w-full bg-transparent border border-gray-800 text-xs text-green px-1 py-0.5 outline-none"
                      style={{ fontFamily: 'Courier New, monospace' }}
                      value={g.name}
                      onChange={e => updateGoal(g.id, 'name', e.target.value)}
                    />
                  </div>
                  <NumInput label="Target"       value={g.targetAmount}        onChange={v => updateGoal(g.id, 'targetAmount', v)}        prefix="$" step={500} />
                  <NumInput label="Current"      value={g.currentAmount}       onChange={v => updateGoal(g.id, 'currentAmount', v)}       prefix="$" step={100} />
                  <NumInput label="Monthly $/mo" value={g.monthlyContribution} onChange={v => updateGoal(g.id, 'monthlyContribution', v)} prefix="$" step={50} />
                  <button className="btn-terminal text-xs text-red-term border-red-900 mt-1" onClick={() => removeGoal(g.id)}>REMOVE</button>
                </div>
              )}
            </div>
          );
        })}

        <div className="border border-gray-800 p-2">
          <NumInput label="Annual Return (HYSA)" value={annualReturn} onChange={setAnnualReturn} suffix="%" step={0.25} min={0} />
        </div>

        <div className="border border-gray-800 p-2 text-xs">
          <div className="text-dim mb-1" style={{ fontSize: 9, letterSpacing: '0.08em' }}>BUDGET SUMMARY</div>
          <div className="grid grid-cols-2 gap-x-2">
            <span className="text-dim">Free cash/mo:</span>  <span className={freeCash >= 0 ? 'positive' : 'negative'}>{fmt$(freeCash)}</span>
            <span className="text-dim">To goals/mo:</span>   <span className="negative">{fmt$(totalMonthlySaved)}</span>
            <span className="text-dim">Remaining:</span>     <span className={remaining >= 0 ? 'positive' : 'negative'}>{fmt$(remaining)}</span>
          </div>
          {remaining < 0 && (
            <div className="mt-1 badge badge-red" style={{ display: 'inline-block' }}>
              Over-allocated by {fmt$(Math.abs(remaining))}/mo
            </div>
          )}
        </div>
      </div>

      {/* Projection chart */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {projection && selected ? (
          <>
            <div className="grid grid-cols-4 gap-px" style={{ background: '#050505', border: '1px solid #1a1a1a' }}>
              {[
                { label: 'TARGET',         value: fmt$(selected.targetAmount), cls: 'text-amber' },
                { label: 'TIME TO GOAL',   value: projection.monthsToGoal >= 600 ? '> 50 yr' : `${projection.monthsToGoal} mo`, cls: 'text-green' },
                { label: 'TOTAL CONTRIB',  value: fmt$(projection.totalContributed), cls: 'text-muted' },
                { label: 'INTEREST EARN',  value: fmt$(Math.max(0, projection.interestEarned)), cls: 'positive' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="px-3 py-2" style={{ background: '#0d0d0d' }}>
                  <div className="stat-label">{label}</div>
                  <div className={`font-bold ${cls}`} style={{ fontSize: 13 }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="text-dim text-xs px-1" style={{ letterSpacing: '0.08em' }}>
              BALANCE PROJECTION — {selected.name.toUpperCase()}
            </div>
            <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                    label={{ value: 'months', fill: '#555', fontSize: 9, position: 'insideBottomRight', offset: 0 }} />
                  <YAxis tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={selected.targetAmount} stroke="#ffb300" strokeDasharray="4 2"
                    label={{ value: 'Goal', fill: '#ffb300', fontSize: 9, position: 'insideTopRight' }} />
                  <Line dataKey="balance" name="Balance" stroke="#00ff88" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="text-center text-dim text-xs mt-8">Select a goal to view projection</div>
        )}
      </div>
    </div>
  );
}

// ─── Budget Reallocation Tab ───────────────────────────────────────────────

interface BudgetReallocationTabProps {
  categorySummaries: CategorySummary[];
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
}

const BUDGET_PRESETS: { label: string; desc: string; adj: Record<string, number> }[] = [
  {
    label: 'Lean Mode',
    desc: 'Cut discretionary 25–40%',
    adj: { 'Dining Out': -30, 'Shopping': -40, 'Entertainment': -50, 'Subscriptions': -20, 'Travel': -75 },
  },
  {
    label: 'FIRE Mode',
    desc: 'Aggressive savings push',
    adj: { 'Dining Out': -50, 'Shopping': -60, 'Entertainment': -75, 'Subscriptions': -50, 'Travel': -80, 'Personal Care': -30 },
  },
  {
    label: 'Lifestyle Inflation',
    desc: 'Spending up scenario',
    adj: { 'Dining Out': +30, 'Shopping': +25, 'Travel': +50, 'Entertainment': +20 },
  },
];

function BudgetReallocationTab({ categorySummaries, avgMonthlyIncome, avgMonthlyExpenses }: BudgetReallocationTabProps) {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const effectiveAdj = activePreset
    ? (BUDGET_PRESETS.find(p => p.label === activePreset)?.adj ?? adjustments)
    : adjustments;

  // Build base monthly spend per adjustable category from summaries
  const totalMonths = useMemo(() => {
    const totalExpenses = categorySummaries
      .filter(c => c.category !== 'Income' && c.category !== 'Transfer')
      .reduce((s, c) => s + c.total, 0);
    return avgMonthlyExpenses > 0 ? Math.max(1, Math.round(totalExpenses / avgMonthlyExpenses)) : 12;
  }, [categorySummaries, avgMonthlyExpenses]);

  const baseByCategory: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categorySummaries) {
      if (c.category !== 'Income' && c.category !== 'Transfer') {
        map[c.category] = c.total / totalMonths;
      }
    }
    return map;
  }, [categorySummaries, totalMonths]);

  const impact = ADJUSTABLE_CATEGORIES.map(cat => {
    const base = baseByCategory[cat] ?? 0;
    const pct = effectiveAdj[cat] ?? 0;
    const adjusted = base * (1 + pct / 100);
    return { cat, base, adjusted, delta: adjusted - base, pct };
  }).filter(x => x.base > 0);

  const totalMonthlyDelta = impact.reduce((s, x) => s + x.delta, 0);
  const newMonthlySavings = avgMonthlyIncome - avgMonthlyExpenses - totalMonthlyDelta;
  const newSavingsRate    = avgMonthlyIncome > 0 ? (newMonthlySavings / avgMonthlyIncome) * 100 : 0;
  const baseSavingsRate   = avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome) * 100 : 0;

  const applyPreset = (label: string) => {
    setActivePreset(prev => prev === label ? null : label);
    if (activePreset !== label) setAdjustments({});
  };

  const chartData = impact.map(x => ({
    name: x.cat.length > 11 ? x.cat.slice(0, 11) + '…' : x.cat,
    base:     Math.round(x.base),
    adjusted: Math.round(x.adjusted),
  }));

  return (
    <div className="flex gap-3 h-full">
      {/* Left: controls */}
      <div style={{ width: 270, flexShrink: 0 }} className="flex flex-col gap-2 overflow-auto">
        <div className="text-dim text-xs" style={{ letterSpacing: '0.08em' }}>PRESETS</div>
        {BUDGET_PRESETS.map(p => (
          <button
            key={p.label}
            className={`btn-terminal text-xs text-left px-2 py-1.5 flex flex-col ${activePreset === p.label ? 'active' : ''}`}
            onClick={() => applyPreset(p.label)}
          >
            <span>{p.label}</span>
            <span className="text-dim" style={{ fontSize: 9 }}>{p.desc}</span>
          </button>
        ))}

        <div className="text-dim text-xs mt-1" style={{ letterSpacing: '0.08em' }}>CUSTOM</div>
        {ADJUSTABLE_CATEGORIES.map(cat => {
          const base = baseByCategory[cat] ?? 0;
          if (base === 0) return null;
          const pct = effectiveAdj[cat] ?? 0;
          const newAmt = base * (1 + pct / 100);
          return (
            <div key={cat}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className={pct < 0 ? 'positive' : pct > 0 ? 'negative' : 'text-muted'}>{cat}</span>
                <span className="text-dim">
                  {fmt$(newAmt)}/mo{' '}
                  {pct !== 0 && (
                    <span className={pct < 0 ? 'positive' : 'negative'}>({pct > 0 ? '+' : ''}{pct}%)</span>
                  )}
                </span>
              </div>
              <input
                type="range" min="-50" max="50" step="5"
                value={pct}
                onChange={e => {
                  setActivePreset(null);
                  setAdjustments(prev => ({ ...prev, [cat]: parseInt(e.target.value) }));
                }}
                className="w-full"
                style={{ accentColor: pct < 0 ? '#00ff88' : pct > 0 ? '#ff4444' : '#555' }}
              />
            </div>
          );
        })}

        <button className="btn-terminal text-xs" onClick={() => { setAdjustments({}); setActivePreset(null); }}>
          RESET ALL
        </button>
      </div>

      {/* Right: impact */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-px" style={{ background: '#050505', border: '1px solid #1a1a1a' }}>
          {[
            {
              label: 'MONTHLY IMPACT',
              value: `${totalMonthlyDelta <= 0 ? '+' : ''}${fmt$(Math.abs(totalMonthlyDelta))} ${totalMonthlyDelta <= 0 ? 'saved' : 'more'}`,
              cls: totalMonthlyDelta <= 0 ? 'positive' : 'negative',
            },
            {
              label: 'NEW SAVINGS RATE',
              value: `${fmtPct(newSavingsRate)} (was ${fmtPct(baseSavingsRate)})`,
              cls: newSavingsRate >= 20 ? 'positive' : newSavingsRate >= 10 ? 'text-amber' : 'negative',
            },
            {
              label: 'ANNUAL IMPACT',
              value: fmt$(Math.abs(totalMonthlyDelta * 12)) + '/yr',
              cls: totalMonthlyDelta <= 0 ? 'positive' : 'negative',
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className="px-3 py-2" style={{ background: '#0d0d0d' }}>
              <div className="stat-label">{label}</div>
              <div className={`font-bold ${cls}`} style={{ fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="text-dim text-xs px-1" style={{ letterSpacing: '0.08em' }}>BASE vs ADJUSTED MONTHLY SPEND</div>
        <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 28 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#888', fontSize: 9 }} axisLine={false} tickLine={false} width={78} />
              <Tooltip
                formatter={(v: any, name: any) => [fmt$(Number(v)), name]}
                contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: '#666' }} />
              <Bar dataKey="base"     name="Current"  fill="#333"    radius={[0, 2, 2, 0]} />
              <Bar dataKey="adjusted" name="Adjusted" fill="#00ff88" radius={[0, 2, 2, 0]} fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Root component ────────────────────────────────────────────────────────

type ScenarioTab = 'debt' | 'goals' | 'budget';

export const ScenariosPanel: React.FC<ScenariosPanelProps> = ({ monthlyPnL, categorySummaries }) => {
  const [tab, setTab] = useState<ScenarioTab>('debt');

  // Avg free cash = net income after expenses, averaged over filtered period
  const avgMonthlyNet      = useMemo(() => mean(monthlyPnL.map(m => m.net)),      [monthlyPnL]);
  const avgMonthlyIncome   = useMemo(() => mean(monthlyPnL.map(m => m.income)),   [monthlyPnL]);
  const avgMonthlyExpenses = useMemo(() => mean(monthlyPnL.map(m => m.expenses)), [monthlyPnL]);

  // Conservative free-cash estimate: net minus a buffer for existing debt minimums
  const freeCash = avgMonthlyNet * 0.7;

  const TABS: { id: ScenarioTab; label: string }[] = [
    { id: 'debt',   label: 'DEBT PAYOFF'   },
    { id: 'goals',  label: 'SAVINGS GOALS' },
    { id: 'budget', label: 'BUDGET REALLOC' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 px-2 pt-2 pb-2 border-b border-gray-900 items-center flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`btn-terminal text-xs ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto text-dim text-xs flex gap-3">
          <span>Avg income: <span className="positive">{fmt$(avgMonthlyIncome)}/mo</span></span>
          <span>Avg expenses: <span className="negative">{fmt$(avgMonthlyExpenses)}/mo</span></span>
          <span>Free cash: <span className={freeCash >= 0 ? 'positive' : 'negative'}>{fmt$(freeCash)}/mo</span></span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2">
        {tab === 'debt'   && <DebtPayoffTab        freeCash={freeCash} />}
        {tab === 'goals'  && <SavingsGoalsTab       freeCash={freeCash} />}
        {tab === 'budget' && (
          <BudgetReallocationTab
            categorySummaries={categorySummaries}
            avgMonthlyIncome={avgMonthlyIncome}
            avgMonthlyExpenses={avgMonthlyExpenses}
          />
        )}
      </div>
    </div>
  );
};
