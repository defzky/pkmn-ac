/* ============ sw.js — PWA offline ============
 * - Instal: precache de la carcasa (index, css, manifiesto, versión) y del
 *   bundle del juego: el SW lee index.html y guarda el <script>/<link> que
 *   aparezca (da igual el hash del nombre).
 * - Código (html, js, css): primero la red, así cada actualización llega al
 *   momento; si no hay conexión, la última copia guardada.
 * - Sprites, iconos y fuente: se sirven de la caché (se van guardando según
 *   se usan: no se descarga todo de golpe).
 * - SDK de Firebase (gstatic): cache-first — así la nube arranca también sin
 *   conexión (y usa la copia guardada de la partida).
 */
const CODE = 'ps-code-v2', ART = 'ps-art-v2', FIRE = 'ps-fire-v2';

/** Extrae rutas de index.html (script del juego + hojas de estilo + iconos). */
async function shellUrls(page) {
  const urls = ['./', './index.html', './css/style.css', './manifest.webmanifest', './version.json', './favicon.ico'];
  try {
    const html = await (await fetch(page)).text();
    const re = /(?:src|href)=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      if (/^(https?:)?\/\//.test(u) || u.startsWith('#')) continue;   // externos y anclas
      const path = new URL(u, self.location.href).pathname;          // resuelve /x o ./x
      if (path.includes('/assets/') || path.endsWith('.css')) {
        urls.push('./' + path.replace(/^\//, ''));                    // relativo al scope
      }
    }
  } catch (e) { /* sin red en install: sólo la lista fija */ }
  return [...new Set(urls)];
}

self.addEventListener('install', e => {
  e.waitUntil(shellUrls('./index.html').then(us => caches.open(CODE).then(c => c.addAll(us))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CODE && k !== ART && k !== FIRE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase (SDK y endpoints): si está en caché, se usa; si no, la red.
  if (url.hostname.endsWith('gstatic.com') && /\/firebasejs\//.test(url.pathname)) {
    e.respondWith(caches.open(FIRE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  const art = /\/assets\/(pokemon|icons|fonts)\//.test(url.pathname);
  if (art) {
    e.respondWith(caches.open(ART).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CODE).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => {
    // Sin red: la copia guardada. La página de inicio sólo sirve de respaldo
    // al abrir la web (nunca en lugar de un script o una imagen).
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }));
});
