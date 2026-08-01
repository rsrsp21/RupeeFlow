// RupeeFlow service worker — offline-first for the Next.js app shell.
// Runtime caching: pages network-first (cache fallback), static assets
// stale-while-revalidate, CDN libs cache-first. API calls skip the SW —
// the app itself queues mutations in IndexedDB while offline.
const CACHE = 'rupeeflow-next-v5';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
            // Every screen is its own route now, so each needs its own shell —
      // falling all of them back to '/' offline would serve the dashboard's
      // markup under, say, /ledger and hydrate against the wrong page.
      .then((c) => c.addAll([
        '/', '/ledger', '/money', '/budgets', '/insights', '/settings',
        '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png',
      ]))
      .catch(() => {})   // a missing optional asset must not block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Share Target (POST multipart, see manifest.webmanifest): another app
  // shared text and/or a receipt photo into us. Stash it in IndexedDB and
  // redirect to the app, which picks it up on boot.
  if (e.request.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const text = ['share_title', 'share_text', 'share_url']
          .map((k) => form.get(k)).filter(Boolean).join(' ').trim();
        const image = form.getAll('share_files').find((f) => f && f.size && f.type.startsWith('image/'));
        const db = await idbOpen();
        await idbPut(db, 'meta', { k: 'shared', v: { text, image: image || null, at: Date.now() } });
      } catch {}
      return Response.redirect(new URL('/?share=1', self.location.origin).href, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // CDN (jsPDF etc.): cache-first after first load
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }))
    );
    return;
  }

  // Page navigations: network-first, fall back to cached shell when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        // Cache under the requested path, not always '/', so each route keeps
        // its own shell.
        caches.open(CACHE).then((c) => c.put(new URL(e.request.url).pathname, copy));
        return res;
      }).catch(() => caches.match(new URL(e.request.url).pathname).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Static assets (_next/static is content-hashed → safe to cache hard)
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// ── Background Sync: push the offline outbox even if the app got closed
// before reconnecting. Mirrors just enough of lib/client/idb.js's schema
// (plain vanilla IndexedDB — this file isn't bundled, so no ES imports) to
// read the auth token and queued transactions, and to clear them on success.
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rupeeflow', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGetAll(db, store) {
  return new Promise((resolve) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
  });
}
function idbClearStore(db, store) {
  return new Promise((resolve) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = resolve;
  });
}
function idbPut(db, store, val) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(val);
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  });
}

async function pushOutbox() {
  const db = await idbOpen();
  const [metas, outbox] = await Promise.all([idbGetAll(db, 'meta'), idbGetAll(db, 'outbox')]);
  const token = metas.find((m) => m.k === 'token')?.v;
  if (!token || !outbox.length) return;

  const res = await fetch('/api/tx/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ transactions: outbox }),
  });
  if (res.ok) await idbClearStore(db, 'outbox');
  else throw new Error(`sync failed: ${res.status}`); // rejecting re-queues the sync for a later retry
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-outbox') e.waitUntil(pushOutbox());
});

// ── Push notifications (payloads come from /api/cron/notify) ──
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'RupeeFlow', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'rupeeflow',       // same tag replaces, never stacks duplicates
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) { try { await c.navigate(target); } catch {} return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
