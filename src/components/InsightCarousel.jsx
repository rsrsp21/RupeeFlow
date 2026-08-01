'use client';
// Dashboard insight tiles. On a phone these are shown one at a time and
// advance on a loop — three stacked tiles was the main thing pushing the
// spending charts below the fold, and a scroll strip meant most of them
// never got seen. Desktop has the width for all of them at once, so it keeps
// the plain grid.
import { Children, useEffect, useState } from 'react';

const ADVANCE_MS = 4500;

function useIsNarrow(bp = 880) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [bp]);
  return narrow;
}

export default function InsightCarousel({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  const narrow = useIsNarrow();
  const [i, setI] = useState(0);
  // Tapping a dot means "I want this one" — stop moving the page under them.
  const [held, setHeld] = useState(false);

  // Insight tiles come and go with the data (a streak ends, a budget is set),
  // so an index can outlive the list it points at.
  useEffect(() => { if (i >= items.length) setI(0); }, [items.length, i]);

  useEffect(() => {
    if (!narrow || held || items.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % items.length), ADVANCE_MS);
    return () => clearInterval(id);
  }, [narrow, held, items.length]);

  if (!items.length) return null;
  if (!narrow) return <div className="insight-strip">{items}</div>;

  return (
    <div className="insight-carousel">
      <div className="insight-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {items.map((child, n) => <div className="insight-slide" key={n}>{child}</div>)}
      </div>
      {items.length > 1 && (
        <div className="insight-dots">
          {items.map((_, n) => (
            <button key={n} type="button" className={n === i ? 'on' : ''}
              onClick={() => { setI(n); setHeld(true); }}
              aria-label={`Insight ${n + 1} of ${items.length}`} />
          ))}
        </div>
      )}
    </div>
  );
}
