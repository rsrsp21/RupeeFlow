// Reads a GET share_target payload (see manifest.webmanifest's share_target)
// exactly once, then strips it from the URL so a refresh doesn't reopen it.
export function readSharedText() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('share') !== '1') return null;

  const text = (params.get('share_text') || params.get('share_title') || params.get('share_url') || '').trim();
  window.history.replaceState({}, '', window.location.pathname);
  return text || null;
}
