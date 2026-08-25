// Service Worker für die Jörmuntösk Vereins-Web-Tools.
// Cacht bewusst NUR die statische App-Shell (HTML/CSS-Grundgerüst der Seiten),
// damit die App installierbar ist. Firestore-Daten (Mitglieder, Markttagebuch,
// Anfragen, Aktivitätsprotokoll etc.) werden NIE gecacht, sondern laufen immer
// live über das Netz — sonst würden veraltete Vereinsdaten angezeigt.

const CACHE_NAME = "jormuntosk-shell-v1";

const APP_SHELL = [
  "uebersicht.html",
  "index.html",
  "markttagebuch.html",
  "mitglieder.html",
  "admin.html",
  "common.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nur eigene GET-Anfragen auf App-Shell-Dateien behandeln.
  // Alles andere (insbesondere Firestore/Firebase-Anfragen an andere Domains,
  // POST/PUT-Anfragen) unangetastet ans Netz durchreichen.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  const isAppShellFile = APP_SHELL.some((f) => url.pathname.endsWith(f));
  if (!isAppShellFile) return;

  // Network-first: aktuelle Version bevorzugen, Cache nur als Offline-Fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
