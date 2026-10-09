import {validateFieldEvent,FIELD_UUID} from './field-event-schema.mjs';
export const FIELD_STATUS_LABELS={DRAFT:'Rascunho neste aparelho',QUEUED_LOCAL:'Guardado neste aparelho',SENDING:'Enviando',RECEIVED:'Recebido na Inbox',WAITING_SYNC:'Aguardando sincronização',SYNCED:'Registrado no Portal',NEEDS_REVIEW:'Revisão necessária',FAILED:'Envio não confirmado — tentar novamente'};
export function openFieldStore(indexedDB=globalThis.indexedDB) {
  return new Promise((resolve,reject)=>{const r=indexedDB.open('jc-ramos-field-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});r.onsuccess=()=>{const db=r.result;resolve({
    get:id=>request('readonly',s=>s.get(id)),list:()=>request('readonly',s=>s.getAll()),
    put:value=>request('readwrite',s=>s.put(value)),remove:id=>request('readwrite',s=>s.delete(id))
  });function request(mode,run){return new Promise((done,fail)=>{const tx=db.transaction('records',mode),q=run(tx.objectStore('records'));tx.oncomplete=()=>done(q.result);tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error||new Error('LOCAL_STORAGE_FAILED'));});}};r.onerror=()=>reject(r.error);});
}
export async function queueFieldEvent(store,event,files=[],owner=null) {
  validateFieldEvent(event);
  const rows=(await store.list()).filter(r=>r.id!=='draft');
  if(rows.length>=20 || rows.reduce((n,r)=>n+(r.event?.attachments[0]?.file_size||0),0)+(event.attachments[0]?.file_size||0)>50*1024*1024) throw new Error('LOCAL_QUEUE_LIMIT');
  if(await store.get(event.mobile_event_id)) throw new Error('LOCAL_EVENT_ALREADY_EXISTS');
  const record={id:event.mobile_event_id,event,files,owner,status:'QUEUED_LOCAL'};
  await store.put(record);return record;
}
export async function sendQueuedFieldEvent(store,id,client,{online=true}={}) {
  if(!FIELD_UUID.test(id)) throw new Error('EVENT_ID_INVALID');
  const record=await store.get(id);
  if(!record) throw new Error('LOCAL_EVENT_NOT_FOUND');
  if(['RECEIVED','WAITING_SYNC','SYNCED'].includes(record.status)) return record;
  if(!online) return record; // Connectivity hint never earns a receipt.
  const user=client.getUser();
  if(!user || (record.owner && record.owner!==user.sub)) throw new Error('AUTH_REQUIRED');
  record.status='SENDING';await store.put(record);
  try {
    const files=[];
    for(const f of record.files) {const bytes=new Uint8Array(await f.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));files.push({attachment_id:f.attachment_id,base64:btoa(binary)});}
    const receipt=await client.authorizedRequest('FIELD_RECEIVE',{mobile_event_id:id,event:record.event,files});
    if(receipt?.mobile_event_id!==id || receipt.received!==true || receipt.status!=='RECEIVED' || !Number.isFinite(Date.parse(receipt.received_at_gateway))) throw new Error('RECEIPT_INVALID');
    record.receipt=receipt;record.status='RECEIVED';record.owner=user.sub;await store.put(record);return record;
  } catch(error) {record.status='FAILED';await store.put(record);throw error;}
}
