// Each queued transaction is a separate D1 REST round-trip (see pushTransactions),
// so a large offline backlog can take longer than Vercel's default serverless
// timeout — raise the ceiling the same way the AI routes already do.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { pushTransactions } from '@/lib/transactions';

export async function POST(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body?.transactions) ? body.transactions : [];
    if (!items.length) throw new HttpError('No transactions provided');
    const applied = await pushTransactions(userId, items);
    return jsonRes({ applied, serverTime: Date.now() });
  } catch (e) { return errRes(e); }
}
