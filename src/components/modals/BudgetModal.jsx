'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/client/store';
import AmountInput from '../AmountInput';
import { CATEGORIES, monthKey, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function BudgetModal({ category: initial, onClose }) {
  const store = useStore();
  const existing = store.budgets.find((x) => x.month === monthKey() && x.category === initial);
  const [category, setCategory] = useState(initial || '');
  const [amount, setAmount] = useState(existing ? Number(existing.amount) / 100 : '');
  const [carry, setCarry] = useState(!!existing?.carry_forward);

  async function save(e) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise <= 0) return store.toast('Enter a valid amount');
    await store.saveBudget({ month: monthKey(), category, amount: paise, carry_forward: carry ? 1 : 0 });
    onClose();
    store.toast('Budget saved ✓');
  }

  function remove() {
    store.deleteBudget(existing.month, existing.category);
    onClose();
    store.toast('Budget deleted');
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3>{existing ? 'Edit budget' : 'Set budget'}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={save}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Overall monthly</option>
            {[...Object.keys(CATEGORIES), ...store.customCategories.map((c) => c.name)].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="amount-input">
            <span>₹</span>
            <AmountInput placeholder="Monthly amount" required
              value={amount} onChange={setAmount} />
          </div>
          <label className="row-setting">
            <span>Carry unused forward</span>
            <input type="checkbox" className="switch" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
          </label>
          <div className="btn-row">
            {existing && <button type="button" className="btn danger-ghost" onClick={remove}>Delete</button>}
            <button className="btn primary grow" type="submit">Save budget</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
