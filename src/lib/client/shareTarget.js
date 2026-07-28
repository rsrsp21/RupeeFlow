// Reads the payload the service worker stashed when another app shared into
// us (see manifest.webmanifest's share_target + the POST handler in sw.js).
// Consumed exactly once: the IDB record and the ?share=1 marker are both
// cleared, so a refresh doesn't replay the share.
import { idbAll, idbDelete } from './idb';

export async function readSharedPayload() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('share') !== '1') return null;
  window.history.replaceState({}, '', window.location.pathname);

  const metas = await idbAll('meta');
  const shared = metas.find((m) => m.k === 'shared')?.v;
  await idbDelete('meta', 'shared');
  if (!shared) return null;

  const image = shared.image || null;
  const text = (shared.text || '').trim();
  if (!image && !text) return null;
  return { text, image };
}
