/** Public OAuth client ID is configuration, not a secret. Session is memory only. */
export function createFieldGoogleClient({ clientId,gatewayUrl,origin,google,transport=fetch,random=()=>crypto.randomUUID() }) {
  if (!clientId || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(gatewayUrl) || !/^https:\/\/[^/]+$/.test(origin)) throw new Error('Autenticação de campo não configurada.');
  let session=null,user=null,challenge=null;
  async function call(operation,data={}) {
    const response=await transport(gatewayUrl,{ method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',redirect:'follow',cache:'no-store',body:JSON.stringify({ ...data,operation,origin }) });
    if(!response.ok || response.type==='opaque') throw new Error('O gateway não confirmou o acesso.');
    const body=await response.json();
    if(!body.ok) { session=null;user=null;const error=new Error(body.message || 'Acesso negado.');error.code=body.code;throw error; }
    return body.result;
  }
  async function prepareSignIn() { challenge=await call('AUTH_CHALLENGE'); return { ready:true }; }
  function signIn() {
    session=null;user=null;
    if(!challenge) return Promise.reject(new Error('Prepare a entrada com Google e tente novamente.'));
    const selected=challenge;challenge=null;
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initCodeClient({ client_id:clientId,scope:'openid email',ux_mode:'popup',state:selected.state,
        error_callback:()=>reject(new Error('Entrada com Google cancelada ou indisponível.')),
        callback:async result=>{ try {
          if(result.error || !result.code || result.state!==selected.state) throw new Error('Resposta Google inválida.');
          const received=await call('AUTH_LOGIN',{code:result.code,state:selected.state,mobile_event_id:random()});
          session=received.session;user=received.user;resolve({user,expires_in:received.expires_in});
        }catch(error){reject(error);} }
      });
      client.requestCode();
    });
  }
  return { prepareSignIn,signIn,getUser:()=>user,
    check:()=>call('AUTH_CHECK',{session}),
    authorizedRequest:async(operation,data={})=>{if(!session)throw new Error('Entre com Google antes de enviar.');return call(operation,{...data,session});},
    signOut:async()=>{try{if(session)await call('AUTH_LOGOUT',{session});}finally{session=null;user=null;}}
  };
}
