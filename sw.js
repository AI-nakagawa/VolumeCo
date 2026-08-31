"use strict";

const CACHE_NAME = "volumeco-v0.1.0";

const BASE_URL = new URL("./", self.location.href);
const INDEX_URL = new URL("index.html", BASE_URL).href;

const APP_SHELL = [
  BASE_URL.href,
  INDEX_URL,
  new URL("manifest.webmanifest", BASE_URL).href,
  new URL("icon.svg", BASE_URL).href
];

/*
 * 初回インストール時に、オフライン起動に必要な
 * ファイルを端末へ保存します。
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/*
 * 新しいバージョンが有効になったとき、
 * 古いキャッシュを削除します。
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/*
 * ページの移動では、通信できる場合は最新版を取得します。
 * 圏外の場合は、端末に保存したindex.htmlを表示します。
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const responseCopy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(INDEX_URL, responseCopy);
            });
          }

          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(INDEX_URL)) ||
            (await caches.match(BASE_URL.href))
          );
        })
    );

    return;
  }

  /*
   * 画像やマニフェストなどは端末内のファイルを優先し、
   * 保存されていない場合だけネットワークから取得します。
   */
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {
          const responseCopy = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });
        }

        return networkResponse;
      } catch (error) {
        return caches.match(INDEX_URL);
      }
    })
  );
});
