import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { getAccounts, putAccounts } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    return jsonRes({ accounts: await getAccounts(userId) });
  } catch (e) { return errRes(e); }
}

export async function PUT(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    await putAccounts(userId, Array.isArray(body?.accounts) ? body.accounts : []);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}
