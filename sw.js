// RevDent service worker: makes the app open and work with no internet.
// App files are cached on first load; patient data never goes through here (it lives in the browser).
const V = "revdent-shell-v2";
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    const res = await fetch(self.registration.scope, { cache: "reload" });
    const html = await res.clone().text();
    await c.put(self.registration.scope, res);
    const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => new URL(m[1], self.registration.scope)).filter((u) => u.origin === self.location.origin);
    await Promise.all(urls.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== V) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || u.pathname.includes("/api/")) return; // network only
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(self.registration.scope, cp)); return res; }).catch(() => caches.match(self.registration.scope)));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); } return res; })));
});
