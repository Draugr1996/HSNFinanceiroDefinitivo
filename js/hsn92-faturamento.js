/* Financeiro HSN 9.2.1: faturamento direto, sem cadastro, assunto e mensagem automaticos. */
window.HSN_FATURAMENTO=(()=>{'use strict';
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const ALLOWED=/\.(pdf|xml|png|jpe?g)$/i;
const MAX_FILE=10*1024*1024, MAX_TOTAL=25*1024*1024, MAX_COUNT=3;
const SUBJECT='Hotel Serra Negra | Envio de faturamento';
const CONTENT='Prezados,\n\nEncaminhamos, em anexo, a documentação referente ao faturamento para conferência e providências necessárias.\n\nPermanecemos à disposição para quaisquer esclarecimentos.\n\nAtenciosamente,\nSetor de Faturamento\nHotel Serra Negra\nfaturamento@hotelserranegra.com.br';
const parseEmails=v=>String(v||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
const isEmail=s=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s);
const fmtSize=n=>n>=1024*1024?(n/1048576).toFixed(2)+' MB':Math.max(1,Math.round(n/1024))+' KB';
let recipientInput, fileInput, files=[], sendBtn, status, historyNode, busy=false, uncertain=false;
const say=(msg,kind='')=>{if(!status)return;status.textContent=msg;status.dataset.kind=kind;};
function checkFile(f){if(!ALLOWED.test(f.name))throw Error('Arquivo não permitido: '+f.name+'. Escolha PDF, XML, JPG ou PNG.');if(!f.size||f.size>MAX_FILE)throw Error(f.name+': limite de 10 MB por arquivo.');}
function getEmails(){const list=parseEmails(recipientInput?.value);if(!list.length)throw Error('Informe pelo menos um e-mail.');if(list.length>8||list.some(v=>!isEmail(v)))throw Error('Confira os e-mails (máximo de 8). Separe por ponto e vírgula.');if(new Set(list.map(x=>x.toLowerCase())).size!==list.length)throw Error('Remova os e-mails repetidos.');return list;}
function validateSelection(selected){if(!selected.length)throw Error('Selecione pelo menos um arquivo.');if(selected.length>MAX_COUNT)throw Error('Selecione até 3 arquivos por envio (boleto, extrato e NF).');let total=0;const seen=new Set();for(const f of selected){checkFile(f);const key=f.name.toLowerCase()+'|'+f.size;if(seen.has(key))throw Error('O mesmo arquivo foi selecionado mais de uma vez.');seen.add(key);total+=f.size;}if(total>MAX_TOTAL)throw Error('Os arquivos somam mais de 25 MB.');}
function showFiles(){const wrap=$('hsn-billing-selected-files');if(!wrap)return;wrap.replaceChildren();if(!files.length){wrap.append(make('p','Nenhum arquivo selecionado.','hsn-billing-muted'));return;}for(const f of files){const row=make('div',undefined,'hsn-billing-picked');row.append(make('span','📄  '+f.name),make('small',fmtSize(f.size)));wrap.append(row);}wrap.append(make('p',files.length+' arquivo(s) · '+fmtSize(files.reduce((a,f)=>a+f.size,0)),'hsn-billing-muted'));}
function chooseFiles(){const chosen=Array.from(fileInput.files||[]);try{validateSelection(chosen);files=chosen;showFiles();say('Arquivos prontos para envio. Nenhum e-mail foi enviado.');}catch(e){files=[];fileInput.value='';showFiles();say(e.message,'error');}}
// Fingerprint keeps the previous backend's 7-day anti-duplicate protection
// without making users enter company or reference. Recipients + file bytes are used.
async function fingerprint(to,selected){const enc=new TextEncoder();const chunks=[enc.encode(to.map(x=>x.toLowerCase()).sort().join(';')+'\n')];for(const f of selected){chunks.push(enc.encode(f.name+'|'+f.size+'\n'));chunks.push(new Uint8Array(await f.arrayBuffer()));}const total=chunks.reduce((n,c)=>n+c.byteLength,0);const all=new Uint8Array(total);let pos=0;for(const c of chunks){all.set(c,pos);pos+=c.byteLength;}const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',all));return 'AUTO-'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('').slice(0,40);}
function getClient(){return window.HSN_ZOHO_CLIENT;}
async function refreshHistory(){const client=getClient();if(!client||!historyNode)return;try{const {data,error}=await client.from('hsn_billing_dispatches').select('to_emails,status,file_names,created_at,sent_at').order('created_at',{ascending:false}).limit(15);if(error)throw error;historyNode.replaceChildren();if(!data?.length){historyNode.append(make('p','Ainda não há envios registrados.','hsn-billing-muted'));return;}for(const r of data){const entry=make('div',undefined,'hsn-billing-history-item');const t=make('div');t.append(make('strong',r.to_emails||'Destinatário não informado'));let date='—';try{date=new Date(r.sent_at||r.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});}catch(_){}const qty=Array.isArray(r.file_names)?r.file_names.length:0;t.append(make('small',date+' · '+qty+' arquivo(s)'));const states={sent:'Enviado',processing:'Processando',review:'Conferir no Zoho',failed:'Falha'};const badge=make('span',states[r.status]||'A verificar','hsn-billing-status');badge.dataset.status=r.status;entry.append(t,badge);historyNode.append(entry);}}catch(e){historyNode.replaceChildren(make('p','Histórico indisponível. Confira a configuração no Supabase.','hsn-billing-muted'));}}
async function send(){if(busy||uncertain)return;let to;try{to=getEmails();validateSelection(files);}catch(e){say(e.message,'error');return;}
const names=files.map(f=>'• '+f.name+' ('+fmtSize(f.size)+')').join('\n');
if(!confirm('CONFIRMAR ENVIO DE FATURAMENTO\n\nDestinatários:\n'+to.join('; ')+'\n\nArquivos:\n'+names+'\n\nAssunto:\n'+SUBJECT+'\n\nEnviar agora pelo Zoho Mail?'))return;
busy=true;sendBtn.disabled=true;say('Enviando documentação pelo Zoho Mail…');
try{
 if(!navigator.onLine)throw Error('Sem internet.');
 const client=getClient();if(!client)throw Error('Supabase indisponível. Faça login novamente.');
 const reference=await fingerprint(to,files);
 const form=new FormData();form.append('request_id',crypto.randomUUID());form.append('company','Faturamento avulso');form.append('reference',reference);form.append('to',to.join(';'));form.append('cc','');form.append('subject',SUBJECT);form.append('content',CONTENT);form.append('confirm','ENVIAR_FATURAMENTO');
 // O backend 9.2 utiliza 3 slots de anexos; nenhum arquivo precisa ser rotulado pelo usuario.
 const slots=['boleto','extrato','nota'];files.forEach((f,i)=>form.append(slots[i],f,f.name));
 const {data,error}=await client.functions.invoke('zoho-billing-mail',{body:form});
 if(error){let detail='';try{if(error.context?.json)detail=(await error.context.json()).error||'';}catch(_){}throw Error(detail||error.message||'Resposta do envio não confirmada.');}
 if(!data?.success)throw Error(data?.error||'O Zoho não confirmou o envio.');
 files=[];fileInput.value='';showFiles();say('Faturamento enviado! O Zoho confirmou o envio para '+to.join('; ')+'.','success');await refreshHistory();
}catch(e){uncertain=true;say('Envio não confirmado: '+e.message+' Confira a pasta Enviados do Zoho antes de tentar novamente, para não duplicar e-mails.','error');}
finally{busy=false;sendBtn.disabled=uncertain;}
}
function show(){const client=getClient();const app=$('app');if(!client||!app||app.hidden)return;
$('new').hidden=true;const search=$('search')?.closest('.search-wrap');if(search)search.hidden=true;
$('view-title').textContent='Envio de faturamento';$('view-description').textContent='Informe os e-mails, anexe os documentos prontos e envie pelo Zoho Mail.';
for(const id of ['summary','finance-controls','calendar-board','records'])$(id).replaceChildren();
const panel=make('section',undefined,'hsn-billing hsn-billing-simple');
const header=make('div',undefined,'hsn-billing-top');const info=make('div');info.append(make('small','HOTEL SERRA NEGRA · ZOHO MAIL','hsn-billing-kicker'),make('h2','Enviar faturamento'),make('p','Sem cadastrar empresa ou preencher mensagem. Selecione os documentos já emitidos e envie.'));header.append(info,make('div','faturamento@hotelserranegra.com.br','hsn-billing-sender'));panel.append(header);
const form=make('section',undefined,'hsn-billing-compose');form.append(make('h3','1. Destinatários'));
const label=make('label','E-mail ou e-mails de destino','hsn-billing-label');recipientInput=make('textarea');recipientInput.rows=2;recipientInput.placeholder='financeiro@empresa.com.br; contas@empresa.com.br';recipientInput.autocomplete='off';label.append(recipientInput);form.append(label,make('p','Para vários destinatários, separe por ponto e vírgula. Todos receberão os mesmos anexos.','hsn-billing-muted'));panel.append(form);
const docs=make('section',undefined,'hsn-billing-docs');docs.append(make('h3','2. Arquivos já emitidos'),make('p','Selecione boleto, extrato e nota fiscal diretamente da pasta no seu computador. Até 3 arquivos em PDF, XML, JPG ou PNG.','hsn-billing-muted'));
fileInput=make('input');fileInput.type='file';fileInput.multiple=true;fileInput.accept='.pdf,.xml,.jpg,.jpeg,.png';fileInput.hidden=true;fileInput.addEventListener('change',chooseFiles);
const pick=make('button','Selecionar arquivos do computador','secondary');pick.type='button';pick.addEventListener('click',()=>fileInput.click());docs.append(pick,fileInput);const picked=make('div',undefined,'hsn-billing-selected');picked.id='hsn-billing-selected-files';docs.append(picked);panel.append(docs);
const sendArea=make('section',undefined,'hsn-billing-send-area');sendArea.append(make('h3','3. Enviar pelo Zoho Mail'));
const disclosure=make('details',undefined,'hsn-billing-template');const summary=make('summary','Visualizar mensagem automática');const preview=make('div',undefined,'hsn-billing-email-preview');preview.append(make('strong','Assunto: '+SUBJECT),make('pre',CONTENT));disclosure.append(summary,preview);sendArea.append(disclosure);
sendBtn=make('button','Enviar faturamento','hsn-billing-main-send');sendBtn.type='button';sendBtn.addEventListener('click',send);sendArea.append(sendBtn);
const help=make('p','O envio começa após uma confirmação dos destinatários e arquivos.','hsn-billing-muted');sendArea.append(help);
status=make('p','Nenhum faturamento enviado nesta operação.','hsn-billing-message');status.setAttribute('role','status');status.setAttribute('aria-live','polite');sendArea.append(status);
const reset=make('button','Novo envio','secondary');reset.type='button';reset.addEventListener('click',()=>{if(busy)return;if(!confirm('Preparar outro envio?'))return;files=[];fileInput.value='';recipientInput.value='';uncertain=false;sendBtn.disabled=false;showFiles();say('Pronto para um novo envio.');});sendArea.append(reset);panel.append(sendArea);
const historySection=make('section',undefined,'hsn-billing-history-section');historySection.append(make('h3','Últimos envios'));historyNode=make('div');historySection.append(historyNode);panel.append(historySection);
$('records').append(panel);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='billing_send'));showFiles();refreshHistory();}
return {show};
})();
