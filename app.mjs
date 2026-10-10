import config from './public-config.mjs';
import {createFieldGoogleClient} from './google-auth-client.mjs';
import {openFieldStore,queueFieldEvent,sendQueuedFieldEvent,FIELD_STATUS_LABELS} from './local-queue.mjs';
import {validateFieldFilename,detectFieldImage,validateFieldEvent} from './field-event-schema.mjs';
import {selectFieldPhoto,PhotoPreview} from './photo-selection.mjs';
import {STATUS_TEXT,refreshFieldStatus,createStatusPolling} from './status-ui.mjs';
import {createLocalStatusDemo} from './status-demo.mjs';
import {createFieldStatusClient} from './status-client.mjs';

const $ = id => document.getElementById(id);
const format = value => new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
const preview = new PhotoPreview();
const queueUrls = [];
const captureControlIds = ['kind', 'text', 'stage', 'camera-button', 'gallery-button'];

let store;
let client;
let statusClient;
let demo;
let busy = false;
let photo = null;
let photoInfo = null;
let photoRevision = 0;
let draftTimer = null;
let composing = false;
let authReady = false;
let catalog = config.catalog;
let catalogInfo = evaluateCatalog(catalog);

function evaluateCatalog(value) {
  const now = Date.now();
  const validUntil = Date.parse(value?.valid_until || '');
  const toleranceUntil = Date.parse(value?.tolerance_until || '');
  if (Number.isFinite(validUntil) && now <= validUntil) return {key: 'VALID', label: 'Catálogo válido', className: 'valid', canSend: true};
  if (Number.isFinite(toleranceUntil) && now <= toleranceUntil) return {key: 'STALE', label: 'Catálogo desatualizado', className: 'attention', canSend: true};
  return {key: 'EXPIRED', label: 'Catálogo expirado', className: 'blocked', canSend: false};
}

function notice(id, text, error = false) {
  const element = $(id);
  element.textContent = text;
  element.classList.toggle('error', error);
}

function setBadge(id, text, className = '') {
  const element = $(id);
  element.textContent = text;
  element.className = 'status-badge ' + className;
}

function renderNetwork() {
  setBadge('network-badge', navigator.onLine ? 'Online' : 'Offline', navigator.onLine ? 'valid' : 'attention');
}

function option(value, text) {
  const element = document.createElement('option');
  element.value = String(value);
  element.textContent = text;
  return element;
}

function setSelectOptions(select, placeholder, entries, value = '') {
  select.replaceChildren(option('', placeholder));
  for (const entry of entries) select.append(option(entry.id, entry.name || entry.title));
  select.value = entries.some(entry => String(entry.id) === String(value)) ? String(value) : '';
}

function populateCatalog(selection = {}) {
  const selectedClient = selection.clientId ?? $('client').value;
  const selectedLocation = selection.locationId ?? $('location').value;
  const selectedActivity = selection.activityId ?? $('activity').value;
  setSelectOptions($('client'), 'Selecione o cliente demonstrativo', catalog?.clients || [], selectedClient);
  const clientId = $('client').value;
  const locations = (catalog?.locations || []).filter(item => item.client_id === clientId);
  $('location').disabled = !clientId;
  setSelectOptions($('location'), clientId ? 'Selecione o local demonstrativo' : 'Escolha primeiro o cliente', locations, selectedLocation);
  const locationId = $('location').value;
  const activities = (catalog?.activities || []).filter(item => item.client_id === clientId && item.location_id === locationId);
  $('activity').disabled = !locationId;
  setSelectOptions($('activity'), locationId ? 'Selecione a OS fictícia' : 'Escolha primeiro o local', activities, selectedActivity);
}

function renderCatalogStatus() {
  catalogInfo = evaluateCatalog(catalog);
  setBadge('catalog-badge', catalogInfo.label, catalogInfo.className);
  const updated = catalog?.updated_at ? format(catalog.updated_at) : 'data não informada';
  const validUntil = catalog?.valid_until ? format(catalog.valid_until) : 'data não informada';
  let message = 'Dados fictícios · ' + (catalog?.source || 'CATALOGO_SST_HOMOLOG') + ' · versão ' + (catalog?.version || 'local') + '. Atualizado em ' + updated + '. Validade: ' + validUntil + '.';
  if (catalogInfo.key === 'STALE') message += ' Atualize assim que possível; o salvamento continua liberado.';
  if (catalogInfo.key === 'EXPIRED') message += ' O salvamento continua liberado, mas o envio fica em Revisão necessária.';
  $('catalog-status').textContent = message;
}

function currentContext() {
  const clientEntry = (catalog?.clients || []).find(item => item.id === $('client').value);
  const locationEntry = (catalog?.locations || []).find(item => item.id === $('location').value);
  const activityEntry = (catalog?.activities || []).find(item => String(item.id) === $('activity').value);
  if (!clientEntry || !locationEntry || !activityEntry) return null;
  return {
    timezone: 'America/Sao_Paulo',
    client_id: clientEntry.id,
    client_name: clientEntry.name,
    location_id: locationEntry.id,
    location_name: locationEntry.name,
    activity_title: activityEntry.title,
    catalog_version: catalog.version,
    catalog_state: catalogInfo.key,
    catalog_updated_at: catalog.updated_at
  };
}

function contextComplete() {
  return Boolean(currentContext());
}

function renderContextState() {
  const complete = contextComplete();
  $('context-status').textContent = complete
    ? 'Contexto associado: ' + currentContext().client_name + ' · ' + currentContext().location_name + ' · ' + currentContext().activity_title
    : 'Selecione cliente, local e OS para começar.';
  $('client').setAttribute('aria-invalid', String(!$('client').value));
  $('location').setAttribute('aria-invalid', String(Boolean($('client').value) && !$('location').value));
  $('activity').setAttribute('aria-invalid', String(Boolean($('location').value) && !$('activity').value));
}

function renderTimeline(queueSize = 0) {
  const hasEvidence = Boolean($('text').value.trim() || photo);
  const states = [
    ['timeline-context', contextComplete()],
    ['timeline-evidence', hasEvidence],
    ['timeline-queue', queueSize > 0]
  ];
  for (const [id, done] of states) {
    $(id).classList.toggle('done', done);
    $(id).classList.toggle('current', !done && (id === 'timeline-context' || states.findIndex(item => item[0] === id) === states.findIndex(item => !item[1])));
  }
}

function syncFormState() {
  const enabled = Boolean(store && contextComplete() && !busy);
  for (const id of captureControlIds) $(id).disabled = !enabled;
  $('save').disabled = !enabled;
  $('save').setAttribute('aria-busy', String(busy));
  $('remove-photo').disabled = busy || !photo;
  setBadge('capture-badge', contextComplete() ? (busy ? 'Salvando…' : 'Pronto para registrar') : 'Aguardando contexto', contextComplete() ? 'valid' : '');
}

function showPreview() {
  const url = preview.replace(photo);
  $('photo-preview').hidden = !url;
  if (url) $('photo-preview').src = url;
  else $('photo-preview').removeAttribute('src');
}

function showUser() {
  const user = client?.getUser();
  $('user').textContent = user ? user.email : 'Não autenticado. Rascunhos podem ser guardados neste aparelho.';
  $('login').disabled = busy || !authReady || Boolean(user);
  $('logout').disabled = busy || !user || Boolean(demo);
  syncFormState();
}

function visibleRows() {
  const user = client?.getUser();
  return user ? store.list({owner: user.sub, includeAnonymous: true}) : store.list({anonymousOnly: true});
}

function draft() {
  return {
    id: 'draft',
    status: 'DRAFT',
    text: $('text').value,
    kind: $('kind').value,
    clientId: $('client').value,
    locationId: $('location').value,
    activityId: $('activity').value,
    stage: $('stage').value,
    photoInfo,
    files: photo ? [{attachment_id: 'draft-photo', blob: photo}] : []
  };
}

async function persistDraft() {
  draftTimer = null;
  if (busy || !store) return;
  try {
    await store.put(draft());
    notice('capture-status', 'Rascunho guardado neste aparelho.');
  } catch {
    notice('capture-status', 'Não foi possível guardar o rascunho. Não feche esta tela.', true);
  }
}

function changed() {
  clearTimeout(draftTimer);
  if (!composing) draftTimer = setTimeout(persistDraft, 350);
  renderContextState();
  syncFormState();
  renderTimeline();
}

async function renderQueue() {
  if (!store) return;
  const rows = (await visibleRows()).filter(row => row.id !== 'draft').sort((a, b) => (b.event?.created_at_mobile || '').localeCompare(a.event?.created_at_mobile || ''));
  for (const url of queueUrls) URL.revokeObjectURL(url);
  queueUrls.length = 0;
  $('queue').replaceChildren();
  const pendingCount = rows.filter(row => !['RECEIVED', 'SYNCED'].includes(row.status)).length;
  $('queue-count').textContent = pendingCount + (pendingCount === 1 ? ' pendência' : ' pendências');
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Nenhum registro na fila. Associe um contexto para guardar o primeiro.';
    $('queue').append(empty);
  }
  for (const row of rows) {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    const text = document.createElement('p');
    const meta = document.createElement('small');
    const context = row.event?.context;
    strong.textContent = FIELD_STATUS_LABELS[row.status] || STATUS_TEXT[row.status] || row.status;
    strong.className = 'queue-state ' + String(row.status || '').toLowerCase();
    text.textContent = row.event?.text || row.event?.event_type || 'Registro sem descrição';
    meta.textContent = (row.event?.event_type || 'REGISTRO') + ' · ' + format(row.event?.created_at_mobile || Date.now()) + ' · ' + (context?.activity_title || 'Associação pendente') + ' · ' + row.id;
    item.append(strong, text, meta);
    if (context?.client_name || context?.location_name) {
      const contextText = document.createElement('p');
      contextText.className = 'queue-context';
      contextText.textContent = (context.client_name || 'Cliente pendente') + ' · ' + (context.location_name || 'Local pendente');
      item.append(contextText);
    }
    if (row.files?.[0]?.blob) {
      const image = document.createElement('img');
      image.alt = 'Foto deste registro';
      image.width = 160;
      image.height = 100;
      image.src = URL.createObjectURL(row.files[0].blob);
      queueUrls.push(image.src);
      item.append(image);
    }
    if (!row.receipt && row.status !== 'NEEDS_REVIEW') {
      const button = document.createElement('button');
      button.textContent = 'Enviar / tentar novamente';
      button.disabled = busy || !client?.getUser() || !catalogInfo.canSend;
      button.addEventListener('click', () => send(row.id));
      item.append(document.createElement('p'), button);
    } else if (row.status === 'NEEDS_REVIEW') {
      const note = document.createElement('p');
      note.className = 'error';
      note.textContent = 'Preservado no aparelho. Corrija o contexto ou atualize o catálogo antes de enviar.';
      item.append(note);
    } else if (row.receipt) {
      const note = document.createElement('p');
      note.textContent = demo ? 'Simulação local — nenhum registro no Portal real.' : 'Recebido na Inbox. Ainda não registrado no Portal.';
      item.append(note);
    }
    $('queue').append(item);
  }
  renderTimeline(rows.length);
}

async function refreshStatuses() {
  if (!store || !statusClient || busy || !navigator.onLine || document.hidden) return;
  try {
    for (const row of await visibleRows()) {
      if (row.id !== 'draft') await refreshFieldStatus(store, row.id, statusClient, {online: navigator.onLine});
    }
    await renderQueue();
  } catch {
    notice('queue-status', 'Não foi possível atualizar. O último estado conhecido foi preservado.', true);
  }
}

async function send(id) {
  if (busy) return;
  busy = true;
  showUser();
  await renderQueue();
  notice('queue-status', 'Enviando. Se a resposta se perder, o mesmo registro poderá ser reenviado.');
  try {
    const row = await sendQueuedFieldEvent(store, id, client, {online: navigator.onLine});
    if (row.status === 'NEEDS_REVIEW') notice('queue-status', 'Catálogo expirado: o registro continua salvo e aguarda revisão.', true);
    else if (row.status === 'RECEIVED') notice('queue-status', 'Recebido na Inbox. Ainda não registrado no Portal.');
    else if (!navigator.onLine) notice('queue-status', 'Sem conexão: permanece neste aparelho.');
  } catch {
    notice('queue-status', 'Envio não confirmado. Entre novamente se necessário e tente reenviar o mesmo registro.', true);
  } finally {
    busy = false;
    showUser();
    if (client && !client.getUser()) await prepareLogin();
    await renderQueue();
  }
}

async function restoreDraft() {
  const saved = await store.get('draft');
  if (!saved) return;
  populateCatalog({clientId: saved.clientId || '', locationId: saved.locationId || '', activityId: saved.activityId || ''});
  $('text').value = saved.text || '';
  $('kind').value = saved.kind || 'NATURAL_LANGUAGE_COMMAND';
  $('stage').value = saved.stage || '';
  photo = saved.files?.[0]?.blob || null;
  photoInfo = saved.photoInfo || null;
  showPreview();
  if (photo) {
    $('photo-name').textContent = 'Foto recuperada do rascunho local.';
    $('remove-photo').disabled = false;
  }
  notice('capture-status', 'Rascunho local recuperado. Revise antes de enviar.');
}

async function hydrateCatalogForUser() {
  const owner = client?.getUser()?.sub || 'anonymous';
  const cached = await store.getCatalog(owner);
  catalog = cached || config.catalog;
  if (!cached) await store.putCatalog(owner, catalog);
  renderCatalogStatus();
  populateCatalog({clientId: $('client').value, locationId: $('location').value, activityId: $('activity').value});
  renderContextState();
  syncFormState();
}

async function prepareLogin() {
  authReady = false;
  showUser();
  try {
    await client.prepareSignIn();
    authReady = true;
    notice('auth-status', 'Pronto para entrar com Google.');
  } catch {
    notice('auth-status', 'Acesso indisponível. Recarregue quando houver conexão; seus rascunhos permanecem locais.', true);
  }
  showUser();
}

const polling = createStatusPolling({refresh: refreshStatuses, active: () => navigator.onLine && !document.hidden});

$('capture').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || composing || !store) return;
  if (!contextComplete()) {
    notice('capture-status', 'Associe cliente, local e OS antes de guardar uma evidência.', true);
    $('client').focus();
    return;
  }
  clearTimeout(draftTimer);
  busy = true;
  showUser();
  try {
    const id = crypto.randomUUID();
    const files = [];
    const currentText = $('text').value.trim();
    const fieldEvent = {
      schema_version: 1,
      mobile_event_id: id,
      origin: 'MOBILE',
      event_type: photo ? (currentText ? 'PHOTO_WITH_NOTE' : 'PHOTO') : $('kind').value,
      created_at_mobile: new Date().toISOString(),
      text: currentText,
      attachments: [],
      activity_id: Number($('activity').value),
      stage_hint: $('stage').value.trim() || undefined,
      context: currentContext()
    };
    if (photo) {
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const mime = detectFieldImage(bytes);
      validateFieldFilename(photo.name, mime);
      const attachmentId = crypto.randomUUID();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[mime];
      fieldEvent.attachments.push({
        attachment_id: attachmentId,
        mobile_event_id: id,
        original_filename: photo.name,
        filename: attachmentId + '.' + ext,
        mime_type: mime,
        file_size: bytes.length,
        sha256,
        ...(photoInfo ? {capture_source: photoInfo.capture_source, original_metadata: photoInfo.original_metadata} : {})
      });
      files.push({attachment_id: attachmentId, blob: photo});
    }
    validateFieldEvent(fieldEvent, {requireContext: true});
    await queueFieldEvent(store, fieldEvent, files, client?.getUser()?.sub || null);
    await store.remove('draft');
    $('text').value = '';
    $('stage').value = '';
    $('text').setAttribute('aria-invalid', 'false');
    photo = null;
    photoInfo = null;
    showPreview();
    $('photo').value = '';
    $('gallery').value = '';
    $('photo-name').textContent = 'Nenhuma foto selecionada.';
    $('remove-photo').disabled = true;
    notice('capture-status', catalogInfo.canSend ? 'Guardado na fila local. Use Enviar para encaminhar à Inbox.' : 'Guardado localmente como Revisão necessária; atualize o catálogo antes de enviar.');
  } catch {
    $('text').setAttribute('aria-invalid', 'true');
    notice('capture-status', 'Não foi possível guardar. Confira o contexto, o texto, a foto (até 10 MiB) e o espaço disponível; o conteúdo foi preservado.', true);
  } finally {
    busy = false;
    showUser();
    await renderQueue();
  }
});

for (const [input, button, source] of [['photo', 'camera-button', 'CAMERA'], ['gallery', 'gallery-button', 'GALLERY']]) {
  $(button).addEventListener('click', () => { if (!busy) $(input).click(); });
  $(input).addEventListener('change', async () => {
    const file = $(input).files[0];
    if (!file || busy) return;
    const revision = ++photoRevision;
    try {
      const selected = await selectFieldPhoto(file, source);
      if (revision !== photoRevision || busy) return;
      photo = selected.file;
      photoInfo = {capture_source: selected.capture_source, original_metadata: selected.original_metadata};
      showPreview();
      $('photo-name').textContent = file.name + ' · ' + (source === 'CAMERA' ? 'Câmera' : 'Galeria') + ' · ' + (file.size / 1024 / 1024).toFixed(1) + ' MiB';
      $('remove-photo').disabled = false;
      await persistDraft();
      changed();
    } catch (error) {
      notice('capture-status', error.message, true);
    } finally {
      $(input).value = '';
    }
  });
}

$('remove-photo').addEventListener('click', () => {
  if (busy) return;
  ++photoRevision;
  photo = null;
  photoInfo = null;
  showPreview();
  $('photo').value = '';
  $('gallery').value = '';
  $('photo-name').textContent = 'Nenhuma foto selecionada.';
  $('remove-photo').disabled = true;
  changed();
  $('gallery-button').focus();
});

for (const id of ['text', 'stage']) $(id).addEventListener('input', changed);
for (const id of ['client', 'location', 'activity']) $(id).addEventListener('change', () => {
  if (id === 'client') populateCatalog({clientId: $('client').value, locationId: '', activityId: ''});
  if (id === 'location') populateCatalog({clientId: $('client').value, locationId: $('location').value, activityId: ''});
  changed();
});
$('kind').addEventListener('change', changed);
$('text').addEventListener('compositionstart', () => { composing = true; clearTimeout(draftTimer); });
$('text').addEventListener('compositionend', () => { composing = false; changed(); });

$('login').addEventListener('click', () => {
  if (busy || !authReady) return;
  busy = true;
  authReady = false;
  showUser();
  client.signIn().then(async () => {
    await hydrateCatalogForUser();
    notice('auth-status', 'Acesso validado pelo gateway.');
  }).catch(() => notice('auth-status', 'Não foi possível entrar. Seu rascunho foi preservado.', true)).finally(async () => {
    busy = false;
    authReady = false;
    showUser();
    if (!client.getUser()) await prepareLogin();
    await renderQueue();
  });
});

$('logout').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  showUser();
  try {
    await client.signOut();
    catalog = config.catalog;
    renderCatalogStatus();
    populateCatalog({clientId: '', locationId: '', activityId: ''});
  } finally {
    busy = false;
    showUser();
    await prepareLogin();
    await renderQueue();
  }
});

window.addEventListener('online', () => { renderNetwork(); void refreshStatuses(); });
window.addEventListener('offline', renderNetwork);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshStatuses(); });
window.addEventListener('pagehide', () => {
  polling.stop();
  preview.clear();
  for (const url of queueUrls) URL.revokeObjectURL(url);
});
window.addEventListener('beforeunload', event => {
  if (draftTimer || busy) {
    event.preventDefault();
    event.returnValue = '';
  }
});

async function init() {
  renderNetwork();
  renderCatalogStatus();
  populateCatalog();
  renderContextState();
  syncFormState();
  try {
    store = await openFieldStore();
    await store.putCatalog('anonymous', config.catalog);
    await restoreDraft();
    for (const row of await store.list()) {
      if (row.status === 'SENDING') {
        const {files, ...metadata} = row;
        await store.put({...metadata, status: 'QUEUED_LOCAL'});
      }
    }
    await renderQueue();
    renderContextState();
    syncFormState();
  } catch {
    notice('capture-status', 'Armazenamento local indisponível. Não é seguro fechar a tela sem guardar.', true);
    $('save').disabled = true;
  }
  if (new URLSearchParams(location.search).get('status_mock') === '1' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
    demo = createLocalStatusDemo(location.hostname);
    client = demo.client;
    statusClient = demo.statusClient;
    await demo.restore(await store.list());
    document.title = 'SIMULAÇÃO LOCAL — Campo';
    notice('auth-status', 'SIMULAÇÃO LOCAL. Identidade fictícia; sem Google, Drive ou Portal real.');
    await hydrateCatalogForUser();
    showUser();
    polling.start();
    await renderQueue();
  } else if (config.clientId && config.gatewayUrl) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      client = createFieldGoogleClient({
        clientId: config.clientId,
        gatewayUrl: config.gatewayUrl,
        origin: location.origin,
        google: window.google,
        transport: (url, options) => fetch(url, {...options, signal: AbortSignal.timeout(45000)})
      });
      statusClient = createFieldStatusClient({client, gatewayUrl: config.gatewayUrl});
      polling.start();
      await prepareLogin();
    } catch {
      notice('auth-status', 'Login indisponível. A fila local permanece disponível.', true);
    }
  }
}

init();
