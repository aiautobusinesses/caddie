// ── Cache names ───────────────────────────────────────────────────────────────
const SHELL_CACHE = "caddie-shell-v1"
const FONT_CACHE = "caddie-fonts-v1"

// App shell resources to pre-cache on install
const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
]

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  )
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Remove stale caches from previous versions
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin + fonts.googleapis / fonts.gstatic
  const isGoogleFont =
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"

  if (url.origin !== self.location.origin && !isGoogleFont) return

  // ── Navigation requests (HTML pages) — network-first ──────────────────────
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache a fresh copy of the shell page
          if (res.ok && url.pathname === "/") {
            const clone = res.clone()
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(async () => {
          // Offline fallback: serve cached shell or a minimal offline page
          const cached = await caches.match("/")
          return (
            cached ??
            new Response(offlinePage(), {
              status: 200,
              headers: { "Content-Type": "text/html" },
            })
          )
        }),
    )
    return
  }

  // ── API requests — network-only (no stale data) ───────────────────────────
  if (url.pathname.startsWith("/api/")) return

  // ── Static assets (_next/static) — cache-first ────────────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone()
              caches.open(SHELL_CACHE).then((c) => c.put(request, clone))
            }
            return res
          }),
      ),
    )
    return
  }

  // ── Google Fonts — stale-while-revalidate ─────────────────────────────────
  if (isGoogleFont) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
        return cached ?? fetchPromise
      }),
    )
    return
  }

  // ── Public assets (icons, manifest) — stale-while-revalidate ─────────────
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
        return cached ?? fetchPromise
      }),
    )
    return
  }
})

// ── Offline fallback page ─────────────────────────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Caddie — Offline</title>
  <style>
    body {
      background: #16181c;
      color: #e8eaf0;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    img { width: 64px; height: 64px; border-radius: 14px; margin-bottom: 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    p  { font-size: 14px; color: #5a6070; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <img src="/icons/icon-192.png" alt="Caddie"/>
  <h1>You&rsquo;re offline</h1>
  <p>Check your connection and try again.</p>
</body>
</html>`
}

// ── Push & notification handlers (preserved from original) ────────────────────

function toDateOnly(date) {
  return date.toISOString().split("T")[0]
}

function postTaskEvent(taskId, body) {
  return fetch(`/api/tasks/${taskId}/event`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Caddie", {
      body: data.body ?? "",
      data: { taskId: data.taskId },
      actions: [
        { action: "done", title: "Done" },
        { action: "later", title: "Later" },
        { action: "tomorrow", title: "Tomorrow" },
      ],
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const taskId = event.notification.data?.taskId
  const action = event.action

  if (!taskId) {
    return
  }

  if (action === "done") {
    event.waitUntil(postTaskEvent(taskId, { event_type: "done" }))
    return
  }

  if (action === "later") {
    const until = new Date()
    until.setHours(until.getHours() + 4)
    event.waitUntil(
      postTaskEvent(taskId, {
        event_type: "snoozed",
        metadata: { until: toDateOnly(until), option: "later" },
      }),
    )
    return
  }

  if (action === "tomorrow") {
    const until = new Date()
    until.setDate(until.getDate() + 1)
    until.setHours(8, 0, 0, 0)
    event.waitUntil(
      postTaskEvent(taskId, {
        event_type: "snoozed",
        metadata: { until: toDateOnly(until), option: "tomorrow" },
      }),
    )
    return
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(`/?task=${taskId}`)
    }),
  )
})
