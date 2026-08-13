// Basit service worker: uygulama kabuğunu önbelleğe alır, çevrimdışı açılışı sağlar.
// Vite hash'li dosya adları ürettiği için kabuk dışındaki varlıklar çalışma anında
// stale-while-revalidate ile önbelleğe alınır.

// Kabuk dosyalarının içeriği aynı adla değişirse sürümü artır: activate eski
// önbelleği siliyor. Artırılmazsa kurulu uygulama eski ikonu göstermeye devam
// ediyor (fetch stale-while-revalidate, yani ancak bir sonraki açılışta düzelir).
const CACHE = 'birlikte-puzzle-v4'
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './samples/gunbatimi.svg',
  './samples/kalpler.svg',
  './samples/gece.svg',
  './samples/mozaik.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // tek bir dosya 404 verirse tüm kurulum düşmesin
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  // Yalnızca kendi kaynağımızdaki GET istekleri; PeerJS sinyalleşmesi (cross-origin,
  // WebSocket) ve diğer istekler dokunulmadan geçer.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Sayfa gezinmeleri: ağ önce, çevrimdışıysa önbellekteki kabuk
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    )
    return
  }

  // Varlıklar: önbellekten ver, arka planda tazele
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached ?? network
    }),
  )
})
