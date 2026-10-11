import {validateFieldEvent} from './field-event-schema.mjs';
export const FIELD_PRODUCTION_CATALOG=Object.freeze({client:'Cebrace',unit:'Cebrace Jacareí',locations:Object.freeze(['EQR3','LVT','Almoxarifado','Gulote','Outro']),stages:Object.freeze(['Chegada','Transporte','Preparação','Isolamento','Inspeção','Execução','Ajustes','Finalização','Limpeza','Liberação','Outro'])});
export function validateProductionContext(event,{received=false}={}) {
  const c=event.context;
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  if(!c||c.environment!=='PRODUCTION'||c.client!==FIELD_PRODUCTION_CATALOG.client||c.unit!==FIELD_PRODUCTION_CATALOG.unit||!FIELD_PRODUCTION_CATALOG.locations.includes(c.location)||!FIELD_PRODUCTION_CATALOG.stages.includes(c.stage))fail('PRODUCTION_CONTEXT_INVALID');
  if(c.location==='Outro'&&!c.location_free_text?.trim())fail('LOCATION_REQUIRED');
  if(c.stage==='Outro'&&!c.stage_free_text?.trim())fail('STAGE_REQUIRED');
  if(!event.activity_id&&!c.activity_free_text?.trim())fail('ACTIVITY_DESCRIPTION_REQUIRED');
  if(event.activity_id&&c.activity_free_text)fail('ACTIVITY_CONTEXT_CONFLICT');
  if(!['PHOTO','REPORT','PHOTO_REPORT'].includes(c.record_type))fail('RECORD_TYPE_INVALID');
  if(c.record_type==='REPORT'&&(event.event_type!=='OBSERVATION'||event.attachments.length))fail('RECORD_TYPE_INVALID');
  if(c.record_type==='PHOTO'&&event.event_type!=='PHOTO')fail('RECORD_TYPE_INVALID');
  if(c.record_type==='PHOTO_REPORT'&&(event.event_type!=='PHOTO_WITH_NOTE'||!event.text?.trim()))fail('REPORT_REQUIRED');
  validateFieldEvent(event,{received});return event;
}
export async function sendProductionRecord(store,id,client,{online=true}={}) {
  const r=await store.get(id),user=client.getUser();
  if(!r||!user||r.owner!==user.sub)throw new Error('AUTH_REQUIRED');
  if(r.receipt)return r;
  if(r.status==='SENDING')throw new Error('CHECK_RECEIPT_FIRST');
  if(r.status==='PENDING_CONFIRMATION')throw new Error('CHECK_RECEIPT_FIRST');
  if(!online)throw new Error('OFFLINE');
  r.status='SENDING';await store.put(r);
  let receipt;
  try {
    const files=[];
    for(const f of r.files){const bytes=new Uint8Array(await f.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));files.push({attachment_id:f.attachment_id,base64:btoa(binary)});}
    receipt=await client.authorizedRequest('FIELD_RECEIVE',{mobile_event_id:id,event:r.event,files});
    if(receipt?.mobile_event_id!==id||receipt.received!==true||receipt.status!=='RECEIVED'||!Number.isFinite(Date.parse(receipt.received_at_gateway)))throw new Error('RECEIPT_INVALID');
  } catch(error) {r.status='PENDING_CONFIRMATION';await store.put(r);throw error;}
  // Keep the receipt even if browser persistence fails after the Drive commit.
  r.receipt=receipt;r.status='SENT';await store.put(r);return r;
}
export async function checkProductionReceipt(store,id,client){
  const r=await store.get(id),user=client.getUser();if(!r||!user||r.owner!==user.sub)throw new Error('AUTH_REQUIRED');
  const receipt=await client.authorizedRequest('FIELD_RECEIPT',{mobile_event_id:id});
  if(receipt?.mobile_event_id!==id)throw new Error('RECEIPT_INVALID');
  if(receipt.received===true){if(receipt.status!=='RECEIVED'||!Number.isFinite(Date.parse(receipt.received_at_gateway)))throw new Error('RECEIPT_INVALID');r.receipt=receipt;r.status='SENT';await store.put(r);}
  // A missing receipt is not proof an earlier timed-out request has stopped.
  return r;
}

