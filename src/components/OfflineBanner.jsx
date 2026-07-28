'use client';
// Offline is a normal state here — entries still save locally and sync later.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div className="offline-banner"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          <WifiOff size={13} strokeWidth={2} />
          Offline: entries save on this device and sync when you reconnect
        </motion.div>
      )}
    </AnimatePresence>
  );
}
