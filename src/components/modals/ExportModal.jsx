'use client';
// Export builder — pick format, timeline, filters, grouping and columns.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, FileSpreadsheet, Braces, Check, Sparkles } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import {
  RANGES, COLUMNS, selectRows, toCSV, toPDF, summarize, download, formatRangeLabel, rangeFileTag,
} from '@/lib/client/exporters';
import { backdropMotion, panelMotion } from './TxModal';

const DEFAULT_COLS = ['date', 'type', 'category', 'note', 'account', 'amount'];

export default function ExportModal({ onClose, initialAccount = '' }) {
  const store = useStore();
  const [format, setFormat] = useState('pdf');
  const [range, setRange] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState(initialAccount);
  const [groupBy, setGroupBy] = useState('category');
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTransactions, setIncludeTransactions] = useState(true);
  const [withAI, setWithAI] = useState(false);
  const [busy, setBusy] = useState(false);

  const opts = {
    range, type, category, account, groupBy, columns: cols, includeSummary, includeTransactions,
    customFrom: range === 'custom' && customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : undefined,
    customTo: range === 'custom' && customTo ? new Date(`${customTo}T00:00:00`).getTime() + 86400000 : undefined,
  };
  const rows = useMemo(() => selectRows(store.live(), opts),
    [store.txs, range, type, category, account, customFrom, customTo]); // eslint-disable-line
  const totals = store.totals(rows);

  const toggleCol = (c) =>
    setCols((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...DEFAULT_COLS, ...Object.keys(COLUMNS)]
      .filter((k, i, a) => a.indexOf(k) === i).filter((k) => prev.includes(k) || k === c)));

  async function run() {
    if (!rows.length) return store.toast('Nothing to export in that range');
    setBusy(true);
    try {
      const tag = rangeFileTag(opts);
      if (format === 'csv') {
        const csv = includeSummary && !includeTransactions
          ? ['Group,Entries,Spent (INR),Received (INR)',
             ...summarize(rows, groupBy).map((g) => `${JSON.stringify(g.key)},${g.count},${(g.expense / 100).toFixed(2)},${(g.income / 100).toFixed(2)}`)].join('\n')
          : toCSV(rows, cols);
        download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `rupeeflow-${tag}.csv`);
      } else if (format === 'json') {
        // A bare array of transactions can't rebuild balances — opening
        // balances, credit limits and holdings all live outside the ledger.
        // JSON is the "everything" format, so it carries the lot.
        const backup = {
          app: 'RupeeFlow',
          exported_at: new Date().toISOString(),
          range: formatRangeLabel(opts),
          accounts: store.accounts,
          holdings: store.holdings,
          budgets: store.budgets,
          categories: store.customCategories,
          net_worth_paise: store.netWorth(),
          transactions: rows,
        };
        download(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `rupeeflow-${tag}.json`);
      } else {
        let aiSummary = '';
        if (withAI) {
          store.toast('Writing AI summary…');
          try {
            const { insight } = await store.api('/ai/insights', {
              method: 'POST', body: JSON.stringify({ summary: store.buildSummary(365) }),
            });
            aiSummary = insight;
          } catch { /* export still proceeds without it */ }
        }
        const hBal = store.holdingBalances(), hPut = store.holdingContributed();
        await toPDF(rows, { ...opts, aiSummary }, {
          name: store.name,
          worth: store.netWorth(),
          holdings: store.holdings.map((h) => ({
            name: h.name, kind: h.kind,
            value: hBal[h.name] || 0,
            contributed: hPut[h.name] || 0,
            gain: h.valued_at ? (hBal[h.name] || 0) - (hPut[h.name] || 0) : 0,
          })),
        });
      }
      store.toast(`Exported ${rows.length} entries`);
      onClose();
    } catch (e) {
      store.toast('Export failed: ' + e.message);
    }
    setBusy(false);
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal export-modal" {...panelMotion}>
        <div className="modal-head">
          <h3>Export data</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="export-body">
          <div className="field">
            <span className="field-label">Format</span>
            <div className="fmt-grid">
              {[['pdf', 'PDF report', FileText], ['csv', 'CSV / Excel', FileSpreadsheet], ['json', 'JSON backup', Braces]]
                .map(([k, label, Icon]) => (
                  <button key={k} className={`fmt-card ${format === k ? 'on' : ''}`} onClick={() => setFormat(k)}>
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                  </button>
                ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Timeline</span>
            <div className="pill-grid">
              {Object.entries(RANGES).map(([k, v]) => (
                <button key={k} className={`pill-btn ${range === k ? 'on' : ''}`} onClick={() => setRange(k)}>{v.label}</button>
              ))}
              <button className={`pill-btn ${range === 'custom' ? 'on' : ''}`} onClick={() => setRange('custom')}>Custom range</button>
            </div>
            {range === 'custom' && (
              <div className="form-row labelled" style={{ marginTop: 8 }}>
                <label>
                  <span>From</span>
                  <input type="date" value={customFrom} max={customTo || undefined}
                    onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" value={customTo} min={customFrom || undefined}
                    max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 8 }}>
              Exporting: {formatRangeLabel(opts)}{account ? ` · ${account}` : ''}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Filters</span>
            <div className="form-row">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option><option value="expense">Expenses only</option>
                <option value="income">Income only</option><option value="transfer">Transfers only</option>
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {[...Object.keys(CATEGORIES), ...store.customCategories.map((c) => c.name)].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {store.accounts.length > 0 && (
              <div className="form-row" style={{ marginTop: 8 }}>
                <select value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">All accounts</option>
                  {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {format !== 'json' && (
            <div className="field">
              <span className="field-label">Summarise by</span>
              <div className="pill-grid">
                {[['category', 'Category'], ['month', 'Month'], ['day', 'Day'], ['account', 'Account'], ['group', 'Group']]
                  .map(([k, label]) => (
                    <button key={k} className={`pill-btn ${groupBy === k ? 'on' : ''}`} onClick={() => setGroupBy(k)}>{label}</button>
                  ))}
              </div>
            </div>
          )}

          {format !== 'json' && (
            <div className="field">
              <span className="field-label">Include</span>
              <label className="row-setting compact">
                <span>Summary table</span>
                <input type="checkbox" className="switch" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
              </label>
              <label className="row-setting compact">
                <span>Every transaction</span>
                <input type="checkbox" className="switch" checked={includeTransactions} onChange={(e) => setIncludeTransactions(e.target.checked)} />
              </label>
              {format === 'pdf' && (
                <label className="row-setting compact">
                  <span><Sparkles size={13} style={{ verticalAlign: '-2px' }} /> AI written summary page</span>
                  <input type="checkbox" className="switch" checked={withAI} onChange={(e) => setWithAI(e.target.checked)} />
                </label>
              )}
            </div>
          )}

          {format !== 'json' && includeTransactions && (
            <div className="field">
              <span className="field-label">Columns</span>
              <div className="pill-grid">
                {Object.entries(COLUMNS).map(([k, v]) => (
                  <button key={k} className={`pill-btn ${cols.includes(k) ? 'on' : ''}`}
                    onClick={() => setCols((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])}>
                    {cols.includes(k) && <Check size={11} strokeWidth={2.6} />} {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="export-foot">
          <div className="export-preview">
            <b>{rows.length}</b> entries · <b>{rupees(totals.exp)}</b> spent · <b>{rupees(totals.inc)}</b> received
          </div>
          <button className="btn primary" onClick={run} disabled={busy || !rows.length}>
            {busy ? 'Preparing…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
