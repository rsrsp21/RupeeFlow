// Browser side of Web Push: permission, subscribe/unsubscribe, and keeping
// the server's subscription table in step with the browser's own state.

export const pushSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window
  && 'serviceWorker' in navigator && 'PushManager' in window;

// VAPID keys travel as base64url; PushManager wants raw bytes.
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Resolves as soon as the browser subscription itself is live (permission +
// PushManager, both fast) — the D1 write is fired in the background instead
// of making the toggle wait on that round-trip. `onSyncFailed` fires (and
// the local subscription is rolled back) only if the save actually fails.
export async function enablePush(api, onSyncFailed) {
  if (!pushSupported()) throw new Error('This browser does not support notifications');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked. Enable them in your browser’s site settings.'
      : 'Notification permission was dismissed');
  }

  const { key } = await api('/push/key');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

  api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) })
    .catch(async (e) => {
      await sub.unsubscribe().catch(() => {});
      onSyncFailed?.(e);
    });

  return sub;
}

export async function disablePush(api) {
  const sub = await currentSubscription();
  if (!sub) return;
  // Unsubscribe locally first so the toggle doesn't wait on the D1 delete —
  // if that background call fails, the dead endpoint just gets pruned on
  // its next 404/410 anyway (see sendToUser in lib/push.js).
  await sub.unsubscribe();
  api('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
}
