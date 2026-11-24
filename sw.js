const CACHE_NAME = "volumeco-v0.4.2";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

// 電波が弱いときに、新しい版の取得を待つ最大時間（ミリ秒）
const NETWORK_TIMEOUT = 3000;

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache =>
        // ブラウザの HTTP キャッシュを通さず、必ず最新を保存する
        cache.addAll(
          APP_FILES.map(url => new Request(url, { cache: "reload" }))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            // 同じ github.io の他のアプリ（Heron・Traverse）のキャッシュは消さない
            .filter(cacheName => cacheName.startsWith("volumeco-") && cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ネットから取得し、正常なときだけ保存する
function fetchAndStore(request, cacheKey) {
  return fetch(request).then(response => {
    if (response && response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
    }
    return response;
  });
}

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  // 画面を開くとき：保存した画面をすぐ返す（キャッシュ優先）。
  // 裏でネットから新しい版を取りに行き、次回の起動に使う。
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .match("./index.html", { ignoreSearch: true })
        .then(cached => {
          const update = fetchAndStore(event.request, "./index.html");

          if (cached) {
            event.waitUntil(update.catch(() => {}));
            return cached;
          }

          // 保存した画面が無いとき（初回など）だけネットを待つ
          return Promise.race([update, timeout(NETWORK_TIMEOUT * 3)]);
        })
        .catch(() =>
          caches.match("./", { ignoreSearch: true }).then(
            cached =>
              cached ||
              new Response(
                "<meta charset='utf-8'><p>オフライン用のデータがありません。電波のある所で一度開いてください。</p>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } }
              )
          )
        )
    );
    return;
  }

  // その他のファイル：キャッシュ優先、無ければネット
  event.respondWith(
    caches
      .match(event.request, { ignoreSearch: true })
      .then(cached => cached || fetchAndStore(event.request, event.request))
  );
});
