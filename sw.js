// ── VITALIS Service Worker ──
// Cachea el "app shell" (HTML/CSS/JS, que van todos dentro de index.html)
// para que los protocolos de primeros auxilios y la lectura por voz
// funcionen sin conexión a internet.

const CACHE_NAME = "vitalis-cache-v1";

// Archivos que forman el núcleo de la app y deben estar disponibles offline
const ARCHIVOS_NUCLEO = [
  "./",
  "./index.html",
  "./manifest.json"
];

// ── INSTALACIÓN: descarga y guarda el núcleo de la app ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ARCHIVOS_NUCLEO).catch((err) => {
        // Si algún archivo (ej. manifest.json) no existe todavía, no truena todo el cache
        console.warn("VITALIS SW: no se pudo precachear algún archivo:", err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVACIÓN: limpia versiones viejas de cache ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: decide de dónde responder cada solicitud ──
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nunca cachear peticiones que NO son GET (ej. guardar_perfil.php es POST)
  if (request.method !== "GET") {
    return;
  }

  // Nunca intentar cachear ni interceptar llamadas a servicios externos
  // (YouTube, Google Maps, reconocimiento de voz de Google, etc.)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Para llamadas a nuestros PHP (get_perfil.php, etc.): red primero,
  // porque los datos del perfil pueden cambiar; sin conexión, no forzamos cache
  // (ese dato ya vive también en localStorage/estado de la app si el usuario ya entró antes).
  if (url.pathname.endsWith(".php")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ status: "error", error: "Sin conexión a internet" }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Para el resto del app shell (HTML/CSS/JS/íconos): cache primero, red de respaldo
  event.respondWith(
    caches.match(request).then((respuestaCache) => {
      return (
        respuestaCache ||
        fetch(request)
          .then((respuestaRed) => {
            // Guardamos una copia fresca en cache para la próxima vez que no haya internet
            const copia = respuestaRed.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            return respuestaRed;
          })
          .catch(() => caches.match("./index.html"))
      );
    })
  );
});
