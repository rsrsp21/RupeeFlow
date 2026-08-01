'use client';
// "Install RupeeFlow" — a real install button where the browser offers one,
// and manual instructions on iOS Safari, which has no install API at all.
//
// This used to ignore `beforeinstallprompt` on the assumption that Chrome and
// Edge show their own install UI. They largely don't any more: Android's
// mini-infobar was removed years ago, and on desktop it's a small omnibox
// icon that's easy to miss entirely. Skipping the event meant there was no
// install affordance anywhere except iOS. Capturing it gives a button that
// opens the browser's own installer on click.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Share, Download } from 'lucide-react';

// Showing it once and then staying quiet for a few days reads as helpful;
// showing it on every single reload reads as nagging. A hard "X" dismiss
// opts out forever; just seeing it starts this softer cooldown too.
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // the browser's install event
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (standalone) {
      // Installed: ask the browser to keep our data (prevents eviction under storage pressure)
      navigator.storage?.persist?.().catch(() => {});
      return;
    }

    const optedOut = localStorage.getItem('rf_install_dismissed') === '1'
      || Date.now() < Number(localStorage.getItem('rf_install_snooze_until') || 0);

    // Fires only when the browser already considers the app installable
    // (manifest + service worker + https, and not installed yet), so none of
    // that has to be checked here. It's registered unconditionally because it
    // can fire before this effect runs otherwise.
    const onPrompt = (e) => {
      e.preventDefault();
      if (optedOut) return;
      setDeferred(e);
      localStorage.setItem('rf_install_snooze_until', String(Date.now() + SNOOZE_MS));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => { setDeferred(null); setShowIOS(false); };
    window.addEventListener('appinstalled', onInstalled);

    if (!optedOut) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
      if (isIOS && isSafari) {
        setShowIOS(true);
        localStorage.setItem('rf_install_snooze_until', String(Date.now() + SNOOZE_MS));
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    // The event is single-use either way, so the banner goes regardless of
    // what they chose — re-showing it would need a fresh event anyway.
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
  }

  function close() {
    setDismissed(true);
    localStorage.setItem('rf_install_dismissed', '1');
  }

  const open = !dismissed && (deferred || showIOS);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="install-prompt"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <div className="install-body">
            <b>Install RupeeFlow</b>
            {deferred
              ? <span>Add it to your device — opens instantly and works offline.</span>
              : <span>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> then “Add to Home Screen.” Works offline after that.</span>}
          </div>
          {deferred && (
            <button className="btn primary sm" style={{ width: 'auto' }} onClick={install}>
              <Download size={13} /> Install
            </button>
          )}
          <button className="icon-btn" onClick={close} aria-label="Dismiss"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
