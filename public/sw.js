self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})

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
