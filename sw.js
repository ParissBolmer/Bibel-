// Bei jedem Update der App-Dateien diese Nummer erhöhen (bibel-v5, bibel-v6 …)
const SHELL = 'bibel-v6';
const DATA = 'bibel-data-v2'; // nur ändern, wenn sich Bibeltexte ändern (V2/Sitzung 1: Menge bereinigt)

const SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'refs.js', 'plans.js', 'prayer.js', 'cards.js', 'compare.js', 'paths.js', 'intro.js', 'zeit.js', 'register.js', 'manifest.webmanifest',
  'catalog.json', 'plaene.json', 'themen.json', 'einf.json', 'zeit.json', 'register.json',
  'icon-192.png', 'icon-512.png',
  'literata-latin-400-normal.woff2', 'literata-latin-400-italic.woff2', 'literata-latin-600-normal.woff2',
  'figtree-latin-400-normal.woff2', 'figtree-latin-600-normal.woff2', 'figtree-latin-700-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isText = /\/(lut|elb|sch|men|ext|ext-de)\.json$/.test(url.pathname);
  if (isText) {
    // Bibeltexte: aus dem Cache, sonst laden und dauerhaft ablegen
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // App-Dateien: Cache zuerst, im Hintergrund aktualisieren
  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
