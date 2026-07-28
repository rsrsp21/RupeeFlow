export const runtime = 'nodejs';

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { saveSubscription, removeSubscription } from '@/lib/push';

export async function POST(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { subscription } = await request.json().catch(() => ({}));
    await saveSubscription(userId, subscription);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}

export async function DELETE(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { endpoint } = await request.json().catch(() => ({}));
    await removeSubscription(userId, endpoint);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}
