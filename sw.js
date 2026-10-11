const CACHE='jcramos-field-production-v1';
const SHELL=['./?v=3307e8','./index.html?v=3307e8','./app.mjs?v=3307e8','./field.css?v=3307e8','./local-queue.mjs?v=3307e8','./field-event-schema.mjs?v=3307e8','./production-contract.mjs?v=3307e8','./photo-selection.mjs?v=3307e8','./google-auth-client.mjs?v=3307e8','./public-config.mjs?v=3307e8','./manifest.webmanifest?v=3307e8'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.some(path=>new URL(path,self.location).href===url.href))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
