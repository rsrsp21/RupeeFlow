'use client';
import { StoreProvider } from '@/lib/client/store';
import App from '@/components/App';

export default function Page() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
