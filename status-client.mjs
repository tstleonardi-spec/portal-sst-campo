import {MockMobileStatusClient as ContractStatusPoller,makeFieldStatus} from './field-status-contract.mjs';
/** Real authenticated transport; reuse the approved polling/state contract. */
export function createFieldStatusClient({client,gatewayUrl}) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(gatewayUrl||'') || !client?.authorizedRequest)throw new Error('Gateway de status não configurado.');
  return new ContractStatusPoller({gateway:{getStatus:async id=>{
    const response=await client.authorizedRequest('FIELD_STATUS',{mobile_event_id:id});
    // Do not display arbitrary gateway summaries or technical errors.
    const {owner_id,...safe}=makeFieldStatus({...response,owner_id:'gateway-response'});
    return safe;
  }},session:null});
}
