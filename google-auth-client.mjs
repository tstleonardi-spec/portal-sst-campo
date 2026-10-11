/** Public OAuth client ID is configuration, not a secret. Session is memory only. */
const SESSION_INVALIDATION_CODES=new Set(['AUTH_REQUIRED','AUTH_EXPIRED','AUTH_INVALID','AUTH_FAILED','ACCESS_DENIED','ORIGIN_NOT_ALLOWED']);

export const isSessionInvalidationError=error=>SESSION_INVALIDATION_CODES.has(error?.code);

function clientError(code,message,{category=code,httpStatus}={}){
  const error=new Error(message);
  error.code=code;
  error.failure_category=category;
  if(Number.isInteger(httpStatus)&&httpStatus>0)error.http_status=httpStatus;
  return error;
}

function transportError(error){
  const message=error?.message||'Não foi possível consultar o gateway.';
  const timeout=error?.name==='TimeoutError'||error?.name==='AbortError'||error?.code==='TIMEOUT'||/timeout|timed out|aborted/i.test(message);
  return clientError(timeout?'CLIENT_TIMEOUT':'NETWORK_ERROR',message,{category:timeout?'CLIENT_TIMEOUT':'NETWORK_ERROR'});
}

export function createFieldGoogleClient({ clientId,gatewayUrl,origin,google,transport=fetch,random=()=>crypto.randomUUID() }) {
  if (!clientId || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(gatewayUrl) || !/^https:\/\/[^/]+$/.test(origin)) throw new Error('Autenticação de campo não configurada.');
  let session=null,user=null,challenge=null,authState='SIGNED_OUT';
  async function call(operation,data={}) {
    let response;
    try { response=await transport(gatewayUrl,{ method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',redirect:'follow',cache:'no-store',body:JSON.stringify({ ...data,operation,origin }) }); }
    catch(error) { throw transportError(error); }
    if(!response?.ok || response.type==='opaque') throw clientError('HTTP_ERROR','O gateway não confirmou o acesso.',{category:'HTTP_ERROR',httpStatus:response?.status});
    let body;
    try { body=await response.json(); } catch { throw clientError('INVALID_RESPONSE','O gateway retornou uma resposta inválida.',{category:'INVALID_RESPONSE'}); }
    if(!body || typeof body.ok!=='boolean') throw clientError('INVALID_RESPONSE','O gateway retornou uma resposta inválida.',{category:'INVALID_RESPONSE'});
    if(!body.ok) {
      const code=typeof body.code==='string'&&body.code?body.code:'UNKNOWN';
      const authFailure=isSessionInvalidationError({code});
      if(authFailure){session=null;user=null;authState=code==='AUTH_EXPIRED'||code==='AUTH_REQUIRED'?'AUTH_EXPIRED':'AUTH_ERROR';}
      throw clientError(code,body.message||'Acesso negado.',{category:authFailure?code:code==='RECEIPT_NOT_FOUND'?'RECEIPT_NOT_FOUND':'UNKNOWN'});
    }
    return body.result;
  }
  async function prepareSignIn() { challenge=await call('AUTH_CHALLENGE'); return { ready:true }; }
  function signIn() {
    session=null;user=null;authState='SIGNED_OUT';
    if(!challenge) return Promise.reject(clientError('AUTH_REQUIRED','Prepare a entrada com Google e tente novamente.',{category:'AUTH_REQUIRED'}));
    const selected=challenge;challenge=null;
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initCodeClient({ client_id:clientId,scope:'openid email',ux_mode:'popup',state:selected.state,
        error_callback:()=>reject(clientError('AUTH_ERROR','Entrada com Google cancelada ou indisponível.',{category:'AUTH_ERROR'})),
        callback:async result=>{ try {
          if(result.error || !result.code || result.state!==selected.state) throw clientError('AUTH_INVALID','Resposta Google inválida.',{category:'AUTH_INVALID'});
          const received=await call('AUTH_LOGIN',{code:result.code,state:selected.state,mobile_event_id:random()});
          session=received.session;user=received.user;authState='AUTHENTICATED';resolve({user,expires_in:received.expires_in});
        }catch(error){reject(error);} }
      });
      client.requestCode();
    });
  }
  return { prepareSignIn,signIn,getUser:()=>user,getAuthState:()=>authState,
    check:()=>call('AUTH_CHECK',{session}),
    authorizedRequest:async(operation,data={})=>{if(!session)throw clientError('AUTH_REQUIRED','Entre com Google antes de enviar.',{category:'AUTH_REQUIRED'});return call(operation,{...data,session});},
    signOut:async()=>{try{if(session)await call('AUTH_LOGOUT',{session});}finally{session=null;user=null;authState='SIGNED_OUT';}}
  };
}

