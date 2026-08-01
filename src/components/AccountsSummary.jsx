'use client';
// Compact per-account balance list — shared by Dashboard and Ledger so both
// give an at-a-glance "where's my money" view without duplicating the
// Settings account editor (that's still where you add/remove/set starting
// balances; this is read-only).
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import AccountIcon from './AccountIcon';

export default function AccountsSummary({ onManage }) {
  const store = useStore();
  const balances = store.accountBalances();
  if (!store.accounts.length) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Accounts</h3>
        {onManage && <a href="#" className="link" onClick={(e) => { e.preventDefault(); onManage(); }}>Manage</a>}
      </div>
      <div className="acct-list">
        {store.accounts.map((a) => {
          const bal = balances[a.name] || 0;
          return (
            <div className="acct-row" key={a.name}>
              <AccountIcon type={a.type} tile size={15} />
              <span className="acct-name">{a.name}</span>
              <b className="acct-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                {bal < 0 ? '−' : ''}{rupees(Math.abs(bal))}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
