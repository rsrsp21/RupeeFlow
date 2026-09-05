import { requireUser, errRes, HttpError } from '@/lib/auth';
import { buildCSV } from '@/lib/transactions';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const account = new URL(request.url).searchParams.get('account') || '';
    const csv = await buildCSV(userId, account);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="rupeeflow-export-${account ? `${account.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-` : ''}${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) { return errRes(e); }
}
