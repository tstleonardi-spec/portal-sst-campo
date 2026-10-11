const CACHE='jcramos-field-production-v4';
const SHELL=['./?v=prod9ac','./index.html?v=prod9ac','./prod-app.mjs?v=prod9ac','./field.css?v=prod9ac','./local-queue.mjs?v=prod9ac','./field-event-schema.mjs?v=prod9ac','./production-contract.mjs?v=prod9ac','./photo-selection.mjs?v=prod9ac','./google-auth-client.mjs?v=prod9ac','./prod-runtime-config.mjs?v=prod9ac','./manifest.webmanifest?v=prod9ac'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.some(path=>new URL(path,self.location).href===url.href))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
