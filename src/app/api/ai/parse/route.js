import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { parseText } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { text, projects } = await request.json().catch(() => ({}));
    if (!text) throw new HttpError('Text required');
    return jsonRes(await parseText(text, projects || []));
  } catch (e) { return errRes(e); }
}
