/** Public OAuth client ID is configuration, not a secret. Session is memory only. */
const SESSION_INVALIDATION_CODES=new Set(['AUTH_REQUIRED','AUTH_EXPIRED','AUTH_INVALID','AUTH_FAILED','ACCESS_DENIED','ORIGIN_NOT_ALLOWED']);
export const CHALLENGE_SAFETY_MARGIN_MS=30000;
export function authErrorMessage(error){
  if(error?.code==='AUTH_CHALLENGE_READY')return 'Autorização renovada. Clique em Entrar com Google para continuar.';
  if(error?.code==='AUTH_STATE_INVALID')return 'A autorização expirou. Tente entrar novamente.';
  if(['GOOGLE_AUTH_ERROR','AUTH_INVALID'].includes(error?.code))return 'Não foi possível concluir o login com Google.';
  if(['NETWORK_ERROR','CLIENT_TIMEOUT'].includes(error?.code))return 'Não foi possível acessar o serviço de autenticação.';
  return 'O serviço de autenticação não confirmou o acesso. Tente entrar novamente.';
}

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

export function createFieldGoogleClient({ clientId,gatewayUrl,origin,google,transport=fetch,random=()=>crypto.randomUUID(),now=()=>Date.now(),isUserActivated=()=>globalThis.navigator?.userActivation?.isActive??true }) {
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
      throw clientError(code,authErrorMessage({code}),{category:authFailure?code:code==='RECEIPT_NOT_FOUND'?'RECEIPT_NOT_FOUND':'UNKNOWN'});
    }
    return body.result;
  }
  function challengeValid(){return Boolean(challenge&&challenge.expires_at-now()>CHALLENGE_SAFETY_MARGIN_MS);}
  async function prepareSignIn() {
    challenge=null;const issued_at=now(),received=await call('AUTH_CHALLENGE');
    if(typeof received?.state!=='string'||!received.state||!Number.isFinite(received.expires_in)||received.expires_in<=0||received.expires_in>120)throw clientError('INVALID_RESPONSE','Autorização inválida.');
    challenge={state:received.state,issued_at,expires_at:issued_at+received.expires_in*1000};
    if(!challengeValid()){challenge=null;throw clientError('AUTH_STATE_INVALID',authErrorMessage({code:'AUTH_STATE_INVALID'}));}
    return { ready:true };
  }
  function signIn() {
    session=null;user=null;authState='SIGNED_OUT';
    if(!challengeValid())return prepareSignIn().then(()=>{
      if(!isUserActivated())throw clientError('AUTH_CHALLENGE_READY',authErrorMessage({code:'AUTH_CHALLENGE_READY'}));
      return signIn();
    });
    const selected=challenge;challenge=null;
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initCodeClient({ client_id:clientId,scope:'openid email',ux_mode:'popup',state:selected.state,
        error_callback:()=>reject(clientError('GOOGLE_AUTH_ERROR',authErrorMessage({code:'GOOGLE_AUTH_ERROR'}))),
        callback:async result=>{ try {
          if(result.error || !result.code || result.state!==selected.state) throw clientError('AUTH_INVALID','Resposta Google inválida.',{category:'AUTH_INVALID'});
          const received=await call('AUTH_LOGIN',{code:result.code,state:selected.state,mobile_event_id:random()});
          if(typeof received?.session!=='string'||!received.session||typeof received?.user?.sub!=='string'||!received.user.sub||typeof received?.user?.email!=='string')throw clientError('INVALID_RESPONSE','O serviço de autenticação retornou uma resposta inválida.');
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

