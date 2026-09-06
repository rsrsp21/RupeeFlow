// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { classifyChatIntent, parseText, entryReply } from '@/lib/gemini';

// Conversational entry from the assistant chat.
//
// The chat has no ledger around it, so unlike the Ledger screen there is no
// open day and no selected account to fall back on — the entry sheet gets
// those from what the user is looking at, and here there is nothing to look
// at. parseText already returns null for a date or account the user did not
// mention, so that null is the signal for what still has to be asked.
//
// Nothing is written here. The route decides what is known and what is
// missing; the client saves through the store, which owns the outbox, the
// local cache and sync.
export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const {
      message, pending, history, customCategories, holdings, accounts, groups, today,
    } = await request.json().catch(() => ({}));
    if (!message) throw new HttpError('Message required');

    const accountNames = (accounts || []).filter(Boolean);

    // Mid-conversation (we already asked for a date or an account), the reply
    // is an answer to that question, not a fresh instruction — classifying it
    // again would read a bare "HDFC" as a question and lose the entry.
    if (!pending) {
      const { intent } = await classifyChatIntent(message).catch(() => ({ intent: 'ask' }));
      if (intent !== 'add') return jsonRes({ intent: 'ask' });
    }

    // A follow-up answers a question about an entry we already hold, so the
    // earlier details are given back to the parser as context — otherwise
    // "yesterday" alone parses to an entry with no amount and no note.
    const text = pending
      ? `Recording this entry: ${JSON.stringify(pending)}. The user now says: "${message}". `
        + 'Merge their answer into that entry and return the completed entry.'
      : message;

    const out = await parseText(
      text, history || [], customCategories || [], holdings || [],
      accountNames, groups || [], today || '',
    );

    const tx = (out?.transactions || [])[0];
    if (!tx || !(Number(tx.amount_rupees) > 0)) {
      // Understood as an entry but no usable amount — better to fall back to
      // answering than to save a zero.
      return jsonRes({ intent: 'ask' });
    }

    const merged = { ...(pending || {}), ...stripNulls(tx) };

    // An investment goes to a holding, so it needs a destination rather than
    // an account; everything else needs an account to come out of.
    const missing = [];
    if (!merged.date) missing.push('date');
    if (merged.type === 'invest') {
      if (!merged.destination) missing.push('destination');
    } else if (!merged.account && accountNames.length) {
      missing.push('account');
    }

    const reply = await entryReply(
      missing.length ? 'ask' : 'confirm', merged, missing, accountNames,
    );

    return jsonRes({
      intent: 'add',
      entry: merged,
      missing,
      ready: missing.length === 0,
      reply: String(reply || '').trim(),
    });
  } catch (e) { return errRes(e); }
}

// A follow-up parse re-states the whole entry, and any field the user did not
// repeat comes back null. Dropping those keeps the earlier value instead of
// erasing it — otherwise answering "HDFC" would blank the amount.
function stripNulls(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}
