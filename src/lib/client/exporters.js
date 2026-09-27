// Export engine — CSV / PDF / JSON with configurable scope, grouping and columns.
import { DAY_MS, startOfDay, startOfWeek, startOfMonth, startOfYear } from './period';
import { normalizeGroup } from '../noteMatch';

export const COLUMNS = {
  date: { label: 'Date', get: (t) => new Date(Number(t.occurred_at)).toLocaleDateString('en-IN') },
  type: { label: 'Type', get: (t) => t.type },
  category: { label: 'Category', get: (t) => t.category },
  note: { label: 'Note', get: (t) => t.note },
  account: { label: 'Account', get: (t) => t.account },
  to_account: { label: 'To account', get: (t) => t.to_account },
  project: { label: 'Group', get: (t) => t.project },
  source: { label: 'Added via', get: (t) => t.source },
  // declared last so it sorts last by default — see orderForOutput()
  amount: { label: 'Amount (INR)', get: (t) => (t.amount / 100).toFixed(2) },
};

// Amount reads best as the right-hand column regardless of how columns were
// toggled on/off, so force it last at output time rather than relying on
// insertion order.
const orderForOutput = (cols) => [...cols.filter((c) => c !== 'amount'), ...cols.filter((c) => c === 'amount')];

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

// Resolved absolute [from, to) instants for whatever range/custom dates were
// picked — the single source of truth for filtering, labels and filenames.
export function resolveRange(opts) {
  const r = RANGES[opts.range] || RANGES.all;
  const from = opts.customFrom ?? r.from();
  const to = opts.customTo ?? (r.to ? r.to() : Date.now() + DAY_MS);
  return { from, to };
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// A relative label like "This month" means nothing once a document has been
// downloaded and opened later, so exports always spell out the actual dates.
export function formatRangeLabel(opts) {
  if (opts.range === 'all' && opts.customFrom == null && opts.customTo == null) return 'All time';
  const { from, to } = resolveRange(opts);
  const endInclusive = to - DAY_MS;
  return fmtDate(from) === fmtDate(endInclusive) ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(endInclusive)}`;
}

// Compact, sortable date tag for filenames — no ambiguous words like "month".
export function rangeFileTag(opts) {
  // An account-scoped export sits next to the all-accounts one in the
  // downloads folder, so the name has to say which is which.
  // Coerced rather than trusted: a non-string here would land in the
  // downloaded file's NAME, where it is both ugly and hard to trace back.
  // Only a single-account export names the account in the filename; several
  // would make it unreadable, and none is the all-accounts case.
  const picked = Array.isArray(opts.account) ? opts.account.filter(Boolean)
    : (typeof opts.account === 'string' && opts.account ? [opts.account] : []);
  const acct = picked.length === 1 ? picked[0] : '';
  const slug = acct
    ? `${acct.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-`
    : '';
  if (opts.range === 'all' && opts.customFrom == null && opts.customTo == null) return `${slug}all-time`;
  const { from, to } = resolveRange(opts);
  const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
  const endIso = iso(to - DAY_MS);
  return slug + (iso(from) === endIso ? iso(from) : `${iso(from)}_to_${endIso}`);
}

export function selectRows(all, opts) {
  const { from, to } = resolveRange(opts);
  let rows = all.filter((t) => t.occurred_at >= from && t.occurred_at < to);
  // "invest" and "withdraw" are not stored types — the table only allows
  // expense/income/transfer, and a holding move IS a transfer. Split them the
  // same way Ledger does: by which END of the transfer is a holding. Without
  // this, picking "Invest" matched nothing at all, and "Transfers only"
  // swept every SIP in with ordinary account-to-account moves.
  const isHolding = typeof opts.isHoldingName === 'function' ? opts.isHoldingName : () => false;

  // Every filter is multi-select: one export can cover several categories,
  // accounts or trips at once, which is the common case ("groceries AND
  // eating out", "both Goa trips"). A plain string is still accepted so an
  // older caller — or a single pick — keeps working unchanged.
  const many = (v) => (Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []));

  // "invest" and "withdraw" are not stored types — the table only allows
  // expense/income/transfer, and a holding move IS a transfer. Split them the
  // same way Ledger does: by which END of the transfer is a holding. Without
  // this, picking "Invest" matched nothing at all, and "Transfers only"
  // swept every SIP in with ordinary account-to-account moves.
  // An IOU account (money lent or borrowed) is settled the same way: its
  // movements are transfers too, so without this every "X owes me" entry
  // landed in "Transfers only" alongside the card bills the user actually
  // wanted. Lending is its own kind of movement, not an ordinary move.
  const isIOU = typeof opts.accountType === 'function'
    ? (n) => opts.accountType(n) === 'IOU'
    : () => false;
  const matchesType = (t, kind) => {
    if (kind === 'invest') return t.type === 'transfer' && isHolding(t.to_account);
    if (kind === 'withdraw') return t.type === 'transfer' && isHolding(t.account);
    if (kind === 'lent') return t.type === 'transfer' && isIOU(t.to_account);
    if (kind === 'repaid') return t.type === 'transfer' && isIOU(t.account);
    if (kind === 'transfer') {
      // A plain transfer is one between two ordinary places: no holding and
      // no IOU on either end.
      return t.type === 'transfer'
        && !isHolding(t.to_account) && !isHolding(t.account)
        && !isIOU(t.to_account) && !isIOU(t.account);
    }
    return t.type === kind;
  };
  const types = many(opts.type);
  if (types.length) rows = rows.filter((t) => types.some((kind) => matchesType(t, kind)));

  const cats = many(opts.category);
  if (cats.length) {
    const want = new Set(cats);
    rows = rows.filter((t) => want.has(t.category));
  }
  // "Only labelled" keeps entries the user actually categorised. 'Other' is
  // what every uncategorised transfer carries by default, so it counts as
  // unlabelled rather than as a category someone chose.
  if (opts.labelledOnly) rows = rows.filter((t) => t.category && t.category !== 'Other');

  const groups = many(opts.group);
  if (groups.length) {
    // Matched on normalizeGroup so a casing difference can't hide a trip's
    // entries — the same rule the group totals use.
    const want = new Set(groups.map((g) => normalizeGroup(g)));
    rows = rows.filter((t) => want.has(normalizeGroup(t.project || '')));
  }

  // Both legs, so a statement for one account still shows the transfers that
  // moved money out of it — matching how Ledger scopes to an account.
  const accounts = many(opts.account);
  if (accounts.length) {
    const want = new Set(accounts);
    rows = rows.filter((t) => want.has(t.account) || want.has(t.to_account));
  }
  return rows.sort((a, b) => a.occurred_at - b.occurred_at);
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, cols, opts = {}) {
  // The locale date column is dropped: an ISO one is emitted first and sorts
  // correctly everywhere, whereas "22/9/2026" is text to a spreadsheet and
  // is read as a US date by some of them.
  const ordered = orderForOutput(cols.filter((c) => c !== 'date'));
  // Deliberately NOT grouped under date headers the way the PDF is. A
  // spreadsheet's value is that every row stands alone: banner rows break
  // sorting, filtering and pivot tables, which is the whole reason someone
  // picks CSV over the PDF.
  //
  // What it gains instead is columns a spreadsheet can compute with: an ISO
  // date that sorts correctly in every locale, the amount split into signed
  // money plus separate in/out columns so SUM() needs no formula, and the
  // month as its own field to pivot on.
  const head = [
    'Date (ISO)', 'Day', 'Month',
    ...ordered.map((c) => COLUMNS[c].label),
    'Signed amount', 'Money in', 'Money out',
  ];

  const body = rows.map((t) => {
    const d = new Date(Number(t.occurred_at));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rupees = t.amount / 100;
    // A transfer is neither in nor out overall — it moves between the user's
    // own places — so it stays out of both columns rather than inflating one.
    const isIn = t.type === 'income';
    const isOut = t.type === 'expense';
    return [
      iso,
      d.toLocaleDateString('en-IN', { weekday: 'short' }),
      iso.slice(0, 7),
      ...ordered.map((c) => COLUMNS[c].get(t)),
      (isOut ? -rupees : rupees).toFixed(2),
      isIn ? rupees.toFixed(2) : '',
      isOut ? rupees.toFixed(2) : '',
    ].map(esc).join(',');
  });

  // A title block above the header, so a file opened months later says what
  // it covers instead of being an anonymous grid of numbers.
  const title = [
    'RupeeFlow export',
    opts.rangeLabel ? `Period,${esc(opts.rangeLabel)}` : '',
    (Array.isArray(opts.account) ? opts.account.length : opts.account)
      ? `Account,${esc([].concat(opts.account).filter(Boolean).join('; '))}` : '',
    `Entries,${rows.length}`,
    `Generated,${esc(new Date().toLocaleString('en-IN'))}`,
    '',
  ].filter((l) => l !== '');

  return [...title, head.map(esc).join(','), ...body].join('\n');
}

// Summary tables used by both PDF and the "summary only" CSV mode
export function summarize(rows, groupBy) {
  const map = new Map();
  const keyOf = (t) => {
    if (groupBy === 'category') return t.category;
    if (groupBy === 'account') return t.account;
    if (groupBy === 'group') return t.project || '(no group)';
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
  const rangeLabel = formatRangeLabel(opts);

  const inc = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  // Transfers are neither income nor spending, but they DO leave the period's
  // accounts when the destination is a holding — so a bare income-minus-
  // expenses "Net" overstates what was actually kept. Surfaced separately
  // and the label says what it measures.
  const moved = rows.filter((t) => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);

  // fixed 2 decimals throughout so a column of amounts lines up digit-under-
  // digit once right-aligned in a monospace font (e.g. 120.00 under 50.08)
  const inr = (paise) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;                       // page margin
  const INK = [24, 24, 27];
  const MUTED = [113, 113, 122];
  const RULE = [228, 228, 231];

  // ── masthead ──────────────────────────────────────────────────────────
  // A solid band rather than plain text: the first thing anyone sees when
  // this lands in an inbox, and it has to say what the document IS before
  // any number appears.
  doc.setFillColor(...INK);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setTextColor(255); doc.setFontSize(17); doc.setFont(undefined, 'bold');
  doc.text('RupeeFlow', M, 13);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(200);
  doc.text('Statement of account', M, 20);
  const picked = Array.isArray(opts.account) ? opts.account.filter(Boolean)
    : (typeof opts.account === 'string' && opts.account ? [opts.account] : []);
  const acctLabel = picked.length === 0 ? '' : picked.length <= 2 ? picked.join(', ') : `${picked.length} accounts`;
  const stamp = [acctLabel, meta.name || ''].filter(Boolean).join('  ·  ');
  doc.setFontSize(9); doc.setTextColor(255);
  doc.text(rangeLabel, pageW - M, 13, { align: 'right' });
  doc.setTextColor(200); doc.setFontSize(8);
  if (stamp) doc.text(stamp, pageW - M, 19, { align: 'right' });
  doc.text(`Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    pageW - M, 25, { align: 'right' });

  // ── headline figures ──────────────────────────────────────────────────
  // Three cards instead of a run-on line, so the numbers that matter are
  // findable at arm's length rather than read word by word.
  const cardW = (pageW - M * 2 - 8) / 3;
  const card = (i, label, value, tone) => {
    const x = M + i * (cardW + 4);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, 36, cardW, 20, 2, 2, 'F');
    doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 5, 43);
    doc.setFontSize(12); doc.setTextColor(...(tone || INK));
    doc.text(`Rs ${value}`, x + 5, 51);
  };
  card(0, 'Received', inr(inc), [22, 130, 70]);
  card(1, 'Spent', inr(exp), [185, 40, 40]);
  card(2, 'In minus out', inr(inc - exp), inc - exp >= 0 ? [22, 130, 70] : [185, 40, 40]);

  let y = 63;
  if (moved > 0) {
    doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(`Transferred / invested this period: Rs ${inr(moved)} — moved, not spent.`, M, y);
    doc.setTextColor(...INK);
    y += 8;
  }

  // Balance sheet — the ledger alone can't show what the user is actually
  // worth, and an export without it isn't a record of their position.
  if (meta.worth) {
    doc.setFontSize(12); doc.text('Position today', 14, y); y += 6;
    doc.setFontSize(10);
    const cells = [
      ['Spendable', meta.worth.spendable],
      ['Saved & invested', meta.worth.invested],
      ...(meta.worth.owed > 0 ? [['Owed to you', meta.worth.owed]] : []),
      ...(meta.worth.dues > 0 ? [['Card dues', -meta.worth.dues]] : []),
      ['Net worth', meta.worth.total],
    ];
    cells.forEach(([label, v], i) => {
      doc.text(`${label}  Rs ${inr(v)}`, 14 + (i % 3) * 62, y + Math.floor(i / 3) * 6);
    });
    y += Math.ceil(cells.length / 3) * 6 + 6;

    if (meta.holdings?.length) {
      doc.autoTable({
        startY: y,
        head: [['Holding', 'Kind', 'Value (INR)', 'Contributed (INR)', 'Gain (INR)']],
        body: meta.holdings.map((h) => [
          h.name, h.kind, inr(h.value), inr(h.contributed), inr(h.gain),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [24, 24, 27] },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }
  if (opts.includeSummary) {
    const groups = summarize(rows, opts.groupBy || 'category');
    doc.autoTable({
      startY: y,
      head: [[opts.groupBy === 'month' ? 'Month' : opts.groupBy === 'day' ? 'Day'
        : opts.groupBy === 'account' ? 'Account' : opts.groupBy === 'group' ? 'Group' : 'Category',
        'Entries', 'Spent (Rs)', 'Received (Rs)']],
      body: groups.map((g) => [g.key, g.count, inr(g.expense), inr(g.income)]),
      theme: 'striped',
      headStyles: { fillColor: [23, 23, 26], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 2: { halign: 'right', font: 'courier' }, 3: { halign: 'right', font: 'courier' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (opts.includeTransactions) {
    // The date column is dropped and becomes a banner row per day instead.
    // Repeating "27 Sep 2026" down forty rows is forty copies of one fact:
    // it crowds out the note, and the eye has to re-read each line to find
    // where one day ends and the next begins. A day header states it once
    // and carries that day's total, which the flat table could not show.
    const cols = orderForOutput(opts.columns
      .filter((c) => c !== 'date')
      .filter((c) => c !== 'to_account' || rows.some((t) => t.to_account)));
    const amtIdx = cols.indexOf('amount');
    const span = cols.length || 1;

    const byDay = new Map();
    for (const t of rows) {
      const k = new Date(Number(t.occurred_at)).toDateString();
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(t);
    }

    const body = [];
    const dayRows = new Set();      // row indexes to style as headers
    for (const [key, list] of byDay) {
      const d = new Date(key);
      const spent = list.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
      const got = list.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
      const parts = [];
      if (spent) parts.push(`- Rs ${inr(spent)}`);
      if (got) parts.push(`+ Rs ${inr(got)}`);
      const label = `${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
        + `   (${list.length} ${list.length === 1 ? 'entry' : 'entries'}${parts.length ? ` · ${parts.join('  ')}` : ''})`;
      dayRows.add(body.length);
      // One cell spanning the table, so the header reads as a divider rather
      // than as a row with empty columns after it.
      body.push([{ content: label, colSpan: span, styles: {
        fillColor: [241, 241, 245], textColor: INK, fontStyle: 'bold', fontSize: 8, cellPadding: 2.5,
      } }]);
      for (const t of list) body.push(cols.map((c) => COLUMNS[c].get(t)));
    }

    doc.autoTable({
      startY: y,
      head: [cols.map((c) => COLUMNS[c].label)],
      body,
      theme: 'plain',
      headStyles: { fillColor: INK, textColor: 255, fontSize: 8, cellPadding: 2.5 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: INK, lineColor: RULE, lineWidth: { bottom: 0.1 } },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: amtIdx >= 0 ? { [amtIdx]: { halign: 'right', font: 'courier', fontStyle: 'bold' } } : {},
      margin: { left: M, right: M },
      // A day header must not be the last thing on a page, orphaned from the
      // entries it introduces.
      rowPageBreak: 'avoid',
      didParseCell: (d) => {
        if (d.section === 'body' && dayRows.has(d.row.index)) d.cell.styles.lineWidth = 0;
      },
    });
  }

  if (opts.aiSummary) {
    doc.addPage();
    doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text('Summary', M, 20);
    doc.setDrawColor(...RULE); doc.line(M, 23, pageW - M, 23);
    doc.setFontSize(10); doc.setTextColor(60);
    doc.text(doc.splitTextToSize(opts.aiSummary, pageW - M * 2), M, 32);
  }

  // Numbered only now that every page exists — running this before the
  // summary page was added left that page unnumbered and the counts wrong.
  const pages = doc.internal.getNumberOfPages();
  const footY = doc.internal.pageSize.getHeight() - 8;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text('RupeeFlow', M, footY);
    doc.text(`Page ${i} of ${pages}`, pageW - M, footY, { align: 'right' });
  }

  doc.save(`rupeeflow-${rangeFileTag(opts)}.pdf`);
}
