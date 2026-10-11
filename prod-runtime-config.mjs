// Public identifiers only. Client Secret remains server-side in Apps Script PROD.
const productionCatalog = Object.freeze({
  client: 'Cebrace',
  unit: 'Cebrace Jacareí',
  locations: Object.freeze(['EQR3', 'LVT', 'Almoxarifado', 'Gulote', 'Outro']),
  stages: Object.freeze(['Chegada', 'Transporte', 'Preparação', 'Isolamento', 'Inspeção', 'Execução', 'Ajustes', 'Finalização', 'Limpeza', 'Liberação', 'Outro'])
});
export default Object.freeze({
  environment: 'PRODUCTION',
  clientId: '329291363553-8i24poieej60dtsj5sp0sdpkccedv18q.apps.googleusercontent.com',
  gatewayUrl: 'https://script.google.com/macros/s/AKfycbx6aSS8eRouuJNwuQbux3yNe5iNNJ114efgyCWGLepV74OnrqMnUHTSnWtr7CaOv4E/exec',
  origin: 'https://tstleonardi-spec.github.io',
  popupRedirectUri: 'https://tstleonardi-spec.github.io',
  publicUrl: 'https://tstleonardi-spec.github.io/portal-sst-campo/',
  basePath: '/portal-sst-campo/',
  activities: [],
  catalog: productionCatalog
});
