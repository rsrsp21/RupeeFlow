import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { getCategories, deleteCategory } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    return jsonRes({ categories: await getCategories(userId) });
  } catch (e) { return errRes(e); }
}

export async function DELETE(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { name } = await request.json().catch(() => ({}));
    if (!name) throw new HttpError('Category name required');
    await deleteCategory(userId, name);
    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
}
