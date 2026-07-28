// RupeeFlow service worker — offline-first for the Next.js app shell.
// Runtime caching: pages network-first (cache fallback), static assets
// stale-while-revalidate, CDN libs cache-first. API calls skip the SW —
// the app itself queues mutations in IndexedDB while offline.
const CACHE = 'rupeeflow-next-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']))
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
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/'))
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
