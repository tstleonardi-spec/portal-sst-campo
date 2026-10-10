const homologCatalog = Object.freeze({
  version: 'homolog-2026-10-09.01',
  updated_at: '2026-10-09T12:00:00-03:00',
  valid_until: '2026-10-16T23:59:59-03:00',
  tolerance_until: '2026-10-23T23:59:59-03:00',
  source: 'CATALOGO_SST_HOMOLOG',
  clients: Object.freeze([
    {id: 'demo-cliente-norte', name: 'Cliente demonstrativo Norte'},
    {id: 'demo-cliente-sul', name: 'Cliente demonstrativo Sul'}
  ]),
  locations: Object.freeze([
    {id: 'demo-area-a', client_id: 'demo-cliente-norte', name: 'Área de teste A'},
    {id: 'demo-area-b', client_id: 'demo-cliente-norte', name: 'Área de teste B'},
    {id: 'demo-area-c', client_id: 'demo-cliente-sul', name: 'Área de teste C'}
  ]),
  activities: Object.freeze([
    {id: 1001, client_id: 'demo-cliente-norte', location_id: 'demo-area-a', title: 'OS fictícia 1001 · inspeção de caldeiraria'},
    {id: 1002, client_id: 'demo-cliente-norte', location_id: 'demo-area-b', title: 'OS fictícia 1002 · manutenção de proteção'},
    {id: 2001, client_id: 'demo-cliente-sul', location_id: 'demo-area-c', title: 'OS fictícia 2001 · reforma de área'}
  ])
});

export default Object.freeze({
  "clientId": "329291363553-8i24poieej60dtsj5sp0sdpkccedv18q.apps.googleusercontent.com",
  "gatewayUrl": "https://script.google.com/macros/s/AKfycbyRtQyDMYxR6D8zoPKhunFdoefkL7Ql4g-iA2ynJY4DgLROr2g6I8UMwYHycHMJApR3/exec",
  "activities": homologCatalog.activities,
  "catalog": homologCatalog,
  "origin": "https://tstleonardi-spec.github.io",
  "popupRedirectUri": "https://tstleonardi-spec.github.io",
  "publicUrl": "https://tstleonardi-spec.github.io/portal-sst-campo/",
  "basePath": "/portal-sst-campo/",
  "environment": "HOMOLOG"
});
