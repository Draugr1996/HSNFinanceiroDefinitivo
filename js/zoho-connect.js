/* Zoho OAuth: somente inicia autorização; não envia mensagens. */
(function(root){'use strict';
const $=id=>document.getElementById(id);
function show(){
  $('new').hidden=true;
  $('search').closest('.search-wrap').hidden=true;
  $('view-title').textContent='Conexão Zoho Mail';
  $('view-description').textContent='Autorize sua conta para preparar o módulo de cobranças Sicoob.';
  $('summary').replaceChildren();$('finance-controls').replaceChildren();$('calendar-board').replaceChildren();
  const wrap=$('records');wrap.replaceChildren();
  const card=document.createElement('article');card.className='record';
  const title=document.createElement('h2');title.textContent='Zoho Mail · autorização segura';card.append(title);
  const intro=document.createElement('p');intro.textContent='A conexão permite autorizar sua conta Zoho. Esta versão não envia e-mails, não importa boletos e não dispara cobranças.';card.append(intro);
  const status=document.createElement('p');status.setAttribute('role','status');status.id='zoho-connect-status';
  const result=new URL(location.href).searchParams.get('zoho');
  const labels={connected:'O Zoho retornou uma autorização concluída. A conexão ainda precisa ser validada no servidor antes de habilitar envios.',authorization_denied:'A autorização foi cancelada.',invalid_callback:'Retorno inválido do Zoho.',invalid_state:'Solicitação expirada ou inválida. Tente novamente.',state_already_used:'Esta autorização já foi utilizada. Inicie outra.',token_error:'O Zoho não forneceu um token de renovação. Verifique a autorização.',connection_error:'Não foi possível concluir a conexão. Consulte os logs da função.'};
  status.textContent=labels[result]||'Nenhuma autorização concluída neste navegador.';card.append(status);
  if(result){const clean=new URL(location.href);clean.searchParams.delete('zoho');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);}
  const btn=document.createElement('button');btn.type='button';btn.textContent='Conectar Zoho Mail';
  btn.onclick=async()=>{
    btn.disabled=true;status.textContent='Preparando autorização…';
    try{
      const {data:sessionData,error:sessionError}=await root.HSN_ZOHO_CLIENT.auth.getSession();
      if(sessionError||!sessionData.session?.access_token)throw Error('Faça login novamente no Financeiro HSN.');
      const {data,error}=await root.HSN_ZOHO_CLIENT.functions.invoke('zoho-oauth-start',{method:'POST',headers:{Authorization:'Bearer '+sessionData.session.access_token}});
      if(error)throw Error(error.message||'Não foi possível iniciar a autorização.');
      if(!data?.url||!data.url.startsWith('https://accounts.zoho.com/oauth/v2/auth?'))throw Error('O servidor não retornou um endereço válido de autorização.');
      location.assign(data.url);
    }catch(error){status.textContent='Falha: '+error.message;btn.disabled=false;}
  };card.append(btn);
  const identify=document.createElement('button');
  identify.type='button';
  identify.className='secondary';
  identify.textContent='Identificar conta Zoho';
  identify.style.marginLeft='0.5rem';
  identify.onclick=async()=>{
    identify.disabled=true;
    status.textContent='Consultando conta remetente no Zoho…';
    try{
      const client=root.HSN_ZOHO_CLIENT;
      if(!client)throw Error('Conexão com Supabase indisponível. Atualize a página.');
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError||!sessionData.session?.access_token)throw Error('Faça login novamente no Financeiro HSN.');
      const {data,error}=await client.functions.invoke('zoho-send-mail',{
        method:'POST',
        headers:{Authorization:'Bearer '+sessionData.session.access_token},
        body:{action:'identify_account'}
      });
      if(error){
        let detail='';
        try{const response=error.context;if(response?.json){const body=await response.json();detail=body?.error||'';}}catch(_){}
        throw Error(detail||error.message||'Falha na consulta ao Zoho.');
      }
      if(!data?.success||!data?.account_configured)throw Error(data?.error||'A conta remetente não foi identificada.');
      status.textContent='Conta remetente identificada e salva: '+(data.sender||'faturamento@hotelserranegra.com.br')+'. Nenhum e-mail foi enviado.';
    }catch(error){status.textContent='Não foi possível identificar a conta: '+(error?.message||'erro desconhecido');}
    finally{identify.disabled=false;}
  };
  card.append(identify);
  const testSection=document.createElement('div');
  testSection.style.cssText='margin-top:1rem;padding:1rem;border:1px solid var(--border, #546073);border-radius:12px;';
  const testHeading=document.createElement('h3');testHeading.textContent='Teste controlado de envio';testSection.append(testHeading);
  const testInfo=document.createElement('p');testInfo.textContent='Envia somente uma mensagem de teste para faturamento@hotelserranegra.com.br. Não utiliza boletos nem envia mensagens a clientes.';testSection.append(testInfo);
  const testButton=document.createElement('button');testButton.type='button';testButton.className='secondary';testButton.textContent='Enviar e-mail de teste';
  testButton.onclick=async()=>{
    const recipient='faturamento@hotelserranegra.com.br';
    if(!confirm('TESTE ZOHO MAIL\n\nDestinatário: '+recipient+'\nAssunto: TESTE DE ENVIO - NÃO É COBRANÇA\n\nDeseja continuar?'))return;
    if(!confirm('CONFIRMAÇÃO FINAL\n\nSerá enviado UM e-mail real para '+recipient+'.\nNenhum cliente receberá esta mensagem.\n\nConfirmar envio agora?'))return;
    testButton.disabled=true;status.textContent='Enviando mensagem de teste ao Zoho Mail…';
    try{
      const client=root.HSN_ZOHO_CLIENT;
      if(!client)throw Error('Supabase indisponível. Faça login novamente.');
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError||!sessionData.session?.access_token)throw Error('Sessão expirada. Faça login novamente.');
      const {data,error}=await client.functions.invoke('zoho-mail-test',{
        method:'POST',headers:{Authorization:'Bearer '+sessionData.session.access_token},
        body:{confirm:'ENVIAR_TESTE'}
      });
      if(error){
        let detail='';
        try{if(error.context?.json){const result=await error.context.json();detail=result?.error||'';}}catch(_){}
        throw Error(detail||error.message||'Erro ao chamar a função de teste.');
      }
      if(!data?.success)throw Error(data?.error||'O Zoho não confirmou o envio.');
      status.textContent='Zoho aceitou o e-mail de teste para '+recipient+'. Confira a caixa de entrada. Nenhum boleto foi alterado.';
    }catch(error){status.textContent='Teste não confirmado: '+(error?.message||'Erro desconhecido')+'. Se houver dúvida sobre o resultado, verifique a caixa de entrada e os logs antes de repetir.';}
    finally{testButton.disabled=false;}
  };
  testSection.append(testButton);card.append(testSection);
  const note=document.createElement('p');note.className='muted';note.textContent='Nenhuma cobrança será enviada sem a etapa posterior de revisão e confirmação.';card.append(note);
  wrap.append(card);
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='zoho_connect'));
}
root.HSN_ZOHO={show};
})(window);
