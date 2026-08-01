'use client';
// Compact per-account balances, shared by Dashboard and Ledger. Deliberately a
// horizontal chip strip rather than a stacked list: with five accounts the
// list version pushed the actual ledger entries most of a screen down, and
// the point of this block is a glance at where money sits, not a table.
// On Ledger the chips double as the account filter (onPick).
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import AccountIcon from './AccountIcon';

export default function AccountsSummary({ onManage, onPick, active = '' }) {
  const store = useStore();
  const balances = store.accountBalances();
  if (!store.accounts.length) return null;

  const total = Object.values(balances).reduce((s, v) => s + v, 0);

  return (
    <div className="card acct-strip-card">
      <div className="card-head">
        <h3>Accounts</h3>
        {onManage && <a href="#" className="link" onClick={(e) => { e.preventDefault(); onManage(); }}>Manage</a>}
      </div>
      <div className="acct-chips">
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
              <b style={{ color: active === a.name ? '#fff' : bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                {card ? rupees(Math.abs(bal)) : `${bal < 0 ? '−' : ''}${rupees(Math.abs(bal))}`}
              </b>
            </button>
          );
        })}
      </div>
    </div>
  );
}
