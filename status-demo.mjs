// Local-only fixtures. Never Google identity or a real Portal receipt.
import {FieldStatusPublisher,MockFieldStatusStore,createMockFieldStatusGateway,MockMobileStatusClient} from './field-status-contract.mjs';
export function createLocalStatusDemo(hostname) {
  if(!['localhost','127.0.0.1','::1'].includes(hostname))throw new Error('LOCAL_DEMO_ONLY');
  const store=new MockFieldStatusStore(),actor={sub:'local-fixture-user',email:'fixture@example.invalid'};
  const gateway=createMockFieldStatusGateway({store,verifyMachine:async x=>x==='fixture-machine',authenticateMobile:async x=>x==='fixture-session'?actor:null,allowlist:[actor.email]});
  const publisher=new FieldStatusPublisher({transport:gateway,machineAuth:{issueAssertion:async()=> 'fixture-machine'}});
  const statusClient=new MockMobileStatusClient({gateway,session:'fixture-session'});let tick=Date.now();
  const publish=(id,status)=>publisher.publish({mobile_event_id:id,owner_id:actor.sub,status,updated_at:new Date(++tick).toISOString(),...(status==='SYNCED'?{processed_at:new Date(tick).toISOString()}:{})});
  return {statusClient,publish,async restore(rows){for(const r of rows)if(r.receipt&&r.owner===actor.sub){store.registerOwnership(r.id,actor.sub);await publish(r.id,'RECEIVED');if(r.remoteStatus){if(r.remoteStatus.status==='SYNCED')await publish(r.id,'PROCESSING');await publish(r.id,r.remoteStatus.status);}}},client:{getUser:()=>actor,authorizedRequest:async(action,payload)=>{if(action!=='FIELD_RECEIVE')throw new Error('FIXTURE_ACTION_INVALID');store.registerOwnership(payload.mobile_event_id,actor.sub);await publish(payload.mobile_event_id,'RECEIVED');return {mobile_event_id:payload.mobile_event_id,received:true,status:'RECEIVED',received_at_gateway:new Date().toISOString()};}}};
}
