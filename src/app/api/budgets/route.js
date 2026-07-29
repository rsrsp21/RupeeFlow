import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { getBudgets, putBudgets, deleteBudget } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const month = new URL(request.url).searchParams.get('month');
    return jsonRes({ budgets: await getBudgets(userId, month) });
  } catch (e) { return errRes(e); }
}

export async function PUT(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const body = await request.json().catch(() => ({}));
    await putBudgets(userId, Array.isArray(body?.budgets) ? body.budgets : []);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}

export async function DELETE(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { month, category } = await request.json().catch(() => ({}));
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new HttpError('Valid month required');
    await deleteBudget(userId, month, category || '');
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}
