import { register, jsonRes, errRes } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json().catch(() => ({}));
    return jsonRes(await register(email, password));
  } catch (e) { return errRes(e); }
}
