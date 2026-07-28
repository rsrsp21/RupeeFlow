import { register, jsonRes, errRes } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password, name } = await request.json().catch(() => ({}));
    return jsonRes(await register(email, password, name));
  } catch (e) { return errRes(e); }
}
