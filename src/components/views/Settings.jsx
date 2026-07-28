'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/client/store';
import { monthKey, rupees } from '@/lib/client/constants';

export default function Settings() {
  const store = useStore();
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(document.documentElement.dataset.theme === 'dark'); }, []);

  function toggleTheme(v) {
    setDark(v);
    document.documentElement.dataset.theme = v ? 'dark' : 'light';
    localStorage.setItem('rf_theme', v ? 'dark' : 'light');
  }

  function exportCSV() {
    const rows = [['Date', 'Type', 'Amount (INR)', 'Category', 'Note', 'Project', 'Account', 'To Account', 'Source']];
    for (const t of store.live().sort((a, b) => a.occurred_at - b.occurred_at)) {
      rows.push([new Date(Number(t.occurred_at)).toISOString().slice(0, 10), t.type, (t.amount / 100).toFixed(2),
        t.category, t.note, t.project, t.account, t.to_account, t.source]);
    }
    const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), `rupeeflow-${monthKey()}.csv`);
    store.toast('CSV exported ✓');
  }

  async function exportPDF() {
    store.toast('Building PDF…');
    try {
      if (!window.jspdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const monthList = store.live().filter((t) => store.inMonth(t));
      const { inc, exp } = store.totals(monthList);
      doc.setFontSize(20); doc.text('RupeeFlow — Monthly Report', 14, 20);
      doc.setFontSize(11); doc.setTextColor(120);
      doc.text(`${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}  ·  ${store.email}`, 14, 28);
      doc.setTextColor(0);
      doc.text(`Income: Rs ${(inc / 100).toLocaleString('en-IN')}    Expenses: Rs ${(exp / 100).toLocaleString('en-IN')}    Net: Rs ${((inc - exp) / 100).toLocaleString('en-IN')}`, 14, 38);
      doc.autoTable({
        startY: 46, head: [['Category', 'Spent (Rs)']],
        body: Object.entries(store.catSpend()).sort((a, b) => b[1] - a[1])
          .map(([c, v]) => [c, (v / 100).toLocaleString('en-IN')]),
        theme: 'striped', headStyles: { fillColor: [14, 159, 110] },
      });
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 8,
        head: [['Date', 'Type', 'Amount (Rs)', 'Category', 'Note', 'Project']],
        body: monthList.sort((a, b) => b.occurred_at - a.occurred_at)
          .map((t) => [new Date(Number(t.occurred_at)).toLocaleDateString('en-IN'), t.type,
            (t.amount / 100).toLocaleString('en-IN'), t.category, t.note, t.project]),
        theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [14, 159, 110] },
      });
      doc.save(`rupeeflow-report-${monthKey()}.pdf`);
      store.toast('PDF report exported ✓');
    } catch { store.toast('PDF failed (needs internet once to load library)'); }
  }

  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Settings</h2><p className="sub">{store.email}</p></div>
      </header>

      <div className="card">
        <h3>Appearance</h3>
        <label className="row-setting">
          <span>Dark mode</span>
          <input type="checkbox" className="switch" checked={dark} onChange={(e) => toggleTheme(e.target.checked)} />
        </label>
      </div>

      <div className="card">
        <h3>Export</h3>
        <div className="btn-row">
          <button className="btn ghost" onClick={exportCSV}>Export CSV</button>
          <button className="btn ghost" onClick={exportPDF}>Export PDF report</button>
        </div>
      </div>

      <div className="card">
        <h3>Sync</h3>
        <p className="muted">
          {store.lastSync
            ? `Last synced ${new Date(store.lastSync).toLocaleTimeString('en-IN')} · auto-syncs every few seconds`
            : 'Waiting for first sync…'}
        </p>
        <button className="btn ghost" onClick={() => { store.toast('Syncing…'); store.syncNow(); }}>Sync now</button>
      </div>

      <div className="card">
        <h3>Account</h3>
        <button className="btn danger-ghost" onClick={store.logout}>Sign out</button>
      </div>
    </section>
  );
}

const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
