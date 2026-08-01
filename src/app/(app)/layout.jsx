'use client';
// Shared shell for every screen: store, nav, FAB, modals and the auth gate.
// It's a layout rather than part of each page so navigating between screens
// never remounts the store or replays the sync — only the page swaps.
import { StoreProvider } from '@/lib/client/store';
import App from '@/components/App';
import InstallPrompt from '@/components/InstallPrompt';

export default function AppLayout({ children }) {
  return (
    <StoreProvider>
      <App>{children}</App>
      {/* Outside App so it survives the signed-out/signed-in swap and the
          route changes — a single instance for the whole session. */}
      <InstallPrompt />
    </StoreProvider>
  );
}
