'use client';
// Amount field with Indian digit grouping applied as you type.
//
// State holds the grouped text rather than a stripped copy: toPaise() already
// ignores commas, so the displayed value is the parseable value and there's
// no second representation to keep in step (which is where cursor-jumping and
// lost keystrokes usually come from).
import { groupIndian } from '@/lib/client/constants';

export default function AmountInput({ value, onChange, ...rest }) {
  return (
    <input
      inputMode="decimal"
      {...rest}
      value={groupIndian(value)}
      onChange={(e) => onChange(groupIndian(e.target.value))}
    />
  );
}
