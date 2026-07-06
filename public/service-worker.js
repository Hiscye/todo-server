// Service Worker - v1.5.0 PWA
const CACHE_NAME = 'todo-app-v1.5.0';
const PRECACHE_URLS = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// 安装：预缓存关键资源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// 拦截请求：缓存优先，网络回退
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request)
                .then(response => {
                    // 只缓存成功的 GET 请求
                    if (response.ok && !event.request.url.includes('/ws')) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached)
            )
    );
});
