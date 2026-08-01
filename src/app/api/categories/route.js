import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { sanitizeSvg } from '@/lib/svgSanitize';
import { getCategories, putCategory, deleteCategory } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    return jsonRes({ categories: await getCategories(userId) });
  } catch (e) { return errRes(e); }
}

// Upsert without regenerating an icon — used when renaming a category, which
// should carry its existing icon across rather than burn another AI call.
export async function PUT(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { name, icon_svg, color } = await request.json().catch(() => ({}));
    if (!name || !name.trim()) throw new HttpError('Category name required');
    return jsonRes(await putCategory(userId, { name, icon_svg: sanitizeSvg(icon_svg) || '', color }));
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
