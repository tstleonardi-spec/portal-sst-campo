// Reference contract only: no network, Google credentials, Drive, or database access.
import {FIELD_UUID} from './field-event-schema.mjs';
export const FIELD_SYNC_STATUSES = Object.freeze(['RECEIVED','WAITING_SYNC','PROCESSING','SYNCED','NEEDS_REVIEW','PENDING_CONFIRMATION','BLOCKED','FAILED']);
const terminal = new Set(['SYNCED','BLOCKED']);
const transitions = {
  RECEIVED:['WAITING_SYNC','PROCESSING','NEEDS_REVIEW','PENDING_CONFIRMATION','BLOCKED','FAILED'],
  WAITING_SYNC:['PROCESSING','NEEDS_REVIEW','PENDING_CONFIRMATION','BLOCKED','FAILED'],
  PROCESSING:['SYNCED','NEEDS_REVIEW','PENDING_CONFIRMATION','BLOCKED','FAILED'],
  NEEDS_REVIEW:['PROCESSING','PENDING_CONFIRMATION','BLOCKED','FAILED'],
  PENDING_CONFIRMATION:['PROCESSING','SYNCED','NEEDS_REVIEW','BLOCKED','FAILED'],
  FAILED:['WAITING_SYNC','PROCESSING','NEEDS_REVIEW','PENDING_CONFIRMATION','BLOCKED'],
  SYNCED:[], BLOCKED:[],
};
const messages = {
  RECEIVED:'Recebido na Inbox.', WAITING_SYNC:'Aguardando o Portal.',
  PROCESSING:'Processamento em andamento.', SYNCED:'Registro processado no Portal.',
  NEEDS_REVIEW:'Revisão humana necessária.', PENDING_CONFIRMATION:'Aguardando confirmação humana.',
  BLOCKED:'Operação bloqueada.', FAILED:'Não foi possível concluir o processamento.',
};
const reasons = new Set(['ACTIVITY_AMBIGUOUS','ACTIVITY_CLOSED','CONTEXT_MISSING','CONFIRMATION_REQUIRED','CRITICAL_COMMAND_BLOCKED','PROCESSING_FAILED','TEMPORARILY_UNAVAILABLE']);
const actions = new Set(['ADD_REPORT','ADD_PHOTO','ADD_TOOL_USAGE','START_ACTIVITY','PAUSE_ACTIVITY','RESUME_ACTIVITY','FINISH_ACTIVITY']);
const fail = code => {throw Object.assign(new Error(code),{code});};
const time = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

// Allowlist construction: arbitrary summaries/errors and secret-bearing properties never pass.
export function makeFieldStatus(input) {
  if(input.schema_version!==undefined && input.schema_version!==1) fail('STATUS_VERSION_UNSUPPORTED');
  if(!FIELD_UUID.test(input.mobile_event_id||'')) fail('STATUS_EVENT_INVALID');
  if(!FIELD_SYNC_STATUSES.includes(input.status)) fail('STATUS_INVALID');
  if(typeof input.owner_id!=='string' || !input.owner_id || input.owner_id.length>200 || /[\s\x00-\x1f]/.test(input.owner_id)) fail('STATUS_OWNER_INVALID');
  if(!time(input.updated_at)) fail('STATUS_TIME_INVALID');
  if(input.processed_at!=null && (!time(input.processed_at) || Date.parse(input.processed_at)>Date.parse(input.updated_at))) fail('STATUS_PROCESSED_TIME_INVALID');
  if(input.status==='SYNCED' && !input.processed_at) fail('STATUS_PROCESSING_EVIDENCE_REQUIRED');
  const value={schema_version:1,mobile_event_id:input.mobile_event_id,owner_id:input.owner_id,status:input.status,updated_at:new Date(input.updated_at).toISOString(),result_summary:messages[input.status]};
  if(input.processed_at) value.processed_at=new Date(input.processed_at).toISOString();
  if(input.activity_id!=null) {if(!Number.isSafeInteger(input.activity_id)||input.activity_id<1) fail('STATUS_ACTIVITY_INVALID');value.activity_id=input.activity_id;}
  if(input.error_code) value.error_code=reasons.has(input.error_code)?input.error_code:'PROCESSING_FAILED';
  if(input.status==='PENDING_CONFIRMATION' && actions.has(input.pending_action)) value.pending_action=input.pending_action;
  return Object.freeze(value);
}

export function canAdvanceFieldStatus(previous,next) {
  return !terminal.has(previous) && (previous===next || transitions[previous]?.includes(next)===true);
}

/** Outbound transport must implement publishStatus(payload, machineAssertion).
 * machineAuth.issueAssertion() is a future M2M dependency, never a Google reader key.
 * Production wiring deliberately absent. Publisher contains no SST business logic. */
export class FieldStatusPublisher {
  constructor({transport,machineAuth}) {this.transport=transport;this.machineAuth=machineAuth;}
  async publish(result) {const payload=makeFieldStatus(result);const assertion=await this.machineAuth.issueAssertion();return this.transport.publishStatus(payload,assertion);}
}

/** Test-only store; registerOwnership represents the gateway's authenticated receipt.
 * Ownership MUST be established before outbound publication, not by its payload. */
export class MockFieldStatusStore {
  #owners=new Map(); #states=new Map();
  registerOwnership(id,owner) {if(!FIELD_UUID.test(id)||!owner) fail('STATUS_OWNER_INVALID');if(this.#owners.has(id)&&this.#owners.get(id)!==owner) fail('ACCESS_DENIED');this.#owners.set(id,owner);}
  read(id) {const value=this.#states.get(id);return value?structuredClone(value):null;}
  owner(id) {return this.#owners.get(id);}
  put(value) {
    const p=makeFieldStatus(value), owner=this.owner(p.mobile_event_id);
    if(!owner) fail('EVENT_NOT_FOUND');if(owner!==p.owner_id) fail('ACCESS_DENIED');
    const prev=this.read(p.mobile_event_id);
    if(prev) {
      if(JSON.stringify(prev)===JSON.stringify(p)) return {accepted:true,replay:true};
      if(Date.parse(p.updated_at)<Date.parse(prev.updated_at)) return {accepted:false,reason:'STALE_STATUS'};
      if(Date.parse(p.updated_at)===Date.parse(prev.updated_at)) fail('STATUS_VERSION_CONFLICT');
      if(terminal.has(prev.status) || (prev.status!==p.status && !transitions[prev.status].includes(p.status))) return {accepted:false,reason:'STATUS_TRANSITION_NOT_ALLOWED'};
    } else if(p.status!=='RECEIVED') fail('STATUS_RECEIPT_REQUIRED');
    this.#states.set(p.mobile_event_id,structuredClone(p));return {accepted:true,replay:false};
  }
}

/** Apps Script endpoint interface/mock; real deployment/authentication not implemented. */
export function createMockFieldStatusGateway({store,verifyMachine,authenticateMobile,allowlist}) {
  return {
    async publishStatus(payload,assertion) {if(!await verifyMachine(assertion)) fail('MACHINE_AUTH_REQUIRED');return store.put(payload);},
    async getStatus(id,session) {
      const actor=await authenticateMobile(session);
      if(!actor?.sub || !actor.email || !allowlist.includes(actor.email)) fail('ACCESS_DENIED');
      // Do not disclose whether another user's UUID exists.
      if(store.owner(id) && store.owner(id)!==actor.sub) fail('ACCESS_DENIED');
      if(!store.owner(id)) fail('EVENT_NOT_FOUND');
      const value=store.read(id);if(!value) fail('STATUS_NOT_AVAILABLE');
      const {owner_id,...publicStatus}=value;return publicStatus;
    },
  };
}

/** One-shot polling reference: caller schedules >=60s, pauses offline, backs off
 * after error, and does not poll SYNCED/BLOCKED/FAILED automatically. */
export class MockMobileStatusClient {
  #last=new Map();
  constructor({gateway,session}) {this.gateway=gateway;this.session=session;}
  last(id) {const v=this.#last.get(id);return v?structuredClone(v):null;}
  async poll(id,{online=true,force=false}={}) {
    const prev=this.last(id);
    if(!online || (!force && ['SYNCED','BLOCKED','FAILED'].includes(prev?.status))) return prev;
    const next=await this.gateway.getStatus(id,this.session);
    if(next.mobile_event_id!==id || !FIELD_SYNC_STATUSES.includes(next.status)) fail('STATUS_RESPONSE_INVALID');
    if(prev && (Date.parse(next.updated_at)<Date.parse(prev.updated_at) || terminal.has(prev.status))) return prev;
    this.#last.set(id,structuredClone(next));return this.last(id);
  }
}
