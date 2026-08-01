'use client';
// One-time nudge, after login, pointing at Settings if push notifications
// aren't on yet. Mirrors InstallPrompt's shape but not its "every load until
// installed" persistence: notifications are opt-in by nature (a permission
// prompt, not a home-screen icon), so re-nagging every reload after someone
// has already said no once would just be annoying rather than helpful. Shown
// once, ever, per device: dismissing it, or turning notifications on, both
// set a flag that's never cleared, so later turning them back off doesn't
// reopen it.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { pushSupported, currentSubscription } from '@/lib/client/pushClient';

const SEEN_KEY = 'rf_notify_nudge_seen';

export default function NotifyNudge() {
  const store = useStore();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!store.token || !pushSupported()) return;
    if (localStorage.getItem(SEEN_KEY) === '1') return;

    let cancelled = false;
    currentSubscription().then((sub) => {
      if (cancelled) return;
      const on = !!sub && Notification.permission === 'granted';
      if (!on) setShow(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [store.token]);

  function dismiss() {
    setShow(false);
    localStorage.setItem(SEEN_KEY, '1');
  }

  function goToSettings() {
    dismiss();
    router.push('/settings');
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="notify-nudge"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <div className="install-body">
            <b>Turn on notifications?</b>
            <span>A daily nudge and budget alerts, so you never lose track. Enable in Settings.</span>
          </div>
          <button className="btn primary sm" style={{ width: 'auto' }} onClick={goToSettings}>
            <Bell size={13} /> Settings
          </button>
          <button className="icon-btn" onClick={dismiss} aria-label="Dismiss"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
