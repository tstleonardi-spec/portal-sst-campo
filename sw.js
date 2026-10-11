const CACHE='jcramos-field-production-v2';
const SHELL=['./?v=ee0f56','./index.html?v=ee0f56','./app.mjs?v=ee0f56','./field.css?v=ee0f56','./local-queue.mjs?v=ee0f56','./field-event-schema.mjs?v=ee0f56','./production-contract.mjs?v=ee0f56','./photo-selection.mjs?v=ee0f56','./google-auth-client.mjs?v=ee0f56','./public-config.mjs?v=ee0f56','./manifest.webmanifest?v=ee0f56'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.some(path=>new URL(path,self.location).href===url.href))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
