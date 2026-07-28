// Thin IndexedDB wrapper: local ledger cache + offline outbox + meta.
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('rupeeflow', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('tx', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function idbPut(store, val) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(val);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}

export async function idbAll(store) {
  const db = await open();
  return new Promise((res) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
  });
}

export async function idbDelete(store, key) {
  const db = await open();
  return new Promise((res) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    t.oncomplete = res;
  });
}

export async function idbClear(store) {
  const db = await open();
  return new Promise((res) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = res;
  });
}
