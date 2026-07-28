import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { parseVoice } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { audio, mimeType, projects } = await request.json().catch(() => ({}));
    if (!audio) throw new HttpError('Audio required');
    return jsonRes(await parseVoice(audio, mimeType, projects || []));
  } catch (e) { return errRes(e); }
}
