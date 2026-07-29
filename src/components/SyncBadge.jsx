'use client';
// Same status the desktop sidebar's sync-dot shows, but placed beside each
// screen's own heading so it's visible on mobile too (the sidebar — and its
// dot — is hidden there). Replaces the old floating "Offline" banner.
import { useStore } from '@/lib/client/store';

export default function SyncBadge() {
  const { syncState } = useStore();
  const label = syncState === 'online' ? 'Synced' : syncState === 'pending' ? 'Syncing' : 'Offline';
  const tip = syncState === 'online' ? 'All entries synced'
    : syncState === 'pending' ? 'Syncing your entries…'
    : 'Entries save on this device and sync when you reconnect';
  return (
    <span className={`sync-badge ${syncState === 'online' ? 'online' : syncState === 'pending' ? 'pending' : ''}`} title={tip}>
      <span className="sync-badge-dot" />{label}
    </span>
  );
}
