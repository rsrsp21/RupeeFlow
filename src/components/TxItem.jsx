'use client';
import { motion } from 'framer-motion';
import { Mic, Camera } from 'lucide-react';
import { rupees } from '@/lib/client/constants';
import { useUI } from './App';
import CategoryIcon from './CategoryIcon';

export default function TxItem({ t, index = 0 }) {
  const { openTx } = useUI();
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
          <span>{t.type === 'transfer' ? `${t.account} → ${t.to_account}` : t.category}</span>
          {t.project ? <span className="tx-tag">{t.project}</span> : null}
          {t.source === 'voice' && <Mic size={11} />}
          {t.source === 'receipt' && <Camera size={11} />}
        </div>
      </div>
      <div className="tx-right">
        <div className={`tx-amt ${t.type}`}>{sign}{rupees(Number(t.amount))}</div>
        <span className={`badge ${t.type}`}>{t.type}</span>
      </div>
    </motion.li>
  );
}
