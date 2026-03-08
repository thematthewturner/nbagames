import React, { useEffect, useRef, useState } from 'react';
import type { Transaction } from '../types';
import { fmt$ } from '../utils/stats';

interface SearchModalProps {
  transactions: Transaction[];
  onClose: () => void;
  onSelect?: (t: Transaction) => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Simple substring match; could be enhanced with actual fuzzy logic
  return t.includes(q);
}

export const SearchModal: React.FC<SearchModalProps> = ({ transactions, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const results = query.length >= 2
    ? transactions.filter(t =>
        fuzzyMatch(query, t.merchant) ||
        fuzzyMatch(query, t.category) ||
        fuzzyMatch(query, t.note) ||
        fuzzyMatch(query, t.originalStatement)
      ).slice(0, 50)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl terminal-panel" style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header flex items-center justify-between">
          <span>TRANSACTION SEARCH</span>
          <button className="text-dim hover:text-red-term" onClick={onClose}>ESC</button>
        </div>

        <div className="p-2 border-b border-gray-900">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search merchant, category, note..."
            className="w-full bg-transparent border border-gray-700 text-green text-sm px-3 py-2 outline-none focus:border-green-500 placeholder-gray-600"
            style={{ fontFamily: 'Courier New, monospace' }}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {query.length < 2 ? (
            <div className="text-center text-dim text-xs py-6">Type 2+ characters to search</div>
          ) : results.length === 0 ? (
            <div className="text-center text-dim text-xs py-6">No results for "{query}"</div>
          ) : (
            <table className="table-terminal w-full">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>MERCHANT</th>
                  <th>CATEGORY</th>
                  <th className="text-right">AMOUNT</th>
                  <th>ACCOUNT</th>
                </tr>
              </thead>
              <tbody>
                {results.map((t, i) => (
                  <tr key={i} className="cursor-pointer" onClick={() => onSelect?.(t)}>
                    <td className="text-dim">{t.date.toLocaleDateString()}</td>
                    <td className="text-amber">{t.merchant}</td>
                    <td className="text-muted">{t.category}</td>
                    <td className={`text-right ${t.amount < 0 ? 'negative' : 'positive'}`}>{fmt$(t.amount)}</td>
                    <td className="text-dim text-xs">{t.account}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-3 py-1 border-t border-gray-900 text-dim text-xs">
          {results.length > 0 && `${results.length} result${results.length !== 1 ? 's' : ''}`}
          {' · '}ESC to close
        </div>
      </div>
    </div>
  );
};
