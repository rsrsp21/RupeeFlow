'use client';
import { motion } from 'framer-motion';
import { Mic, Camera, Tag } from 'lucide-react';
import { rupees } from '@/lib/client/constants';
import { useUI } from './App';
import { useStore } from '@/lib/client/store';
import CategoryIcon from './CategoryIcon';
import AccountIcon from './AccountIcon';
import HoldingIcon from './HoldingIcon';

export default function TxItem({ t, index = 0 }) {
  const { openTx } = useUI();
  const { accountType, realHoldings } = useStore();
  // A transfer into a holding is an investment, not a move between accounts —
  // give it the holding's own icon and badge so it reads correctly in a list.
  // realHoldings, not holdings — a holding shadowed by an account of the same
  // name must not make an account-to-account transfer read as "invest".
  const holdingKind = (n) => realHoldings.find((h) => h.name === n)?.kind;
  const intoHolding = t.type === 'transfer' ? holdingKind(t.to_account) : undefined;
  const outOfHolding = t.type === 'transfer' ? holdingKind(t.account) : undefined;
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  const date = new Date(Number(t.occurred_at)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <motion.li
      className="tx-item"
      onClick={() => openTx({ id: t.id })}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.3), ease: 'easeOut' }}
      layout
    >
      <CategoryIcon category={t.category} transfer={t.type === 'transfer'} />
      <div className="tx-body">
        <div className="tx-note">{t.note || t.category}</div>
        <div className="tx-meta">
          <span>{date}</span>
          <span>·</span>
          {t.type === 'transfer' ? (
            <span className="tx-acct">
              {outOfHolding ? <HoldingIcon kind={outOfHolding} size={11} /> : <AccountIcon type={accountType(t.account)} size={11} />} {t.account} → {intoHolding ? <HoldingIcon kind={intoHolding} size={11} /> : <AccountIcon type={accountType(t.to_account)} size={11} />} {t.to_account}
            </span>
          ) : <span>{t.category}</span>}
          {t.type !== 'transfer' && t.account && (
            <span className="tx-acct"><AccountIcon type={accountType(t.account)} size={11} /> {t.account}</span>
          )}
          {t.project && (
            <span className="tx-tag" title="Group"><Tag size={9} style={{ verticalAlign: '-1px' }} /> {t.project}</span>
          )}
          {t.source === 'voice' && <Mic size={11} />}
          {t.source === 'receipt' && <Camera size={11} />}
        </div>
      </div>
      <div className="tx-right">
        <div className={`tx-amt ${t.type}`}>{sign}{rupees(Number(t.amount))}</div>
        <span className={`badge ${t.type}`}>{intoHolding ? 'invest' : outOfHolding ? 'withdraw' : t.type}</span>
      </div>
    </motion.li>
  );
}
