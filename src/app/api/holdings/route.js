import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { getHoldings, putHoldings } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    return jsonRes({ holdings: await getHoldings(userId) });
  } catch (e) { return errRes(e); }
}

export async function PUT(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    await putHoldings(userId, Array.isArray(body?.holdings) ? body.holdings : []);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}
