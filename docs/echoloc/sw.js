// ECHOLOC service worker (Luis 2026-11-21, feedback #8): the installed web app plays offline. build.py copies this file to
// docs/echoloc/sw.js and fills in CACHE = echoloc-<VERSION>-<hash of the page>, so each new build installs a new worker,
// which deletes the older caches.
// The game page: NETWORK FIRST (online you always get the current build; the browser's own HTTP cache rules apply), the cached copy
// only when the network fails or is very slow. Icons + manifest: cache first (they only change with a new worker anyway).
'use strict';
const CACHE = 'echoloc-1.4.3-34e317c58591';
const BASE = new URL('./', self.location).pathname;               // /echoloc/
const PAGE = BASE;                                                 // the one cache key for the game page
const CORE = [PAGE, 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const SLOW_MS = 6000;   // after this long without an answer, the cached game (if there is one) is used

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('echoloc-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const isGamePage = (u) => u.pathname === BASE || u.pathname === BASE + 'index.html';
async function gamePage(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(PAGE, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});                                             // (an offline failure is answered below, not an unhandled rejection)
  const cached = await cache.match(PAGE);
  if (!cached) return net;                                         // first visit: only the network can answer
  let timer;
  const slow = new Promise((r) => { timer = setTimeout(() => r(cached), SLOW_MS); });
  try {
    const res = await Promise.race([net, slow]);
    return res && (res.ok || res === cached) ? res : cached;      // a 404 / 500 from the server: the game we have
  } catch (err) {
    return cached;                                                 // offline
  } finally { clearTimeout(timer); }
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate' && isGamePage(u)) { e.respondWith(gamePage(req)); return; }
  if (req.mode === 'navigate') return;                             // other pages in /echoloc/ (privacy): the network, untouched
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((m) => m || fetch(req)));
});
