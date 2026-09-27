'use client';
// One filter dimension: a summary line that expands into a checkbox list.
//
// Shared by the Ledger and the export builder so the two stay consistent —
// they offer the same filters and should behave identically.
//
// Not a chip grid and not <select multiple>: twenty-odd categories as chips
// buries everything below them, and the native multi-select needs a long-press
// on Android and renders as an odd scrolling list on iOS. A collapsed row
// stays one line however many options it holds, and says what is selected
// without being opened.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FilterRow({ label, options, values, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  // Nothing selected means "all of them", so that is what the summary says
  // rather than leaving it blank and looking broken.
  const chosen = options.filter(([v]) => values.includes(v)).map(([, text]) => text);
  const summary = chosen.length === 0 ? `All ${label.toLowerCase()}`
    : chosen.length <= 2 ? chosen.join(', ')
    : `${chosen.length} selected`;

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
            <label key={value || '__none'} className="filter-opt">
              <input type="checkbox" checked={values.includes(value)} onChange={() => onToggle(value)} />
              <span>{text}</span>
            </label>
          ))}
          {values.length > 0 && (
            <button type="button" className="btn ghost sm filter-clear" onClick={onClear}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}
