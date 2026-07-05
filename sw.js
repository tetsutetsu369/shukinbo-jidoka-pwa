// 出勤簿自動化 Service Worker
// PWAのインストール可能条件を満たすための最小構成。オフラインキャッシュは行わず、
// 常にネットワークから取得する（このアプリは常にGAS APIとの通信が必要なため）。

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
