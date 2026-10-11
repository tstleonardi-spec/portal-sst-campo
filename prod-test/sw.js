const CACHE='jcramos-field-prod-test-v1';
const SHELL=['./','./index.html','./production-app.mjs','./field.css','./local-queue.mjs','./field-event-schema.mjs','./production-contract.mjs','./photo-selection.mjs','./google-auth-client.mjs','./public-config.mjs','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.some(path=>new URL(path,self.location).href===url.href))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
