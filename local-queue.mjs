import {validateFieldEvent,FIELD_UUID} from './field-event-schema.mjs';

export const FIELD_STATUS_LABELS = {
  DRAFT: 'Rascunho neste aparelho',
  QUEUED_LOCAL: 'Pendente — neste aparelho',
  SENDING: 'Enviando',
  RECEIVED: 'Recebido na Inbox',
  WAITING_SYNC: 'Aguardando sincronização',
  SYNCED: 'Registrado no Portal',
  NEEDS_REVIEW: 'Revisão necessária',
  FAILED: 'Falha — tentar novamente'
};

const DB_NAME = 'jc-ramos-field-v1';
const DB_VERSION = 2;
const RECORDS = 'records';
const BINARIES = 'binaries';
const CATALOGS = 'catalogs';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LOCAL_STORAGE_FAILED'));
  });
}

function transactionResult(db, stores, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('LOCAL_STORAGE_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('LOCAL_STORAGE_FAILED'));
    result = run(tx);
  });
}

async function readAll(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).getAll());
}

async function hydrateRecords(db, records) {
  const binaries = await readAll(db, BINARIES);
  return records.map(record => ({
    ...record,
    files: binaries.filter(binary => binary.record_id === record.id).map(binary => ({
      attachment_id: binary.attachment_id,
      blob: binary.blob
    }))
  }));
}

async function replaceBinaries(db, recordId, files) {
  const existing = await readAll(db, BINARIES);
  await transactionResult(db, BINARIES, 'readwrite', tx => {
    const binaryStore = tx.objectStore(BINARIES);
    existing.filter(item => item.record_id === recordId).forEach(item => binaryStore.delete([recordId, item.attachment_id]));
    for (const file of files || []) {
      if (file?.attachment_id && file.blob) {
        binaryStore.put({record_id: recordId, attachment_id: file.attachment_id, blob: file.blob});
      }
    }
  });
}

async function persistRecord(db, value) {
  const hasFiles = Object.prototype.hasOwnProperty.call(value, 'files');
  const metadata = {...value};
  delete metadata.files;
  await transactionResult(db, RECORDS, 'readwrite', tx => tx.objectStore(RECORDS).put(metadata));
  if (hasFiles) await replaceBinaries(db, value.id, value.files);
  return value;
}

async function deleteRecord(db, id) {
  await transactionResult(db, [RECORDS, BINARIES], 'readwrite', tx => {
    tx.objectStore(RECORDS).delete(id);
    const binaryStore = tx.objectStore(BINARIES);
    binaryStore.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) return;
      if (cursor.value.record_id === id) cursor.delete();
      cursor.continue();
    };
  });
}

export function openFieldStore(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new Error('LOCAL_STORAGE_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, {keyPath: 'id'});
      if (!db.objectStoreNames.contains(BINARIES)) db.createObjectStore(BINARIES, {keyPath: ['record_id', 'attachment_id']});
      if (!db.objectStoreNames.contains(CATALOGS)) db.createObjectStore(CATALOGS, {keyPath: 'owner'});
      if (request.oldVersion < 2) {
        const recordStore = tx.objectStore(RECORDS);
        const binaryStore = tx.objectStore(BINARIES);
        recordStore.openCursor().onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return;
          const value = cursor.value;
          if (Array.isArray(value.files) && value.files.length) {
            for (const file of value.files) {
              if (file?.attachment_id && file.blob) binaryStore.put({record_id: value.id, attachment_id: file.attachment_id, blob: file.blob});
            }
            delete value.files;
            cursor.update(value);
          }
          cursor.continue();
        };
      }
    };
    request.onerror = () => reject(request.error || new Error('LOCAL_STORAGE_FAILED'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        get: async id => {
          const record = await readAll(db, RECORDS).then(rows => rows.find(row => row.id === id));
          return (await hydrateRecords(db, record ? [record] : []))[0] || null;
        },
        list: async (options = {}) => {
          const rows = await hydrateRecords(db, await readAll(db, RECORDS));
          if (options.owner) return rows.filter(row => row.owner === options.owner || (options.includeAnonymous && !row.owner));
          if (options.anonymousOnly) return rows.filter(row => !row.owner);
          return rows;
        },
        put: value => persistRecord(db, value),
        remove: id => deleteRecord(db, id),
        getCatalog: async owner => {
          const catalog = await readAll(db, CATALOGS).then(rows => rows.find(row => row.owner === owner));
          return catalog?.catalog || null;
        },
        putCatalog: (owner, catalog) => transactionResult(db, CATALOGS, 'readwrite', tx => tx.objectStore(CATALOGS).put({owner, catalog, saved_at: new Date().toISOString()}))
      });
    };
  });
}

export async function queueFieldEvent(store, event, files = [], owner = null) {
  validateFieldEvent(event);
  const rows = (await store.list()).filter(row => row.id !== 'draft');
  const pendingBytes = rows.reduce((total, row) => total + (row.files?.length ? (row.event?.attachments?.[0]?.file_size || 0) : 0), 0);
  if (rows.length >= 20 || pendingBytes + (files.length ? (event.attachments?.[0]?.file_size || 0) : 0) > 50 * 1024 * 1024) throw new Error('LOCAL_QUEUE_LIMIT');
  if (await store.get(event.mobile_event_id)) throw new Error('LOCAL_EVENT_ALREADY_EXISTS');
  const record = {
    id: event.mobile_event_id,
    event,
    owner,
    status: event.context?.catalog_state === 'EXPIRED' ? 'NEEDS_REVIEW' : 'QUEUED_LOCAL',
    files
  };
  await store.put(record);
  return record;
}

export async function sendQueuedFieldEvent(store, id, client, {online = true} = {}) {
  if (!FIELD_UUID.test(id)) throw new Error('EVENT_ID_INVALID');
  const record = await store.get(id);
  if (!record) throw new Error('LOCAL_EVENT_NOT_FOUND');
  if (['RECEIVED', 'WAITING_SYNC', 'SYNCED'].includes(record.status)) return record;
  if (record.event?.context?.catalog_state === 'EXPIRED') {
    const blocked = {...record, status: 'NEEDS_REVIEW'};
    await store.put(blocked);
    return blocked;
  }
  if (!online) return record;
  const user = client.getUser();
  if (!user || (record.owner && record.owner !== user.sub)) throw new Error('AUTH_REQUIRED');
  const {files: currentFiles, ...sendingMetadata} = record;
  await store.put({...sendingMetadata, status: 'SENDING'});
  try {
    const files = [];
    for (const file of currentFiles || []) {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      files.push({attachment_id: file.attachment_id, base64: btoa(binary)});
    }
    const receipt = await client.authorizedRequest('FIELD_RECEIVE', {mobile_event_id: id, event: record.event, files});
    if (receipt?.mobile_event_id !== id || receipt.received !== true || receipt.status !== 'RECEIVED' || !Number.isFinite(Date.parse(receipt.received_at_gateway))) throw new Error('RECEIPT_INVALID');
    const received = {...record, receipt, status: 'RECEIVED', owner: user.sub, files: []};
    await store.put(received);
    return received;
  } catch (error) {
    const failed = {...record, status: 'FAILED'};
    await store.put(failed);
    throw error;
  }
}

export default Object.freeze({FIELD_STATUS_LABELS});
