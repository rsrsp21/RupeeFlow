'use client';
// Generic "are you sure" dialog — used before any destructive delete
// (ledger entries, accounts) so a stray tap can't destroy something silently.
import { motion } from 'framer-motion';
import { backdropMotion, panelMotion } from './TxModal';

export default function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <motion.div className="modal confirm-modal" {...panelMotion}>
        <h3>{title}</h3>
        <p className="muted small">{message}</p>
        <div className="btn-row">
          <button type="button" className="btn ghost grow" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn danger grow" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
