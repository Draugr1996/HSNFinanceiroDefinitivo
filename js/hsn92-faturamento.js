/* Financeiro HSN 9.2.8 — reset completo, scroll ao inicio do formulario e cache isolado. */
window.HSN_FATURAMENTO=(()=>{'use strict';
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const ALLOWED=/\.(pdf|xml|png|jpe?g)$/i;
const MAX_FILE=10*1024*1024,MAX_TOTAL=25*1024*1024,MAX_COUNT=3,MAX_SIGN=750*1024;
const SENDER='faturamento@hotelserranegra.com.br';
const parseEmails=v=>String(v||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
const isEmail=s=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s);
const fmtSize=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const subject=nf=>'Hotel Serra Negra | Envio de faturamento'+(nf?' | NF nº '+nf:'');
const message=nf=>`Prezados(as),\n\nEncaminhamos, em anexo, os documentos referentes ao faturamento${nf?' da Nota Fiscal nº '+nf:''}, para conferência, registro e programação do pagamento, observadas as condições e os prazos acordados.\n\nA documentação disponibilizada poderá conter a nota fiscal, o extrato de hospedagem e o boleto bancário, conforme os arquivos anexados. Solicitamos, por gentileza, a confirmação do recebimento e permanecemos à disposição caso seja necessária alguma informação complementar ou ajuste.\n\nAgradecemos a atenção e a parceria.\n\nAtenciosamente,\nVanderson Santos\nSupervisor Administrativo Financeiro\nHotel Serra Negra\n${SENDER}`;
let recipientInput,nfInput,fileInput,signatureInput,files=[],signatureFile=null,sendBtn,status,historyNode,savedNode,savedCount,savedSearch,contactsPanel,csvInput,previewSubject,previewBody,signPreview,busy=false,uncertain=false;
let savedCache=[];
let historyRecords=[],historyExpanded=false,historyCountNode;
const say=(msg,kind='')=>{if(!status)return;status.textContent=msg;status.dataset.kind=kind;};
const getClient=()=>window.HSN_ZOHO_CLIENT;
function getNF(){const v=(nfInput?.value||'').trim().replace(/\s+/g,' ');if(v&&!/^[\p{L}\p{N}./-]{1,35}$/u.test(v))throw Error('O número da NF deve ter até 35 caracteres (letras, números, /, ponto ou hífen).');return v;}
function getEmails(){const arr=parseEmails(recipientInput?.value);if(!arr.length)throw Error('Informe pelo menos um e-mail.');if(arr.length>8||arr.some(x=>!isEmail(x)))throw Error('Confira os e-mails (máximo 8, separados por ponto e vírgula).');if(new Set(arr.map(x=>x.toLowerCase())).size!==arr.length)throw Error('Remova os destinatários repetidos.');return arr;}
function validateSelection(arr){if(!arr.length)throw Error('Selecione pelo menos um arquivo.');if(arr.length>MAX_COUNT)throw Error('São permitidos até três documentos por envio.');let sum=0;const seen=new Set();for(const f of arr){if(!ALLOWED.test(f.name)||!f.size||f.size>MAX_FILE)throw Error('Arquivo inválido ou maior que 10 MB: '+f.name);const key=f.name.toLowerCase()+'|'+f.size;if(seen.has(key))throw Error('Arquivo selecionado duas vezes: '+f.name);seen.add(key);sum+=f.size;}if(sum>MAX_TOTAL)throw Error('Os documentos ultrapassam 25 MB.');}
function showFiles(){const wrap=$('hsn-billing-selected-files');if(!wrap)return;wrap.replaceChildren();if(!files.length){wrap.append(make('p','Nenhum documento selecionado.','hsn-billing-muted'));return;}for(const f of files){const row=make('div',undefined,'hsn-billing-picked');row.append(make('span','📄  '+f.name),make('small',fmtSize(f.size)));wrap.append(row);}wrap.append(make('p',files.length+' arquivo(s) · '+fmtSize(files.reduce((s,x)=>s+x.size,0)),'hsn-billing-muted'));}
function chooseFiles(){try{const chosen=Array.from(fileInput.files||[]);validateSelection(chosen);files=chosen;showFiles();say('Documentos prontos. Nenhum e-mail foi enviado.');}catch(e){files=[];fileInput.value='';showFiles();say(e.message,'error');}}
function updatePreview(){let nf='';try{nf=getNF();}catch(_){nf='';}if(previewSubject)previewSubject.textContent='Assunto: '+subject(nf);if(previewBody)previewBody.textContent=message(nf);}
async function fingerprint(to,arr,nf){const chunks=[new TextEncoder().encode(to.map(x=>x.toLowerCase()).sort().join(';')+'\nNF:'+nf+'\n')];for(const f of arr){chunks.push(new TextEncoder().encode(f.name+'|'+f.size+'\n'));chunks.push(new Uint8Array(await f.arrayBuffer()));}const len=chunks.reduce((s,x)=>s+x.byteLength,0),bytes=new Uint8Array(len);let pos=0;for(const x of chunks){bytes.set(x,pos);pos+=x.byteLength;}const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return 'NF-'+Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('').slice(0,40);}
// Private local IndexedDB: one image per browser/device, never published as a URL.
function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open('HSN-Billing-Private',1);r.onupgradeneeded=()=>r.result.createObjectStore('settings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function signatureStore(value){const db=await dbOpen();try{await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,'signature');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function signatureRead(){const db=await dbOpen();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readonly');const r=tx.objectStore('settings').get('signature');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
function updateSignatureView(){if(!signPreview)return;signPreview.replaceChildren();if(!signatureFile){signPreview.append(make('span','Nenhuma imagem cadastrada. Será usada a assinatura com nome e cargo.','hsn-billing-muted'));return;}const info=make('span','Imagem selecionada: '+signatureFile.name+' · '+fmtSize(signatureFile.size),'hsn-billing-muted');const img=make('img');img.alt='Prévia da assinatura digitalizada';img.className='hsn-billing-signature-image';const url=URL.createObjectURL(signatureFile);img.src=url;img.onload=()=>URL.revokeObjectURL(url);signPreview.append(info,img);}
async function chooseSignature(){const file=signatureInput.files?.[0];if(!file)return;if(!/^image\/(png|jpeg)$/.test(file.type)||!(/\.(png|jpe?g)$/i.test(file.name))||!file.size||file.size>MAX_SIGN){say('Assinatura: envie uma imagem PNG/JPG de até 750 KB.','error');signatureInput.value='';return;}const hdr=new Uint8Array(await file.slice(0,8).arrayBuffer());const png=hdr[0]===137&&hdr[1]===80&&hdr[2]===78&&hdr[3]===71;const jpg=hdr[0]===255&&hdr[1]===216;if(!(png||jpg)){say('A assinatura não parece uma imagem PNG/JPG válida.','error');return;}signatureFile=file;try{await signatureStore(file);say('Assinatura salva neste navegador. Confira a prévia e faça um envio de teste.','success');}catch(_){say('Assinatura selecionada apenas para esta sessão; o navegador não permitiu salvá-la.','error');}updateSignatureView();}
async function removeSignature(){signatureFile=null;signatureInput.value='';try{await signatureStore(null);}catch(_){}updateSignatureView();}
async function loadSignature(){try{const f=await signatureRead();if(f instanceof Blob&&f.size){signatureFile=new File([f],f.name||('assinatura.'+(f.type==='image/jpeg'?'jpg':'png')),{type:f.type||'image/png'});updateSignatureView();}}catch(_){} }
async function currentUser(){const client=getClient();if(!client)throw Error('Você precisa entrar no Financeiro HSN.');const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)throw Error('Sua sessão expirou. Entre novamente.');return data.user.id;}
function insertRecipient(email){
 const list=parseEmails(recipientInput.value);
 if(list.some(x=>x.toLowerCase()===email.toLowerCase())){say('Esse e-mail já está selecionado.');return;}
 if(list.length>=8){say('Limite de 8 destinatários por envio.','error');return;}
 recipientInput.value=[...list,email].join('; ');
 say('Destinatário adicionado: '+email);
 recipientInput.focus();
 renderSaved();
}
function renderSaved(){
 if(!savedNode)return;
 savedNode.replaceChildren();
 const query=(savedSearch?.value||'').toLocaleLowerCase('pt-BR').trim();
 const filtered=savedCache.filter(x=>x.toLocaleLowerCase('pt-BR').includes(query));
 if(savedCount)savedCount.textContent=savedCache.length+' salvo'+(savedCache.length===1?'':'s');
 if(!filtered.length){
  savedNode.append(make('p',query?'Nenhum contato corresponde à pesquisa.':'Nenhum endereço salvo ainda.','hsn-billing-muted'));
  return;
 }
 const selected=new Set(parseEmails(recipientInput.value).map(x=>x.toLowerCase()));
 for(const email of filtered.slice(0,100)){
  const button=make('button',undefined,'hsn-billing-saved-row');
  button.type='button';button.title='Adicionar aos destinatários: '+email;
  const selectedAlready=selected.has(email.toLowerCase());
  button.append(make('span',email),make('strong',selectedAlready?'Selecionado':'+ Adicionar'));
  if(selectedAlready)button.dataset.selected='true';
  button.addEventListener('click',()=>insertRecipient(email));
  savedNode.append(button);
 }
 if(filtered.length>100)savedNode.append(make('p','Mostrando os primeiros 100 resultados. Refine a busca.','hsn-billing-muted'));
}
async function refreshSaved(){
 const client=getClient();if(!client||!savedNode)return;
 try{
  const seen=new Set(),all=[];
  // Supabase limita a paginação de uma consulta: percorre lotes sem carregar milhares de registros na tela.
  for(let start=0;start<5000;start+=500){
   const {data,error}=await client.from('hsn_billing_recipients').select('to_emails,company').order('updated_at',{ascending:false}).range(start,start+499);
   if(error)throw error;
   for(const row of data||[])for(const address of parseEmails(row.to_emails)){
    const key=address.toLowerCase();
    if(isEmail(address)&&!seen.has(key)){seen.add(key);all.push(address);}
   }
   if(!data||data.length<500)break;
  }
  // Integra os contatos já associados às cobranças Sicoob, sem modificar esses cadastros.
  // Se o módulo Sicoob estiver indisponível, a agenda do faturamento continua funcionando.
  try{
   const uid=await currentUser();
   for(let start=0;start<5000;start+=500){
    const {data,error}=await client.from('sicoob_contacts')
     .select('email').eq('owner_id',uid).order('company',{ascending:true}).range(start,start+499);
    if(error)throw error;
    for(const row of data||[])for(const address of parseEmails(row.email)){
     const key=address.toLowerCase();
     if(isEmail(address)&&!seen.has(key)){seen.add(key);all.push(address);}
    }
    if((data||[]).length<500)break;
   }
  }catch(e){console.warn('Agenda Sicoob indisponível para pesquisa no faturamento.');}
  savedCache=all;
  renderSaved();
 }catch(_){
  savedNode.replaceChildren(make('span','Não foi possível carregar os contatos salvos.','hsn-billing-muted'));
  if(savedCount)savedCount.textContent='indisponíveis';
 }
}
async function saveRecipients(list,{silent=false}={}){
 const owner=await currentUser(),client=getClient();
 const unique=[...new Map(list.map(email=>[email.toLowerCase().trim(),email.trim()])).values()];
 for(let i=0;i<unique.length;i+=100){
  const rows=unique.slice(i,i+100).map(email=>({owner_id:owner,company:'EMAIL: '+email.toLowerCase(),to_emails:email,cc_emails:'',updated_at:new Date().toISOString()}));
  const {error}=await client.from('hsn_billing_recipients').upsert(rows,{onConflict:'owner_id,company'});
  if(error)throw Error('Não foi possível salvar os e-mails: '+error.message);
 }
 await refreshSaved();
 if(!silent&&contactsPanel)contactsPanel.open=false;
}
async function saveOnClick(){try{const list=getEmails();await saveRecipients(list);say(list.length+' e-mail(s) salvo(s) para os próximos envios.','success');}catch(e){say(e.message,'error');}}
function detectDelimiter(firstRow){
 const counts={',':0,';':0,'\t':0};let inQuote=false;
 for(let i=0;i<firstRow.length;i++){
  const c=firstRow[i];
  if(c==='"'){if(inQuote&&firstRow[i+1]==='"')i++;else inQuote=!inQuote;}
  else if(!inQuote&&c in counts)counts[c]++;
 }
 return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
function parseDelimitedCSV(text){
 const clean=text.replace(/^\uFEFF/,'');
 const firstLine=clean.split(/\r?\n/,1)[0]||'';
 const delimiter=detectDelimiter(firstLine);
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<clean.length;i++){
  const c=clean[i];
  if(c==='"'){if(quoted&&clean[i+1]==='"'){field+='"';i++;}else quoted=!quoted;continue;}
  if(!quoted&&c===delimiter){row.push(field);field='';continue;}
  if(!quoted&&(c==='\n'||c==='\r')){
   if(c==='\r'&&clean[i+1]==='\n')i++;
   row.push(field);if(row.some(v=>v.trim()))rows.push(row);
   row=[];field='';continue;
  }
  field+=c;
 }
 if(field||row.length){row.push(field);if(row.some(v=>v.trim()))rows.push(row);}
 return rows;
}
async function importZohoCSV(){
 const file=csvInput?.files?.[0];
 if(!file)return;
 csvInput.value='';
 if(!/\.csv$/i.test(file.name)||file.size>3*1024*1024||file.size===0){say('Selecione um CSV do Zoho de até 3 MB.','error');return;}
 try{
  const rows=parseDelimitedCSV(await file.text());
  if(rows.length<2)throw Error('O CSV está vazio ou não possui contatos.');
  const headers=rows[0].map(x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim());
  let emailCols=headers.map((h,i)=>((/\b(e-?mail|email|correio eletronico|endereco eletronico|mail address)\b/i.test(h))?i:-1)).filter(i=>i>=0);
  const fallback=emailCols.length===0;
  const found=new Map();
  const emailPattern=/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
  for(const row of rows.slice(1,5001)){
   const cells=(fallback?row:emailCols.map(i=>row[i]||''));
   for(const cell of cells){
    for(const match of String(cell||'').match(emailPattern)||[]){
     if(isEmail(match))found.set(match.toLowerCase(),match);
     if(found.size>=3000)break;
    }
    if(found.size>=3000)break;
   }
   if(found.size>=3000)break;
  }
  const list=[...found.values()];
  if(!list.length)throw Error('Nenhum e-mail válido foi encontrado no CSV.');
  const existing=new Set(savedCache.map(x=>x.toLowerCase()));
  const newCount=list.filter(x=>!existing.has(x.toLowerCase())).length;
  const warn=fallback?'\n\nNão identifiquei uma coluna de e-mail; os endereços foram extraídos das células do arquivo. Revise o CSV antes de confirmar.':'';
  if(!confirm('IMPORTAR CONTATOS DO ZOHO\n\n'+list.length+' e-mail(s) válido(s) no arquivo.\n'+newCount+' ainda não aparece(m) na sua lista.\n\nA importação salvará os e-mails na sua conta do Financeiro HSN e não enviará mensagens.'+warn+'\n\nConfirmar?'))return;
  say('Importando '+list.length+' contato(s) do CSV…');
  await saveRecipients(list);
  say(list.length+' e-mail(s) conferido(s); '+newCount+' novo(s) contato(s) importado(s).','success');
 }catch(e){say('Importação não concluída: '+(e?.message||e),'error');}
}
// Historico compacto: quatro registros visiveis por padrao. Detalhes acessiveis ao expandir cada linha.
// Todos os registros permanecem salvos no Supabase; esta tela mostra os 30 mais recentes.
const HISTORY_COLLAPSED=4;
function formatHistoryDate(value){
 if(!value)return 'Data indisponível';
 const d=new Date(value);
 return Number.isNaN(d.getTime())?'Data indisponível':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
}
function displayHistorySubject(value){
 const str=String(value||'');
 const match=str.match(/NF\s*n[º°o.]?\s*([^\s|]+)/i);
 return match?'NF nº '+match[1]:'Faturamento sem NF';
}
function appendHistoryDetail(parent,title,value){
 const line=make('div',undefined,'hsn-billing-history-detail-line');
 line.append(make('span',title),make('strong',String(value||'—')));
 parent.append(line);
}
function renderHistory(){
 if(!historyNode)return;
 historyNode.replaceChildren();
 if(historyCountNode)historyCountNode.textContent=historyRecords.length?(historyRecords.length+' registro'+(historyRecords.length!==1?'s':'')+' recente'+(historyRecords.length!==1?'s':'')):'Nenhum envio registrado';
 if(!historyRecords.length){historyNode.append(make('p','Ainda não há envios registrados.','hsn-billing-muted'));return;}
 const visible=historyExpanded?historyRecords:historyRecords.slice(0,HISTORY_COLLAPSED);
 const labels={sent:'Enviado',processing:'Processando',review:'Conferir no Zoho',failed:'Falha'};
 for(const record of visible){
  const recipients=parseEmails(record.to_emails).join('; ')||'Destinatário não informado';
  const date=formatHistoryDate(record.sent_at||record.created_at);
  const qty=Array.isArray(record.file_names)?record.file_names.length:0;
  const entry=make('details',undefined,'hsn-billing-history-entry');
  const summary=make('summary',undefined,'hsn-billing-history-summary');
  summary.title='Clique para ver destinatários, assunto e arquivos';
  const left=make('div',undefined,'hsn-billing-history-main');
  left.append(make('strong',displayHistorySubject(record.subject),'hsn-billing-history-nf'));
  left.append(make('span',date+' · '+qty+' arquivo'+(qty===1?'':'s'),'hsn-billing-history-meta'));
  left.append(make('span',recipients,'hsn-billing-history-recipient'));
  const badge=make('span',labels[record.status]||'A verificar','hsn-billing-status');
  badge.dataset.status=record.status||'';
  summary.append(left,badge);
  const detail=make('div',undefined,'hsn-billing-history-detail');
  appendHistoryDetail(detail,'Destinatários',recipients);
  appendHistoryDetail(detail,'Assunto',record.subject||'Não informado');
  appendHistoryDetail(detail,'Data',date);
  const attached=Array.isArray(record.file_names)?record.file_names.map(f=>typeof f==='string'?f:(f?.nome||f?.name||'Documento')).filter(Boolean):[];
  appendHistoryDetail(detail,'Documentos',attached.length?attached.join(' · '):qty+' arquivo(s)');
  entry.append(summary,detail);
  historyNode.append(entry);
 }
 if(historyRecords.length>HISTORY_COLLAPSED){
  const control=make('button',historyExpanded?'Mostrar menos':'Ver mais '+(historyRecords.length-HISTORY_COLLAPSED)+' envios','hsn-billing-history-more');
  control.type='button';
  control.setAttribute('aria-expanded',String(historyExpanded));
  control.addEventListener('click',()=>{historyExpanded=!historyExpanded;renderHistory();});
  historyNode.append(control);
 }
}
async function refreshHistory(){
 const client=getClient();if(!client||!historyNode)return;
 try{
  const {data,error}=await client.from('hsn_billing_dispatches')
   .select('to_emails,status,file_names,created_at,sent_at,subject')
   .order('created_at',{ascending:false}).limit(30);
  if(error)throw error;
  historyRecords=data||[];
  renderHistory();
 }catch(_){historyRecords=[];historyNode.replaceChildren(make('p','Histórico indisponível. Verifique a conexão com o Supabase.','hsn-billing-muted'));if(historyCountNode)historyCountNode.textContent='Histórico indisponível';}
}
async function send(){if(busy||uncertain)return;let to,nf;try{to=getEmails();nf=getNF();validateSelection(files);}catch(e){say(e.message,'error');return;}
const list=files.map(f=>'• '+f.name+' ('+fmtSize(f.size)+')').join('\n');if(!confirm('CONFIRMAR ENVIO DE FATURAMENTO\n\nDestinatários:\n'+to.join('; ')+'\n\nArquivos:\n'+list+'\n\nAssunto:\n'+subject(nf)+'\n\n'+(signatureFile?'Inclui assinatura digitalizada cadastrada.':'Assinatura textual de Vanderson Santos.')+'\n\nEnviar agora pelo Zoho Mail?'))return;
busy=true;sendBtn.disabled=true;say('Enviando documentos pelo Zoho Mail…');try{if(!navigator.onLine)throw Error('Sem internet.');const client=getClient();if(!client)throw Error('Supabase indisponível.');const reference=await fingerprint(to,files,nf);const form=new FormData();form.append('request_id',crypto.randomUUID());form.append('company','Faturamento avulso');form.append('reference',reference);form.append('to',to.join(';'));form.append('cc','');form.append('nf_number',nf);form.append('subject',subject(nf));form.append('content',message(nf));form.append('confirm','ENVIAR_FATURAMENTO');const slots=['boleto','extrato','nota'];files.forEach((f,i)=>form.append(slots[i],f,f.name));if(signatureFile)form.append('signature_image',signatureFile,signatureFile.name);
const {data,error}=await client.functions.invoke('zoho-billing-mail',{body:form});if(error){let detail='';try{if(error.context?.json)detail=(await error.context.json()).error||'';}catch(_){}throw Error(detail||error.message||'Resposta não confirmada.');}if(!data?.success)throw Error(data?.error||'O Zoho não confirmou o envio.');
files=[];fileInput.value='';showFiles();say('Faturamento enviado! Zoho confirmou o envio para '+to.join('; ')+'.'+(data?.signature_inline_warning?' Confira também a visualização da assinatura em Enviados.':''),'success');try{await saveRecipients(to);}catch(_){say('Faturamento enviado pelo Zoho, mas os e-mails não foram salvos. Use “Salvar e-mails”.','error');}await refreshHistory();}
catch(e){uncertain=true;say('Envio não confirmado: '+e.message+' Confira a pasta Enviados do Zoho ANTES de repetir, para evitar duplicidade.','error');}finally{busy=false;sendBtn.disabled=uncertain;}}
function show(){const client=getClient(),app=$('app');if(!client||!app||app.hidden)return;$('new').hidden=true;const search=$('search')?.closest('.search-wrap');if(search)search.hidden=true;$('view-title').textContent='Envio de faturamento';$('view-description').textContent='Escolha os destinatários, informe a NF e anexe os documentos já emitidos.';for(const id of ['summary','finance-controls','calendar-board','records'])$(id).replaceChildren();const panel=make('section',undefined,'hsn-billing hsn-billing-simple');const header=make('div',undefined,'hsn-billing-top'),info=make('div');info.append(make('small','HOTEL SERRA NEGRA · ZOHO MAIL','hsn-billing-kicker'),make('h2','Enviar faturamento'),make('p','E-mails salvos, número da NF no assunto, mensagem formal e assinatura de Vanderson Santos.'));header.append(info,make('div',SENDER+' · v9.2.8','hsn-billing-sender'));panel.append(header);
const form=make('section',undefined,'hsn-billing-compose');form.append(make('h3','1. Destinatários e nota fiscal'));const label=make('label','E-mail ou e-mails de destino','hsn-billing-label');recipientInput=make('textarea');recipientInput.rows=1;recipientInput.placeholder='financeiro@empresa.com.br; contas@empresa.com.br';recipientInput.addEventListener('input',renderSaved);label.append(recipientInput);form.append(label);
const emailTools=make('div',undefined,'hsn-billing-contact-toolbar');
const save=make('button','Salvar e-mails','secondary');save.type='button';save.addEventListener('click',saveOnClick);
const importButton=make('button','Importar CSV do Zoho','secondary');importButton.type='button';importButton.addEventListener('click',()=>csvInput.click());
csvInput=make('input');csvInput.type='file';csvInput.accept='.csv,text/csv';csvInput.hidden=true;csvInput.addEventListener('change',importZohoCSV);
emailTools.append(save,importButton,csvInput);
form.append(emailTools);
contactsPanel=make('details',undefined,'hsn-billing-contacts-panel');
const summaryContacts=make('summary');summaryContacts.append(make('span','Contatos salvos'),(savedCount=make('span','Carregando…','hsn-billing-count')),make('span','Pesquisar ou selecionar','hsn-billing-contacts-hint'));
contactsPanel.append(summaryContacts);
const panelBody=make('div',undefined,'hsn-billing-contacts-body');
savedSearch=make('input');savedSearch.type='search';savedSearch.placeholder='Buscar e-mail salvo…';savedSearch.setAttribute('aria-label','Buscar contatos salvos');savedSearch.addEventListener('input',renderSaved);panelBody.append(savedSearch);
savedNode=make('div',undefined,'hsn-billing-contacts-results');panelBody.append(savedNode);
panelBody.append(make('p','Contatos importados do Zoho, salvos no faturamento e cadastrados nas cobranças Sicoob.','hsn-billing-muted'));
contactsPanel.append(panelBody);form.append(contactsPanel);const nLabel=make('label','Número da nota fiscal (opcional)','hsn-billing-label');nfInput=make('input');nfInput.type='text';nfInput.maxLength=35;nfInput.placeholder='Ex.: 1297';nfInput.autocomplete='off';nfInput.addEventListener('input',updatePreview);nLabel.append(nfInput);form.append(nLabel,make('p','O número aparecerá automaticamente no assunto e no corpo da mensagem.','hsn-billing-muted'));panel.append(form);
const docs=make('section',undefined,'hsn-billing-docs');docs.append(make('h3','2. Documentos já emitidos'),make('p','Selecione na pasta do computador até três PDFs, XMLs ou imagens (boleto, extrato e NF).','hsn-billing-muted'));fileInput=make('input');fileInput.type='file';fileInput.multiple=true;fileInput.accept='.pdf,.xml,.jpg,.jpeg,.png';fileInput.hidden=true;fileInput.addEventListener('change',chooseFiles);const pick=make('button','Selecionar arquivos','secondary');pick.type='button';pick.addEventListener('click',()=>fileInput.click());docs.append(pick,fileInput);const picked=make('div',undefined,'hsn-billing-selected');picked.id='hsn-billing-selected-files';docs.append(picked);panel.append(docs);
const signature=make('section',undefined,'hsn-billing-signature');signature.append(make('h3','3. Sua assinatura digitalizada'),make('p','Nome e cargo já aparecem automaticamente no final. Se desejar, escolha uma imagem PNG/JPG da sua assinatura manuscrita (até 750 KB). A imagem fica salva somente neste navegador.','hsn-billing-muted'));signatureInput=make('input');signatureInput.type='file';signatureInput.accept='.png,.jpg,.jpeg';signatureInput.hidden=true;signatureInput.addEventListener('change',chooseSignature);const signActions=make('div',undefined,'hsn-billing-email-tools');const choose=make('button','Selecionar imagem da assinatura','secondary');choose.type='button';choose.addEventListener('click',()=>signatureInput.click());const remove=make('button','Remover assinatura','secondary');remove.type='button';remove.addEventListener('click',removeSignature);signActions.append(choose,remove);signature.append(signActions,signatureInput);signPreview=make('div',undefined,'hsn-billing-signature-preview');signature.append(signPreview,make('p','Assinatura digitalizada é uma imagem ilustrativa da assinatura, não assinatura com certificado ICP-Brasil. Faça um envio de teste para conferir como aparece no Zoho.','hsn-billing-muted'));panel.append(signature);
const sendArea=make('section',undefined,'hsn-billing-send-area');sendArea.append(make('h3','4. Enviar pelo Zoho Mail'));const details=make('details',undefined,'hsn-billing-template'),summary=make('summary','Visualizar mensagem automática'),preview=make('div',undefined,'hsn-billing-email-preview');previewSubject=make('strong');previewBody=make('pre');preview.append(previewSubject,previewBody);details.append(summary,preview);sendArea.append(details);sendBtn=make('button','Enviar faturamento','hsn-billing-main-send');sendBtn.type='button';sendBtn.addEventListener('click',send);sendArea.append(sendBtn,make('p','O envio só ocorre após confirmar destinatários, NF e documentos.','hsn-billing-muted'));status=make('p','Nenhum faturamento enviado nesta operação.','hsn-billing-message');status.setAttribute('role','status');status.setAttribute('aria-live','polite');sendArea.append(status);const reset=make('button','Novo envio','secondary');reset.type='button';reset.addEventListener('click',()=>{
 if(busy)return;
 // Se o resultado do envio foi incerto, obrigar a conferencia no Zoho para evitar reenvio acidental.
 if(uncertain&&!confirm('O envio anterior não foi confirmado. Você já conferiu a pasta Enviados do Zoho antes de começar um novo envio?'))return;
 // Limpa somente os campos deste envio. Contatos salvos, assinatura e histórico permanecem intactos.
 recipientInput.value='';
 nfInput.value='';
 files=[];
 fileInput.value='';
 if(savedSearch)savedSearch.value='';
 if(csvInput)csvInput.value='';
 if(contactsPanel)contactsPanel.open=false;
 uncertain=false;
 sendBtn.disabled=false;
 showFiles();
 renderSaved();
 updatePreview();
 // Fecha a mensagem antiga e desmarca qualquer selecao do envio anterior.
 details.open=false;
 say('Novo envio pronto (v9.2.8). Destinatários, nota e anexos foram limpos.');
 // Em layouts com rolagem interna, window.scrollTo(0,0) sozinho nao move o formulario.
 // scrollIntoView alcança tanto a janela quanto eventuais containers rolaveis.
 const start=panel.querySelector('.hsn-billing-top')||panel;
 start.style.scrollMarginTop='96px'; // Reserva espaco para o cabecalho fixo.
 start.scrollIntoView({behavior:'auto',block:'start',inline:'nearest'});
 // Foco sem nova rolagem: cursor pronto para digitar o proximo destinatario.
 recipientInput.focus({preventScroll:true});
});sendArea.append(reset);panel.append(sendArea);
const historySection=make('section',undefined,'hsn-billing-history-section');const historyHeader=make('div',undefined,'hsn-billing-history-header');historyHeader.append(make('h3','Últimos envios'));historyCountNode=make('span','Carregando…','hsn-billing-history-count');historyHeader.append(historyCountNode);historySection.append(historyHeader);historyNode=make('div',undefined,'hsn-billing-history-list');historySection.append(historyNode);panel.append(historySection);$('records').append(panel);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='billing_send'));showFiles();updatePreview();updateSignatureView();refreshSaved();loadSignature();refreshHistory();}
return {show};})();
