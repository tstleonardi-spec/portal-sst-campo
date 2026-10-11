const CACHE='jcramos-field-production-challenge-auth1';
const SHELL=['./?v=challenge-auth1','./index.html?v=challenge-auth1','./prod-app.mjs?v=challenge-auth1','./field.css','./local-queue.mjs?v=challenge-auth1','./field-event-schema.mjs?v=challenge-auth1','./production-contract.mjs?v=challenge-auth1','./photo-selection.mjs?v=challenge-auth1','./google-auth-client.mjs?v=challenge-auth1','./prod-runtime-config.mjs?v=challenge-auth1','./manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.some(path=>new URL(path,self.location).href===url.href))return;e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(e.request))));});
