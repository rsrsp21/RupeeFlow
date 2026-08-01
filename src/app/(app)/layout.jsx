'use client';
// Shared shell for every screen: store, nav, FAB, modals and the auth gate.
// It's a layout rather than part of each page so navigating between screens
// never remounts the store or replays the sync — only the page swaps.
import { StoreProvider } from '@/lib/client/store';
import App from '@/components/App';

export default function AppLayout({ children }) {
  return (
    <StoreProvider>
      <App>{children}</App>
    </StoreProvider>
  );
}
