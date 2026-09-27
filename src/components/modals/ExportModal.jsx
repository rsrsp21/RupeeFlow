'use client';
// Export builder — pick format, timeline, filters, grouping and columns.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, FileSpreadsheet, Braces, Check, Sparkles, ChevronDown } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import {
  RANGES, COLUMNS, selectRows, toCSV, toPDF, summarize, download, formatRangeLabel, rangeFileTag,
} from '@/lib/client/exporters';
import { backdropMotion, panelMotion } from './TxModal';

const DEFAULT_COLS = ['date', 'type', 'category', 'note', 'account', 'amount'];

// One filter dimension: a summary line that expands into a checkbox list.
// Kept out of the main component because all four behave identically, and
// four inline copies of this markup was most of what made the dialog long.
function FilterRow({ label, options, values, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const summary = values.length === 0 ? `All ${label.toLowerCase()}`
    : values.length <= 2 ? values.join(', ')
    : `${values.length} selected`;
  return (
    <div className={`filter-row ${open ? 'open' : ''}`}>
      <button type="button" className="filter-head" onClick={() => setOpen((v) => !v)}>
        <span className="filter-name">{label}</span>
        <span className={`filter-summary ${values.length ? 'on' : ''}`}>{summary}</span>
        <ChevronDown size={14} className="filter-chevron" />
      </button>
      {open && (
        <div className="filter-opts">
          {options.map(([value, text]) => (
            <label key={value} className="filter-opt">
              <input type="checkbox" checked={values.includes(value)} onChange={() => onToggle(value)} />
              <span>{text}</span>
            </label>
          ))}
          {values.length > 0 && (
            <button type="button" className="btn ghost sm filter-clear" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExportModal({ onClose, initialAccount = '' }) {
  const store = useStore();
  const [format, setFormat] = useState('pdf');
  const [range, setRange] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Arrays, not strings: each filter takes several values. Rendered as
  // toggleable chips rather than <select multiple>, which on a phone needs a
  // long-press on Android and renders as an odd scrolling list on iOS.
  const [type, setType] = useState([]);
  const [category, setCategory] = useState([]);
  const [account, setAccount] = useState(initialAccount ? [initialAccount] : []);
  const [group, setGroup] = useState([]);
  // Transfers are mostly uncategorised, so an export of them is a wall of
  // "Other". This keeps only the ones deliberately labelled.
  const groupOptions = store.groupNames();
  const activeFilters = type.length + category.length + account.length + group.length;
  // One toggle helper for all four, so adding a filter is one line.
  const toggle = (setter) => (v) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const [groupBy, setGroupBy] = useState('category');
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTransactions, setIncludeTransactions] = useState(true);
  const [withAI, setWithAI] = useState(false);
  const [busy, setBusy] = useState(false);

  const opts = {
    range, type, category, account, group, groupBy, columns: cols, includeSummary, includeTransactions,
    // selectRows needs this to tell a SIP from an account-to-account move;
    // only the store knows which names are holdings.
    isHoldingName: store.isHoldingName,
    // Lets selectRows keep IOU movements out of "Transfers only" — only the
    // store knows which accounts are IOUs.
    accountType: store.accountType,
    customFrom: range === 'custom' && customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : undefined,
    customTo: range === 'custom' && customTo ? new Date(`${customTo}T00:00:00`).getTime() + 86400000 : undefined,
  };
  const rows = useMemo(() => selectRows(store.live(), opts),
    [store.txs, range, type, category, account, group, customFrom, customTo]); // eslint-disable-line
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
          : toCSV(rows, cols, { rangeLabel: formatRangeLabel(opts), account });
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
              Exporting: {formatRangeLabel(opts)}
              {account.length ? ` · ${account.length <= 2 ? account.join(', ') : `${account.length} accounts`}` : ''}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Filters</span>
            {/* Collapsed rows, not a chip wall: with twenty-odd categories and
                a handful of accounts, laying every option out at once buries
                the rest of the dialog. Each row shows what is selected and
                opens a checkbox list only when tapped. Nothing selected means
                "all of them", so the common case needs no taps at all. */}
            <FilterRow label="Type" values={type} onToggle={toggle(setType)} onClear={() => setType([])}
              options={[['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers'],
                ['invest', 'Invested / saved'], ['withdraw', 'Withdrawn from savings'],
                ...(store.accounts.some((a) => a.type === 'IOU')
                  ? [['lent', 'Lent / owed'], ['repaid', 'Repaid / settled']] : [])]} />
            <FilterRow label="Category" values={category} onToggle={toggle(setCategory)} onClear={() => setCategory([])}
              options={[...Object.keys(CATEGORIES), ...store.customCategories.map((c) => c.name)].map((c) => [c, c])} />
            {store.accounts.length > 0 && (
              <FilterRow label="Account" values={account} onToggle={toggle(setAccount)} onClear={() => setAccount([])}
                options={store.accounts.map((a) => [a.name, a.name])} />
            )}
            {groupOptions.length > 0 && (
              <FilterRow label="Group / trip" values={group} onToggle={toggle(setGroup)} onClear={() => setGroup([])}
                options={groupOptions.map((g) => [g, g])} />
            )}

            {activeFilters > 0 && (
              <button type="button" className="btn ghost sm" style={{ marginTop: 10 }}
                onClick={() => { setType([]); setCategory([]); setAccount([]); setGroup([]); }}>
                Clear {activeFilters} {activeFilters === 1 ? 'filter' : 'filters'}
              </button>
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
