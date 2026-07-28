import { requireUser, updateName, jsonRes, errRes, HttpError } from '@/lib/auth';

export async function PUT(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { name } = await request.json().catch(() => ({}));
    return jsonRes(await updateName(userId, name));
  } catch (e) { return errRes(e); }
}
