const CACHE_NAME='pitchseq-v1';

// All files to cache for offline use
const FILES_TO_CACHE=[
  './',
  './index.html',
  './print.html',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/pitches.js',
  './js/zones.js',
  './js/sim.js',
  './js/storage.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Install event — cache all files
self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>{
      console.log('Service worker: caching files');
      // Cache local files first, then try external
      return cache.addAll(FILES_TO_CACHE.filter(f=>f.startsWith('.')||f.startsWith('/')))
        .then(()=>{
          // Try to cache external files separately — fail gracefully if offline
          return Promise.allSettled(
            FILES_TO_CACHE.filter(f=>f.startsWith('http')).map(url=>
              cache.add(url).catch(()=>console.log('Could not cache:',url))
            )
          );
        });
    }).then(()=>self.skipWaiting())
  );
});

// Activate event — clean up old caches
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys.filter(key=>key!==CACHE_NAME)
          .map(key=>{
            console.log('Service worker: deleting old cache',key);
            return caches.delete(key);
          })
      )
    ).then(()=>self.clients.claim())
  );
});

// Fetch event — serve from cache first, fall back to network
self.addEventListener('fetch',event=>{
  // Skip non-GET requests
  if(event.request.method!=='GET') return;
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse=>{
      if(cachedResponse){
        // Serve from cache
        return cachedResponse;
      }
      // Not in cache — fetch from network and cache for next time
      return fetch(event.request).then(networkResponse=>{
        if(!networkResponse||networkResponse.status!==200||networkResponse.type==='opaque'){
          return networkResponse;
        }
        const responseToCache=networkResponse.clone();
        caches.open(CACHE_NAME).then(cache=>{
          cache.put(event.request,responseToCache);
        });
        return networkResponse;
      }).catch(()=>{
        // Network failed and not in cache — return offline fallback
        if(event.request.destination==='document'){
          return caches.match('./index.html');
        }
      });
    })
  );
});
