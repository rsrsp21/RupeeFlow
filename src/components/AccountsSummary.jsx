'use client';
// Compact per-account balances, shared by Dashboard and Ledger. Deliberately a
// horizontal chip strip rather than a stacked list: with five accounts the
// list version pushed the actual ledger entries most of a screen down, and
// the point of this block is a glance at where money sits, not a table.
// On Ledger the chips double as the account filter (onPick).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import AccountIcon from './AccountIcon';

export default function AccountsSummary({ onManage, onPick, active = '' }) {
  const store = useStore();
  const balances = store.accountBalances();
  // On a laptop there's no thumb to flick the strip with and the scrollbar is
  // hidden, so overflowing chips were effectively invisible. These arrows only
  // show when the strip actually overflows.
  const stripRef = useRef(null);
  const [arrows, setArrows] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setArrows({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, store.accounts.length]);

  const nudge = (dir) => {
    const el = stripRef.current;
    if (!el) return;
    // Roughly a screenful, so a click lands on a fresh set of chips rather
    // than shuffling by one.
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!store.accounts.length) return null;

  const total = Object.values(balances).reduce((s, v) => s + v, 0);

  return (
    <div className="card acct-strip-card">
      <div className="card-head">
        <h3>Accounts</h3>
        {onManage && <a href="#" className="link" onClick={(e) => { e.preventDefault(); onManage(); }}>Manage</a>}
      </div>
      <div className="acct-strip">
        {(arrows.left || arrows.right) && (
          <button type="button" className="acct-scroll left" aria-label="Scroll accounts left"
            disabled={!arrows.left} onClick={() => nudge(-1)}>
            <ChevronLeft size={15} />
          </button>
        )}
        <div className="acct-chips" ref={stripRef} onScroll={sync}>
          {onPick && (
            <button className={`acct-chip ${!active ? 'on' : ''}`} onClick={() => onPick('')}>
              <span className="acct-chip-name">All</span>
              <b>{total < 0 ? '−' : ''}{rupees(Math.abs(total))}</b>
            </button>
          )}
          {store.accounts.map((a) => {
            const bal = balances[a.name] || 0;
            const card = a.type === 'Credit Card';
            return (
              <button key={a.name} type="button"
                className={`acct-chip ${active === a.name ? 'on' : ''} ${onPick ? '' : 'static'}`}
                onClick={onPick ? () => onPick(a.name) : undefined}>
                <AccountIcon type={a.type} size={13} />
                <span className="acct-chip-name">{a.name}</span>
                <b style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {card ? rupees(Math.abs(bal)) : `${bal < 0 ? '−' : ''}${rupees(Math.abs(bal))}`}
                </b>
              </button>
            );
          })}
        </div>
        {(arrows.left || arrows.right) && (
          <button type="button" className="acct-scroll right" aria-label="Scroll accounts right"
            disabled={!arrows.right} onClick={() => nudge(1)}>
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
