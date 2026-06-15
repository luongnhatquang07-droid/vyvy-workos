// VyVy WorkOS — Service Worker (Web Push)
const APP_URL = self.location.origin

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() } catch { return }

  const { title = 'VyVy WorkOS', body = '', url = APP_URL, tag } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'workos-default',
      renotify: true,
      data: { url },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || APP_URL

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Nếu app đang mở — focus vào tab đó
      for (const client of clients) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Nếu app chưa mở — mở tab mới
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
