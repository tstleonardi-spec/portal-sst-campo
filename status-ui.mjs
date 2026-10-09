import {FIELD_SYNC_STATUSES} from './field-status-contract.mjs';
export const STATUS_TEXT={DRAFT:'Rascunho neste aparelho',QUEUED_LOCAL:'Guardado neste aparelho',SENDING:'Enviando',RECEIVED:'Recebido — ainda não registrado no Portal',WAITING_SYNC:'Aguardando Portal…',PROCESSING:'Processando no Portal…',SYNCED:'Sincronizado ✓',NEEDS_REVIEW:'Este envio precisa de revisão no Portal.',PENDING_CONFIRMATION:'Aguardando confirmação no Portal.',BLOCKED:'A ação solicitada não pode ser executada automaticamente.',FAILED:'Não foi possível concluir. O registro foi preservado.'};
export async function refreshFieldStatus(store,id,client,{online=true,force=false}={}){
  const record=await store.get(id);if(!record?.receipt || !online || ['SYNCED','BLOCKED'].includes(record.status) || (!force&&record.status==='FAILED'))return record;
  const status=await client.poll(id,{online,force});
  if(!status||status.mobile_event_id!==id||!FIELD_SYNC_STATUSES.includes(status.status))throw new Error('STATUS_RESPONSE_INVALID');
  const current=await store.get(id);
  if(current.remoteStatus && Date.parse(status.updated_at)<Date.parse(current.remoteStatus.updated_at))return current;
  const next={...current,status:status.status,remoteStatus:status};await store.put(next);return next;
}
export function createStatusPolling({refresh,active=()=>true,setTimer=setTimeout,clearTimer=clearTimeout,interval=60000}){
  let timer=null,stopped=true,running=false;
  const tick=async()=>{if(stopped||running)return;running=true;try{if(active())await refresh();}finally{running=false;if(!stopped)timer=setTimer(tick,Math.max(interval,60000));}};
  return {start(){if(!stopped)return;stopped=false;timer=setTimer(tick,Math.max(interval,60000));},stop(){stopped=true;if(timer)clearTimer(timer);timer=null;},tick};
}
