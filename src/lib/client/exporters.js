// Export engine — CSV / PDF / JSON with configurable scope, grouping and columns.
import { rupees, monthKey, CATEGORIES } from './constants';
import { DAY_MS, startOfDay, startOfWeek, startOfMonth, startOfYear } from './period';

export const COLUMNS = {
  date: { label: 'Date', get: (t) => new Date(Number(t.occurred_at)).toLocaleDateString('en-IN') },
  type: { label: 'Type', get: (t) => t.type },
  amount: { label: 'Amount (INR)', get: (t) => (t.amount / 100).toFixed(2) },
  category: { label: 'Category', get: (t) => t.category },
  note: { label: 'Note', get: (t) => t.note },
  project: { label: 'Project', get: (t) => t.project },
  account: { label: 'Account', get: (t) => t.account },
  to_account: { label: 'To account', get: (t) => t.to_account },
  source: { label: 'Added via', get: (t) => t.source },
};

export const RANGES = {
  month: { label: 'This month', from: () => startOfMonth() },
  lastMonth: {
    label: 'Last month',
    from: () => { const d = new Date(startOfMonth()); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); },
    to: () => startOfMonth(),
  },
  week: { label: 'This week', from: () => startOfWeek() },
  last30: { label: 'Last 30 days', from: () => startOfDay() - 29 * DAY_MS },
  last90: { label: 'Last 90 days', from: () => startOfDay() - 89 * DAY_MS },
  year: { label: 'This year', from: () => startOfYear() },
  all: { label: 'All time', from: () => 0 },
};

export function selectRows(all, opts) {
  const r = RANGES[opts.range] || RANGES.all;
  const from = opts.customFrom ?? r.from();
  const to = opts.customTo ?? (r.to ? r.to() : Date.now() + DAY_MS);
  let rows = all.filter((t) => t.occurred_at >= from && t.occurred_at < to);
  if (opts.type) rows = rows.filter((t) => t.type === opts.type);
  if (opts.category) rows = rows.filter((t) => t.category === opts.category);
  if (opts.project) rows = rows.filter((t) => t.project === opts.project);
  return rows.sort((a, b) => a.occurred_at - b.occurred_at);
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, cols) {
  const head = cols.map((c) => COLUMNS[c].label).join(',');
  const body = rows.map((t) => cols.map((c) => esc(COLUMNS[c].get(t))).join(','));
  return [head, ...body].join('\n');
}

// Summary tables used by both PDF and the "summary only" CSV mode
export function summarize(rows, groupBy) {
  const map = new Map();
  const keyOf = (t) => {
    if (groupBy === 'category') return t.category;
    if (groupBy === 'project') return t.project || '(no project)';
    if (groupBy === 'account') return t.account;
    if (groupBy === 'month') return new Date(Number(t.occurred_at)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (groupBy === 'day') return new Date(Number(t.occurred_at)).toLocaleDateString('en-IN');
    return 'All';
  };
  for (const t of rows) {
    const k = keyOf(t);
    if (!map.has(k)) map.set(k, { key: k, expense: 0, income: 0, count: 0 });
    const g = map.get(k);
    if (t.type === 'expense') g.expense += t.amount;
    else if (t.type === 'income') g.income += t.amount;
    g.count++;
  }
  return [...map.values()].sort((a, b) => b.expense - a.expense);
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});

export async function ensureJsPDF() {
  if (!window.jspdf) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  }
  return window.jspdf.jsPDF;
}

export async function toPDF(rows, opts, meta) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation: opts.orientation || 'portrait' });
  const rangeLabel = RANGES[opts.range]?.label || 'Custom range';

  const inc = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  doc.setFontSize(18); doc.text('RupeeFlow', 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`${rangeLabel}  ·  ${meta.email}  ·  generated ${new Date().toLocaleDateString('en-IN')}`, 14, 25);

  doc.setTextColor(20); doc.setFontSize(11);
  doc.text(`Income  Rs ${(inc / 100).toLocaleString('en-IN')}`, 14, 36);
  doc.text(`Expenses  Rs ${(exp / 100).toLocaleString('en-IN')}`, 74, 36);
  doc.text(`Net  Rs ${((inc - exp) / 100).toLocaleString('en-IN')}`, 144, 36);

  let y = 44;
  if (opts.includeSummary) {
    const groups = summarize(rows, opts.groupBy || 'category');
    doc.autoTable({
      startY: y,
      head: [[opts.groupBy === 'month' ? 'Month' : opts.groupBy === 'day' ? 'Day'
        : opts.groupBy === 'project' ? 'Project' : opts.groupBy === 'account' ? 'Account' : 'Category',
        'Entries', 'Spent (Rs)', 'Received (Rs)']],
      body: groups.map((g) => [g.key, g.count, (g.expense / 100).toLocaleString('en-IN'),
        (g.income / 100).toLocaleString('en-IN')]),
      theme: 'striped',
      headStyles: { fillColor: [23, 23, 26], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (opts.includeTransactions) {
    const cols = opts.columns.filter((c) => c !== 'to_account' || rows.some((t) => t.to_account));
    doc.autoTable({
      startY: y,
      head: [cols.map((c) => COLUMNS[c].label)],
      body: rows.map((t) => cols.map((c) => COLUMNS[c].get(t))),
      theme: 'grid',
      headStyles: { fillColor: [23, 23, 26], fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 },
    });
  }

  if (opts.aiSummary) {
    doc.addPage();
    doc.setFontSize(13); doc.setTextColor(20);
    doc.text('AI summary', 14, 20);
    doc.setFontSize(10); doc.setTextColor(60);
    doc.text(doc.splitTextToSize(opts.aiSummary, 180), 14, 30);
  }

  doc.save(`rupeeflow-${opts.range}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
