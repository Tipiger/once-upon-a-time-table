importScripts('./asset-versions.js');

const scope = self.registration.scope;
const cacheName = 'story-table-media:' + scope;
const assets = new Map();
for (const [path, digest] of Object.entries(assetVersions)) {
  const file = new URL(path, scope);
  const pathname = file.pathname;
  file.searchParams.set('sha256', digest);
  assets.set(pathname, {url: file.href, integrity: 'sha256-' + digest});
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // The cache belongs to this project even if another Pages site shares its origin.
    try {
      const cache = await caches.open(cacheName);
      const current = new Set(Array.from(assets.values(), asset => asset.url));
      const old = (await cache.keys()).filter(key => !current.has(key.url));
      await Promise.all(old.map(key => cache.delete(key)));
    } catch {
      // Storage is optional, including during activation.
    }
    await self.clients.claim();
  })());
});

async function loadAsset(asset, originalRequest) {
  let cache;
  try {
    cache = await caches.open(cacheName);
    const saved = await cache.match(asset.url);
    if (saved) return saved;
  } catch {
    // Storage may be disabled. The regular network path still works.
    return fetch(originalRequest);
  }
  let response;
  try {
    // An older tab can overlap a deployment. Only persist bytes matching this revision.
    response = await fetch(asset.url, {integrity: asset.integrity});
  } catch {
    return fetch(originalRequest);
  }
  if (response.status === 200 && !response.redirected) {
    try {
      await cache.put(asset.url, response.clone());
    } catch {
      // A full cache must not prevent displaying a successfully downloaded card.
    }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate' || request.headers.has('range')) return;
  const url = new URL(request.url);
  const asset = url.origin === self.location.origin && assets.get(url.pathname);
  if (asset) event.respondWith(loadAsset(asset, request));
});
