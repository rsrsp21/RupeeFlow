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

export async function enablePush(api) {
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

  await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
  return sub;
}

export async function disablePush(api) {
  const sub = await currentSubscription();
  if (!sub) return;
  // Drop it server-side first — if unsubscribe() succeeds but the DELETE
  // fails we'd keep pushing to a dead endpoint until it 410s.
  await api('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe();
}
