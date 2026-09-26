const CACHE = 'daymate-9d6993d';
const PRECACHE = ['/', '/index.html', '/icon.svg'];
// 휴대폰 공유로 받은 사진을 앱이 가져갈 때까지 잠깐 맡겨 두는 곳 — 버전이 바뀌어도 지우지 않는다
const SHARE_CACHE = 'dm-share';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
    .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── 공유 받기 (Web Share Target) — 휴대폰 공유 → DayMate. 안드로이드에 설치한 앱에서만 동작.
// 사진은 임시 보관함에 넣고, 글·링크는 주소에 담아 앱을 연다(App.jsx가 오늘 메모로 저장).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.pathname !== '/share-target') return;
  e.respondWith((async () => {
    const form = await e.request.formData();
    const files = form.getAll('photos').filter(f => f && f.size).slice(0, 10);
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(files.map((f, i) => cache.put(`/share-file/${i}`, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }))));
    const q = new URLSearchParams({
      'share-target': '1',
      title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '',
      files: String(files.length),
    });
    return Response.redirect(`/?${q}`, 303);
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// ── FCM Web Push ──
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { title: 'DayMate', body: e.data?.text() || '' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'DayMate', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'daymate-push',
      data: data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.openWindow(url));
});
