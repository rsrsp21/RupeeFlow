// The browser needs the VAPID public key to create a subscription.
// Public by design — it's the counterpart to the private key, not a secret.
export const runtime = 'nodejs';

import { jsonRes, errRes, HttpError } from '@/lib/auth';

export async function GET() {
  try {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) throw new HttpError('Push notifications are not configured on this server', 503);
    return jsonRes({ key });
  } catch (e) { return errRes(e); }
}
