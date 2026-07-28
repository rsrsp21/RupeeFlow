// Web Push via VAPID. Subscriptions live in D1; sends go out from the cron
// route. Expired/gone endpoints (404/410) are pruned automatically so the
// table doesn't fill with dead devices.
import webpush from 'web-push';
import { q } from './db.js';

let configured = false;

function configure() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured on the server');
  }
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:noreply@rupeeflow.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
}

export async function saveSubscription(userId, sub) {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('Invalid push subscription');
  // Re-subscribing on the same device returns the same endpoint, so upsert.
  await q(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [endpoint, userId, p256dh, auth, Date.now()],
  );
}

export async function removeSubscription(userId, endpoint) {
  if (!endpoint) return;
  await q('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
}

// Sends one payload to every device belonging to `userId`.
// Returns how many actually went out.
export async function sendToUser(userId, payload) {
  configure();
  const { rows } = await q('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
  let sent = 0;
  for (const r of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e) {
      // 404/410 mean the browser dropped this subscription for good.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await q('DELETE FROM push_subscriptions WHERE endpoint = ?', [r.endpoint]).catch(() => {});
      }
    }
  }
  return sent;
}
