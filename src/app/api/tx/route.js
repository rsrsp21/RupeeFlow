import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { searchTransactions } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const sp = new URL(request.url).searchParams;
    const transactions = await searchTransactions(userId, Object.fromEntries(sp));
    return jsonRes({ transactions });
  } catch (e) { return errRes(e); }
}
