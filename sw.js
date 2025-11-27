// =====================================================
// SWETA PWA Service Worker v3.0.0
// With Push Notification Support
// =====================================================

const CACHE_NAME = 'sweta-v3.1.0';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-72.png',
    './icon-96.png',
    './icon-128.png',
    './icon-144.png',
    './icon-152.png',
    './icon-192.png',
    './icon-384.png',
    './icon-512.png'
];

// =====================================================
// Install Event
// =====================================================

self.addEventListener('install', event => {
    console.log('🔧 SW: Installing v3.0.0...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// =====================================================
// Activate Event
// =====================================================

self.addEventListener('activate', event => {
    console.log('✅ SW: Activated');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// =====================================================
// Fetch Event - Cache First Strategy
// =====================================================

self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip external requests
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    // Return cached, but update in background
                    event.waitUntil(
                        fetch(event.request)
                            .then(response => {
                                if (response.ok) {
                                    caches.open(CACHE_NAME)
                                        .then(cache => cache.put(event.request, response));
                                }
                            })
                            .catch(() => {})
                    );
                    return cached;
                }
                
                return fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// =====================================================
// Push Event - Handle incoming push notifications
// =====================================================

self.addEventListener('push', event => {
    console.log('📬 SW: Push received');
    
    let data = {
        title: 'SWETA 💜',
        body: 'Time to check in!',
        type: 'hourly'
    };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: './icon-192.png',
        badge: './icon-72.png',
        tag: 'sweta-' + (data.type || 'notification') + '-' + Date.now(),
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
        actions: [
            { action: 'open', title: 'Open SWETA' },
            { action: 'dismiss', title: 'Later' }
        ],
        data: {
            url: './',
            type: data.type,
            timestamp: Date.now()
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
            .then(() => {
                // Notify the app if it's open
                return self.clients.matchAll({ type: 'window' });
            })
            .then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'PUSH_RECEIVED',
                        payload: data
                    });
                });
            })
    );
});

// =====================================================
// Notification Click Event
// =====================================================

self.addEventListener('notificationclick', event => {
    console.log('🖱️ SW: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'dismiss') {
        return;
    }
    
    // Open or focus the app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // Try to find an existing window
                for (const client of clients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if none exists
                if (self.clients.openWindow) {
                    return self.clients.openWindow('./');
                }
            })
    );
});

// =====================================================
// Notification Close Event
// =====================================================

self.addEventListener('notificationclose', event => {
    console.log('❌ SW: Notification closed');
});

// =====================================================
// Message Event - Communication with main app
// =====================================================

self.addEventListener('message', event => {
    console.log('📨 SW: Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// =====================================================
// Push Subscription Change Event
// =====================================================

self.addEventListener('pushsubscriptionchange', event => {
    console.log('🔄 SW: Push subscription changed');
    
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription.options.applicationServerKey
        })
        .then(subscription => {
            // TODO: Send new subscription to server
            console.log('New subscription:', subscription);
        })
    );
});
