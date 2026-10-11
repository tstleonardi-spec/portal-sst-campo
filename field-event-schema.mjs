// Shared, dependency-free contract. The gateway owns identity and receipt time.
export const FIELD_EVENT_TYPES = Object.freeze(['ARRIVAL','START_ACTIVITY','PAUSE_ACTIVITY','RESUME_ACTIVITY','COMPLETE_ACTIVITY','NATURAL_LANGUAGE_COMMAND','PHOTO','PHOTO_WITH_NOTE','OBSERVATION','OCCURRENCE','TOOL_USAGE']);
export const FIELD_FILE_LIMIT = 10 * 1024 * 1024;
export const FIELD_REQUEST_LIMIT = 14 * 1024 * 1024;
export const FIELD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mimeExtensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const fail = code => { const e = new Error(code); e.code = code; throw e; };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const timestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export function validateFieldFilename(name, mime) {
  if (typeof name !== 'string' || !name || name.length > 180 || /[\/\\:\x00-\x1f]/.test(name) || name.includes('..') || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || !/\.(jpe?g|png|webp)$/i.test(name)) fail('FILE_NAME_INVALID');
  const ext = name.split('.').pop().toLowerCase();
  if (!mimeExtensions[mime] || !(mime === 'image/jpeg' ? ['jpg','jpeg'].includes(ext) : ext === mimeExtensions[mime])) fail('FILE_MIME_INVALID');
}
export function detectFieldImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 12 && [82,73,70,70].every((v,i) => bytes[i] === v) && [87,69,66,80].every((v,i) => bytes[i+8] === v)) return 'image/webp';
  return null;
}
export function validateFieldEvent(input, {received = false} = {}) {
  if (!object(input) || input.schema_version !== 1 || !FIELD_UUID.test(input.mobile_event_id ?? '') || input.origin !== 'MOBILE' || !FIELD_EVENT_TYPES.includes(input.event_type) || !timestamp(input.created_at_mobile)) fail('FIELD_EVENT_INVALID');
  const keys = ['schema_version','mobile_event_id','origin','event_type','created_at_mobile','activity_id','stage_hint','text','attachments','context',...(received ? ['received_at_gateway','authenticated_user','payload_sha256','clock_skew_ms'] : [])];
  if (Object.keys(input).some(k => !keys.includes(k))) fail('FIELD_EVENT_UNKNOWN_FIELD');
  if (input.activity_id != null && (!Number.isSafeInteger(input.activity_id) || input.activity_id < 1)) fail('ACTIVITY_ID_INVALID');
  if (input.stage_hint != null && (typeof input.stage_hint !== 'string' || input.stage_hint.length > 200)) fail('STAGE_HINT_INVALID');
  if (input.text != null && (typeof input.text !== 'string' || input.text.length > 5000)) fail('FIELD_TEXT_INVALID');
  if (/-----BEGIN[^-]*PRIVATE KEY-----|\b(access_token|refresh_token|private_key|client_secret|password|senha)\b/i.test(input.text ?? '')) fail('FIELD_SECRET_REJECTED');
  const contextKeys=['activity_title','timezone',...(input.context?.environment==='PRODUCTION'?['environment','client','unit','location','location_free_text','activity_free_text','record_type','stage','stage_free_text']:[])];
  if (input.context != null && (!object(input.context) || Object.keys(input.context).some(k => !contextKeys.includes(k)) || Object.values(input.context).some(v => typeof v !== 'string' || v.length > 200))) fail('FIELD_CONTEXT_INVALID');
  if(input.context && Object.values(input.context).some(v=>/-----BEGIN[^-]*PRIVATE KEY-----|\b(access_token|refresh_token|private_key|client_secret|password|senha)\b/i.test(v)))fail('FIELD_SECRET_REJECTED');
  if (!Array.isArray(input.attachments) || input.attachments.length > 1) fail('FIELD_ATTACHMENTS_INVALID');
  const photo = ['PHOTO','PHOTO_WITH_NOTE'].includes(input.event_type);
  if (photo !== (input.attachments.length === 1)) fail('FIELD_ATTACHMENT_REQUIRED');
  if (!photo && !['ARRIVAL','START_ACTIVITY','PAUSE_ACTIVITY','RESUME_ACTIVITY','COMPLETE_ACTIVITY'].includes(input.event_type) && !input.text?.trim()) fail('FIELD_TEXT_REQUIRED');
  for (const a of input.attachments) {
    if (a?.attachment_id === input.mobile_event_id) fail('FIELD_IDENTIFIER_COLLISION');
    if (!object(a) || Object.keys(a).some(k => !['attachment_id','mobile_event_id','original_filename','filename','mime_type','file_size','sha256','capture_source','original_metadata'].includes(k)) || !FIELD_UUID.test(a.attachment_id ?? '') || a.mobile_event_id !== input.mobile_event_id || !Number.isInteger(a.file_size) || a.file_size < 1 || a.file_size > FIELD_FILE_LIMIT || !/^[a-f0-9]{64}$/.test(a.sha256 ?? '')) fail('FIELD_ATTACHMENT_INVALID');
    if(a.capture_source!==undefined && !['CAMERA','GALLERY'].includes(a.capture_source))fail('CAPTURE_SOURCE_INVALID');
    if(a.original_metadata!==undefined && (!object(a.original_metadata)||Object.keys(a.original_metadata).some(k=>k!=='file_last_modified')||!Number.isFinite(a.original_metadata.file_last_modified)||a.original_metadata.file_last_modified<0))fail('PHOTO_METADATA_INVALID');
    validateFieldFilename(a.original_filename, a.mime_type);
    if (a.filename !== `${a.attachment_id}.${mimeExtensions[a.mime_type]}`) fail('FIELD_ATTACHMENT_PATH_INVALID');
  }
  if (received && (!timestamp(input.received_at_gateway) || !object(input.authenticated_user) || Object.keys(input.authenticated_user).some(k => !['sub','email'].includes(k)) || typeof input.authenticated_user.sub !== 'string' || !input.authenticated_user.sub || typeof input.authenticated_user.email !== 'string' || !/^[a-f0-9]{64}$/.test(input.payload_sha256 ?? '') || !Number.isFinite(input.clock_skew_ms))) fail('FIELD_RECEIPT_INVALID');
  return JSON.parse(JSON.stringify(input));
}
export function canonicalFieldEvent(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalFieldEvent).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalFieldEvent(value[k])}`).join(',')}}`;
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) fail('FIELD_CANONICAL_INVALID');
  return JSON.stringify(value);
}
export function fieldEventFingerprintInput(event, identity) {
  const {received_at_gateway, authenticated_user, payload_sha256, clock_skew_ms, ...original} = event;
  return canonicalFieldEvent({event: original, identity});
}

