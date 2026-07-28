import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { pullTransactions } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const since = Number(new URL(request.url).searchParams.get('since') || 0);
    const transactions = await pullTransactions(userId, since);
    return jsonRes({ transactions, serverTime: Date.now() });
  } catch (e) { return errRes(e); }
}
