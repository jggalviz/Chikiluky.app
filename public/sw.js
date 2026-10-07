/*
 * CHIKILUKY.app — Service Worker
 * ------------------------------------------------------------------
 * Estrategias de caché:
 *   · App shell (navegación SSR)  → Network-first + fallback offline.
 *   · Estáticos (/_astro, /fonts,
 *     /icons, .css, .js, imagenes) → Stale-While-Revalidate.
 *   · API (/api/*) y cross-origin  → siempre red (nunca se cachean).
 *
 * NO se cachea HTML autenticado de forma proactiva: solo se guarda
 * el resultado de una navegación exitosa de esa misma URL, con
 * caducidad controlada por versión de caché (bump CACHE_VERSION).
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `chikiluky-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

/* Recursos mínimos para arrancar sin conexión. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll() aborta todo si un recurso falla → se añade 1 a 1.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

/** Recursos que conviene servir con Stale-While-Revalidate. */
function isCacheableAsset(url) {
  if (url.pathname.startsWith('/_astro/')) return true;
  if (url.pathname.startsWith('/fonts/')) return true;
  if (url.pathname.startsWith('/icons/')) return true;
  return /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|json|webmanifest)$/i.test(
    url.pathname
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET del mismo origen; todo lo demás (POST, Supabase, etc.) va directo a red.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API nunca se cachea (datos en vivo: tasa BCV, sesión, agenda...).
  if (url.pathname.startsWith('/api/')) return;

  // 1) Navegaciones (HTML SSR) → Network-first con fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch (_) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // 2) Estáticos → Stale-While-Revalidate.
  if (isCacheableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});
