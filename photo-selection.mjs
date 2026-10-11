import {FIELD_FILE_LIMIT,detectFieldImage,validateFieldFilename} from './field-event-schema.mjs';
export const UNSUPPORTED_PHOTO_MESSAGE='Este formato ainda não é suportado. Selecione JPEG, PNG ou WEBP.';
export async function selectFieldPhoto(file,source) {
  if(!['CAMERA','GALLERY'].includes(source)) throw new Error('CAPTURE_SOURCE_INVALID');
  if(!file || file.size<1 || file.size>FIELD_FILE_LIMIT) throw Object.assign(new Error('Selecione uma foto de até 10 MiB.'),{code:'PHOTO_SIZE_INVALID'});
  try {const mime=detectFieldImage(new Uint8Array(await file.arrayBuffer()));validateFieldFilename(file.name,mime);if(file.type && file.type!==mime)throw new Error('MIME_MISMATCH');}
  catch {throw Object.assign(new Error(UNSUPPORTED_PHOTO_MESSAGE),{code:'PHOTO_TYPE_INVALID'});}
  return {file,capture_source:source,original_metadata:{file_last_modified:file.lastModified}};
}
export class PhotoPreview {
  constructor({create=URL.createObjectURL,revoke=URL.revokeObjectURL}={}){this.create=create;this.revoke=revoke;this.url=null;}
  replace(blob){this.clear();this.url=blob?this.create(blob):null;return this.url;}
  clear(){if(this.url)this.revoke(this.url);this.url=null;}
}

