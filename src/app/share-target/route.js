// Fallback only. The service worker intercepts POSTs to /share-target and
// never lets them reach the network; this exists so a share still lands
// somewhere sane if the SW isn't controlling the page yet (first load,
// or a browser with SW disabled).
export async function POST() {
  return Response.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').href, 303);
}
