/* HSN 9.4 — private drafts, explicit recipients and one sequential queue. */
window.HSN_SEND=(()=>{'use strict';
const $=id=>document.getElementById(id),el=(t,text,cls)=>{const n=document.createElement(t);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,fn)=>{const b=el('button',text,'secondary');b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>report(e.message));return b;};
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const emails=v=>String(v||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean),valid=v=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(v);
const date=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const labels={draft:'Aguardando conferência',prepared:'Preparado',processing:'Processando',sent:'Enviado',failed:'Falha — pode repetir',review:'Conferir no Zoho',pending:'Pendente de envio',paid:'Pago'};
const defaults=[
 ['billing','Envio de faturamento','Hotel Serra Negra | Faturamento | {{empresa}} | NF {{documento}}','Prezados(as),\n\nEncaminhamos os documentos do faturamento de {{empresa}}, referência {{documento}}.\n\nSolicitamos a conferência e confirmação de recebimento. Permanecemos à disposição.\n\nAtenciosamente,\nVanderson Santos\nSupervisor Administrativo Financeiro\nHotel Serra Negra'],
 ['collection','Cobrança vencida','Hotel Serra Negra | Pendência financeira | {{empresa}}','Prezados(as),\n\nIdentificamos as seguintes pendências de {{empresa}}:\n\n{{titulos}}\n\nTotal: {{valor}}. Caso o pagamento já tenha sido efetuado, pedimos o comprovante para conferência.\n\nPermanecemos à disposição.\n\nAtenciosamente,\nVanderson Santos\nHotel Serra Negra'],
 ['second','Segunda via','Hotel Serra Negra | Segunda via | {{documento}}','Prezados(as),\n\nEncaminhamos a segunda via dos documentos de {{empresa}}, referência {{documento}}. Solicitamos a confirmação do recebimento.\n\nAtenciosamente,\nVanderson Santos\nHotel Serra Negra'],
 ['resend','Reenvio de NF e boleto','Hotel Serra Negra | Reenvio | {{documento}}','Prezados(as),\n\nReencaminhamos a NF e o boleto de {{empresa}}, referência {{documento}}, para conferência.\n\nAtenciosamente,\nVanderson Santos\nHotel Serra Negra'],
 ['reminder','Lembrete de pagamento','Hotel Serra Negra | Lembrete | {{documento}}','Prezados(as),\n\nLembramos o vencimento em {{vencimento}} do documento {{documento}}, valor {{valor}}, referente a {{empresa}}. Se o pagamento já ocorreu, favor desconsiderar e encaminhar o comprovante.\n\nAtenciosamente,\nVanderson Santos\nHotel Serra Negra'],
 ['correction','Correção de documentos','Hotel Serra Negra | Documentação corrigida | {{documento}}','Prezados(as),\n\nEncaminhamos os documentos corrigidos de {{empresa}}, referência {{documento}}. Por gentileza, considerem os documentos anexados a esta mensagem e confirmem o recebimento.\n\nAtenciosamente,\nVanderson Santos\nHotel Serra Negra']
];
let panel='work',consolidated=true,showOtherTitles=false,titlePage=1,searchTimer;let generation=0;let uid='',mode='all',rows=[],drafts=[],contacts=[],titles=[],remote=[],models=[],issues=[],cap=null,loading=null,loadedAt=0,selection=new Set(),busy=false,search='',statusFilter='',fromDate='',toDate='',page=1,root,msg,ownerCache='';
function client(){return window.HSN_ZOHO_CLIENT||db;}
function report(text){const target=document.querySelector('.hsn94-dialog[open] [data-feedback]')||msg;if(target){target.textContent=text;target.setAttribute('role','status');}}
function store(){return new Promise((resolve,reject)=>{const r=indexedDB.open('HSN-Send-94',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function local(action,value){const d=await store();try{return await new Promise((resolve,reject)=>{const tx=d.transaction('drafts',action==='getAll'?'readonly':'readwrite'),s=tx.objectStore('drafts'),r=action==='getAll'?s.getAll():s.put(value);let out;r.onsuccess=()=>out=r.result;tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Falha ao guardar rascunho.'));});}finally{d.close();}}
async function save(d){await local('put',d);if(d.owner!==uid)return;const i=drafts.findIndex(x=>x.id===d.id);if(i>=0)drafts[i]=d;else drafts.push(d);}
async function invoke(payload,files){let body=payload;if(files){body=new FormData();body.append('payload',JSON.stringify(payload));for(const f of files)body.append('files',f,f.name);}
 const result=await client().functions.invoke('hsn-dispatch',{body});if(result.error){let data;try{data=await result.error.context?.json();}catch{}const e=Error(data?.error||result.error.message);e.state=data?.status;e.retry=data?.retry_after;throw e;}if(!result.data?.success)throw Error(result.data?.error||'Resposta não confirmada.');return result.data;
}
async function fetchRows(table,columns,order){const owner=uid;const out=[];for(let start=0;start<10000;start+=500){const r=await client().from(table).select(columns).eq('owner_id',owner).order(order,{ascending:false}).range(start,start+499);if(r.error)throw Error(table+': '+r.error.message);out.push(...r.data||[]);if(!r.data||r.data.length<500)return out;}issues.push(table+': limite de 10.000 registros; refine a consulta no Supabase.');return out;}
function mergeContacts(billing,sicoob,history){const map=new Map();const add=(email,company,source,rank=0)=>{if(!valid(email))return;const key=email.toLowerCase();if(!map.has(key))map.set(key,{email,companies:[],sources:[],rank:0});const c=map.get(key);if(company&&!company.startsWith('EMAIL:')&&!c.companies.includes(company))c.companies.push(company);if(!c.sources.includes(source))c.sources.push(source);c.rank=Math.max(c.rank,rank);};
 for(const r of billing){for(const e of emails(r.to_emails))add(e,r.company,'Faturamento / Zoho',1);for(const e of emails(r.cc_emails))add(e,r.company,'Faturamento / Zoho',0);}
 for(const r of sicoob)for(const [i,e]of emails(r.email).entries())add(e,r.company,'Sicoob',i===0?1:0);
 for(const r of history.filter(x=>x.status==='sent')){for(const e of r.snapshot.to)add(e,r.snapshot.company,'Envio anterior',3);for(const e of r.snapshot.cc)add(e,r.snapshot.company,'Envio anterior',2);}
 return [...map.values()];}
async function load(force=false){if(loading)return loading;if(!force&&Date.now()-loadedAt<60000&&ownerCache===uid)return;
 const currentGeneration=generation,currentOwner=uid;loading=(async()=>{issues=[];cap=null;let billing=[],sicoob=[];const requests=[['hsn_billing_recipients','company,to_emails,cc_emails','company'],['sicoob_contacts','company,email','company'],['sicoob_collections','id,company,reference,external_reference,due_date,amount,status','due_date'],['hsn_send_jobs','*','created_at'],['hsn_send_templates','*','code'],['hsn_billing_dispatches','id,company,to_emails,cc_emails,subject,file_names,status,sent_at,created_at','created_at'],['sicoob_collection_dispatches','id,collection_id,recipient_email,status,sent_at,created_at','created_at'],['hsn_send_contacts','email,display_name,companies','email']];
 const res=await Promise.allSettled(requests.map(x=>fetchRows(...x)));if(currentGeneration!==generation||currentOwner!==uid)throw Error('Sessão alterada.');const data=res.map((r,i)=>{if(r.status==='rejected'){issues.push(r.reason.message);return [];}return r.value;});[billing,sicoob,titles,remote,models]=data;
 try{cap=await invoke({action:'capabilities'});}catch(e){issues.push('Servidor de envios: '+e.message);}
 if(currentGeneration!==generation||currentOwner!==uid)throw Error('Sessão alterada.');contacts=mergeContacts(billing,sicoob,remote);for(const r of data[7]){let c=contacts.find(c=>c.email.toLowerCase()===r.email.toLowerCase());if(!c){c={email:r.email,companies:[],sources:['Agenda compartilhada'],rank:0};contacts.push(c);}c.display_name=r.display_name||'';c.companies=[...new Set([...c.companies,...r.companies||[]])];}drafts=(await local('getAll')).filter(x=>x.owner===uid);
 // A reload after an interrupted request must not offer a blind retry.
 for(const d of drafts){const job=remote.find(j=>j.id===d.remoteId);if(job&&['sent','failed','review','processing'].includes(job.status)){d.status=job.status;d.error=job.error_detail;await save(d);}else if(job?.status==='prepared'&&['review','processing'].includes(d.status)){d.status='draft';d.confirmed=false;d.approval=null;d.error='A reserva não foi iniciada. Confira novamente antes de preparar.';await save(d);}else if(d.status==='processing'){d.status='review';d.error='Operação interrompida; confira o histórico e o Zoho.';await save(d);}}
 const mirrored=new Set(remote.flatMap(j=>j.legacy_ids||[]));rows=data[5].filter(r=>!mirrored.has(r.id)).map(r=>({...r,legacy:true,kind:'billing',snapshot:{company:r.company,to:emails(r.to_emails),cc:emails(r.cc_emails),subject:r.subject,files:(r.file_names||[]).map(f=>({name:typeof f==='string'?f:f.nome||f.name}))}})).concat(data[6].filter(r=>!mirrored.has(r.id)).map(r=>{const t=titles.find(t=>t.id===r.collection_id);return {...r,legacy:true,kind:'collection',snapshot:{company:t?.company||'Título não carregado',nf:t?.external_reference,amount:t?.amount,to:emails(r.recipient_email),cc:[],files:[]}};}));loadedAt=Date.now();ownerCache=uid;
 })().finally(()=>loading=null);return loading;
}
function allRows(){const ids=new Set(drafts.map(d=>d.remoteId).filter(Boolean));return [...drafts.map(d=>({...d,snapshot:d,local:true})),...remote.filter(j=>!ids.has(j.id)),...rows];}
function field(parent,label,value,type='text'){const l=el('label',label),n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value??'';n.setAttribute('aria-label',label);if(type==='textarea')n.rows=5;l.append(n);parent.append(l);return n;}
function dialog(title){const d=el('dialog',undefined,'hsn94-dialog'),head=el('div',undefined,'hsn94-bar'),feedback=el('p');feedback.dataset.feedback='true';feedback.setAttribute('role','status');head.append(el('h2',title),btn('Fechar',()=>d.close()));d.append(head,feedback);d.addEventListener('close',()=>d.remove());d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});document.body.append(d);d.showModal();return d;}
function model(code){const saved=models.find(x=>x.code===code),def=defaults.find(x=>x[0]===code)||defaults[0];return saved||{code:def[0],title:def[1],subject:def[2],body:def[3]};}
function variables(d,text){const list=(d.titles||[]).map(t=>`${t.external_reference} · Venc.: ${t.due_date.split('-').reverse().join('/')} · ${money(t.amount)}`).join('\n');const v={empresa:d.company,documento:d.nf||d.titles?.map(x=>x.external_reference).join(', ')||'não informado',valor:money(d.amount),vencimento:d.due_date?d.due_date.split('-').reverse().join('/'):'não informado',titulos:list};return text.replace(/\{\{(\w+)\}\}/g,(all,key)=>v[key]??all);}
function applyModel(d,code){d.templateCode=code;const t=model(code);d.subject=variables(d,t.subject);d.content=variables(d,t.body);}
function suggestionInput(parent,label,value,company){const wrap=el('div',undefined,'hsn94-suggest'),input=field(wrap,label,value),results=el('div',undefined,'hsn94-suggestions');results.setAttribute('role','group');results.setAttribute('aria-label','Sugestões de destinatários');results.hidden=true;wrap.append(results);parent.append(wrap);
 const draw=()=>{const q=clean(input.value.split(/[;,]/).at(-1));const selected=new Set(emails(input.value).map(x=>x.toLowerCase()));const list=contacts.filter(c=>!selected.has(c.email.toLowerCase())&&(!q||clean(c.email+' '+(c.display_name||'')+' '+c.companies.join(' ')).includes(q))).sort((a,b)=>Number(b.companies.some(c=>clean(c)===clean(company())))-Number(a.companies.some(c=>clean(c)===clean(company())))||b.rank-a.rank||a.email.localeCompare(b.email)).slice(0,8);results.replaceChildren();for(const c of list){results.append(btn(c.email+' · '+(c.display_name?c.display_name+' · ':'')+(c.companies.join(', ')||'Sem empresa'),()=>{const values=input.value.split(/[;,]/);values.pop();input.value=[...values.map(x=>x.trim()).filter(Boolean),c.email].join('; ')+'; ';results.hidden=true;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}));}results.hidden=!list.length;};
 input.addEventListener('input',draw);input.addEventListener('focus',draw);input.addEventListener('keydown',e=>{if(e.key==='Escape')results.hidden=true;if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}});wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement))results.hidden=true;},100));return input;
}
function validate(d){if(!d.company||d.company.trim().length<2)throw Error('Informe a empresa.');const to=emails(d.to),cc=emails(d.cc);if(!to.length||to.length>8||cc.length>8||[...to,...cc].some(x=>!valid(x))||new Set([...to,...cc].map(x=>x.toLowerCase())).size!==to.length+cc.length)throw Error('Confira destinatários e remova duplicações.');if(!d.subject||d.subject.length>180||/[\r\n]/.test(d.subject)||!d.content||d.content.length>10000||/\{\{[^}]+\}\}/.test(d.subject+d.content))throw Error('Confira assunto, mensagem e variáveis.');if(d.kind==='billing'&&(!d.files?.length||d.files.length>3))throw Error('Cada faturamento precisa de 1 a 3 anexos.');if(!d.confirmed)throw Error('Confirme a empresa e todos os documentos.');}
async function readFile(file){if(file.name.toLowerCase().endsWith('.xml')){const xml=new DOMParser().parseFromString(await file.text(),'text/xml');if(xml.querySelector('parsererror'))throw Error('XML inválido.');const tag=(base,name)=>[...base.getElementsByTagNameNS('*',name)][0]?.textContent?.trim()||'';const dest=[...xml.getElementsByTagNameNS('*','dest')][0]||[...xml.getElementsByTagNameNS('*','TomadorServico')][0];return {company:dest?(tag(dest,'xNome')||tag(dest,'RazaoSocial')):'',nf:tag(xml,'nNF')||tag(xml,'Numero'),amount:tag(xml,'vNF')||tag(xml,'ValorServicos'),due_date:tag(xml,'dVenc'),warning:dest?'Empresa extraída do destinatário/tomador. Confira.':'Empresa não identificada como destinatário. Informe manualmente.'};}
 if(!window.HSN_OCR_READER)return {warning:'Leitor indisponível. Preencha manualmente.'};const r=await HSN_OCR_READER.read(file,'nota_fiscal',report);return {nf:r.numbers?.length===1?r.numbers[0].value:'',amount:r.amounts?.length===1?r.amounts[0].value:'',due_date:r.dueDates?.length===1?r.dueDates[0].value:'',warning:'Leitura sugerida. Confira os dados e a empresa; o emitente pode ser o hotel.'};}
function preferredContacts(company){return contacts.filter(c=>c.companies.some(name=>clean(name)===clean(company))).sort((a,b)=>b.rank-a.rank||a.email.localeCompare(b.email)).slice(0,5);}
function contactChips(parent,input,company,onPick){
 parent.replaceChildren();const list=preferredContacts(company);
 if(!list.length){parent.append(el('small','Digite no campo Para para buscar ou informar um e-mail.'));return;}
 parent.append(el('small','Contatos desta empresa · clique para selecionar'));
 for(const c of list){const b=btn(c.email,()=>{const selected=emails(input.value);if(!selected.some(e=>clean(e)===clean(c.email)))input.value=[...selected,c.email].join('; ');input.dispatchEvent(new Event('input',{bubbles:true}));onPick?.();});b.classList.add('hsn941-chip');b.setAttribute('aria-label','Usar '+c.email);parent.append(b);}
}
async function saveCompanyContacts(company,to,cc){
 const companyName=company.trim(),primary=emails(to),copy=emails(cc);
 if(companyName.length<2||!primary.length||[...primary,...copy].some(x=>!valid(x)))throw Error('Informe a empresa e e-mails válidos.');
 const existing=await client().from('hsn_billing_recipients').select('to_emails,cc_emails').eq('owner_id',uid).eq('company',companyName).maybeSingle();if(existing.error)throw existing.error;
 const unique=list=>[...new Map(list.map(x=>[x.toLowerCase(),x])).values()];
 const allTo=unique([...emails(existing.data?.to_emails),...primary]),allCC=unique([...emails(existing.data?.cc_emails),...copy]).filter(x=>!allTo.some(a=>clean(a)===clean(x)));
 const result=await client().from('hsn_billing_recipients').upsert({owner_id:uid,company:companyName,to_emails:allTo.join('; '),cc_emails:allCC.join('; '),updated_at:new Date().toISOString()},{onConflict:'owner_id,company'});if(result.error)throw result.error;
 for(const address of [...primary,...copy]){let c=contacts.find(c=>clean(c.email)===clean(address));if(!c){c={email:address,companies:[],sources:['Faturamento'],rank:0};contacts.push(c);}if(!c.companies.includes(companyName))c.companies.push(companyName);}
}
async function editor(original){
 const d=original?structuredClone(original):{id:crypto.randomUUID(),owner:uid,kind:'billing',status:'draft',company:'',to:'',cc:'',nf:'',amount:null,due_date:'',files:[],created_at:new Date().toISOString(),confirmed:false};
 delete d.snapshot;delete d.local;
 if(d.kind==='collection')return reviewCollections([d]);
 if(['sent','processing','review'].includes(d.status))throw Error('Este envio exige conferência no histórico e não pode ser editado.');
 d.to=Array.isArray(d.to)?d.to.join('; '):d.to||'';d.cc=Array.isArray(d.cc)?d.cc.join('; '):d.cc||'';
 d.templateCode=d.templateCode||'billing';
 const initial=model(d.templateCode);
 let subjectManual=d.subjectManual??(!!d.subject&&d.subject!==variables(d,initial.subject));
 let contentManual=d.contentManual??(!!d.content&&d.content!==variables(d,initial.body));
 const box=dialog('Enviar faturamento'),grid=el('div',undefined,'hsn94-form hsn941-editor');box.append(grid);
 const docs=el('section',undefined,'hsn941-documents');docs.append(el('strong','1. Adicione os documentos'),el('small','NF, boleto e documentos da mesma empresa · até 3 arquivos'));
 const pick=field(docs,'Adicionar documentos (até 3 por faturamento)','','file');pick.multiple=true;pick.accept='.pdf,.xml,.png,.jpg,.jpeg';
 const files=el('div',undefined,'hsn94-file-list'),fileNotice=el('p');fileNotice.setAttribute('role','status');docs.append(files,fileNotice);grid.append(docs);
 const company=field(grid,'Empresa',d.company),to=suggestionInput(grid,'Para · selecione e-mails',d.to,()=>company.value);
 const chips=el('div',undefined,'hsn941-chips');grid.append(chips);
 const names=el('datalist');names.id='hsn94-companies';for(const name of [...new Set(contacts.flatMap(c=>c.companies))])names.append(new Option(name,name));box.append(names);company.setAttribute('list',names.id);
 const nf=field(grid,'Documento / NF',d.nf);
 const options=el('details',undefined,'hsn941-options');options.open=!!d.cc;options.append(el('summary','Cópia e agenda de contatos'));
 const cc=suggestionInput(options,'CC · opcional',d.cc,()=>company.value);
 options.append(btn('Guardar estes contatos para a empresa',async()=>{await saveCompanyContacts(company.value,to.value,cc.value);report('Contatos acrescentados à agenda. Os cadastros anteriores foram preservados.');}));grid.append(options);
 const metadata=el('details',undefined,'hsn941-options');metadata.append(el('summary','Valor e vencimento · opcionais'));
 const amount=field(metadata,'Valor de referência',d.amount,'number'),due=field(metadata,'Vencimento',d.due_date,'date');amount.step='0.01';grid.append(metadata);
 const message=el('details',undefined,'hsn941-options');message.append(el('summary','Mensagem pronta · revisar ou editar'));
 const subject=field(message,'Assunto',d.subject),content=field(message,'Mensagem editável',d.content,'textarea');content.rows=5;
 const select=el('select');select.setAttribute('aria-label','Modelo de mensagem');for(const t of defaults)select.append(new Option(t[1],t[0]));select.value=d.templateCode;
 const useModel=btn('Usar este modelo',()=>{sync();d.templateCode=select.value;subjectManual=contentManual=false;refreshMessage();invalidate();schedule();});
 message.append(select,useModel);
 const signature=el('details');signature.append(el('summary','Ver assinatura institucional'));const image=el('img');image.src='icons/assinatura-faturamento-v2.png';image.alt='Assinatura institucional';image.style.maxWidth='100%';signature.append(image);message.append(signature);grid.append(message);
 const summary=el('p',undefined,'hsn941-message-summary');grid.append(summary);
 const confirmLabel=el('label',undefined,'hsn94-check'),confirmed=el('input');confirmed.type='checkbox';confirmed.checked=!!d.confirmed;
 confirmLabel.append(confirmed,el('span','Conferi a empresa, os destinatários e os documentos.'));grid.append(confirmLabel);
 const feedback=box.querySelector('[data-feedback]'),footer=el('div',undefined,'hsn94-bar hsn941-dialog-actions');box.append(footer);
 let timer,reading=false,preparing=false,closingSaved=false;
 function sync(){d.company=company.value.trim();d.to=to.value;d.cc=cc.value;d.nf=nf.value.trim();d.amount=amount.value===''?null:Number(amount.value);d.due_date=due.value;d.subject=subject.value;d.content=content.value;d.subjectManual=subjectManual;d.contentManual=contentManual;d.confirmed=confirmed.checked;}
 function refreshMessage(){sync();const t=model(d.templateCode);if(!subjectManual)subject.value=variables(d,t.subject);if(!contentManual)content.value=variables(d,t.body);d.subject=subject.value;d.content=content.value;summary.textContent='Assunto: '+d.subject;}
 function invalidate(){confirmed.checked=false;d.confirmed=false;d.status='draft';d.approval=null;}
 async function persist(){sync();if(!d.confirmed&&['prepared','failed'].includes(d.status)){d.status='draft';d.approval=null;}await save(d);}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>persist().catch(e=>report('Não foi possível guardar o rascunho: '+e.message)),250);}
 function drawFiles(){files.replaceChildren();for(const [i,f]of d.files.entries()){const row=el('div',undefined,'hsn94-bar');row.append(el('span',f.name+' · '+Math.ceil(f.size/1024)+' KB'),btn('Remover',()=>{d.files.splice(i,1);invalidate();drawFiles();persist().catch(e=>report(e.message));}));files.append(row);}}
 async function recognize(automatic){
  if(reading||!d.files.length)return;reading=true;confirmed.disabled=true;footer.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const source=automatic?d.files.filter(f=>/\.xml$/i.test(f.name)):[d.files[0]];const found=[];
   for(const f of source){const result=await readFile(f);found.push(result);}
   if(!box.isConnected)return;
   const companies=[...new Set(found.map(r=>r.company).filter(Boolean))],nfs=[...new Set(found.map(r=>r.nf).filter(Boolean))];
   if(companies.length>1||companies.length&&company.value&&clean(companies[0])!==clean(company.value)||nfs.length>1){fileNotice.className='hsn94-error';fileNotice.textContent='Os documentos sugerem empresas ou NFs diferentes. Confira cada arquivo antes de autorizar.';}
   else{const r=found[0];if(r){if(r.company&&!company.value)company.value=r.company;if(r.nf&&!nf.value)nf.value=r.nf;if(r.amount!==''&&r.amount!=null&&!amount.value)amount.value=r.amount;if(r.due_date&&!due.value)due.value=r.due_date;}fileNotice.textContent=found.length?'Dados sugeridos pelo documento. Confira antes de enviar.':'Arquivos adicionados. Informe empresa e NF se necessário.';}
   invalidate();refreshMessage();contactChips(chips,to,company.value);await persist();
  }catch(e){fileNotice.textContent='Leitura não aplicada: '+e.message+'. Você pode preencher os campos manualmente.';}
  finally{reading=false;confirmed.disabled=false;footer.querySelectorAll('button').forEach(b=>b.disabled=preparing);}
 }
 pick.onchange=async()=>{try{const added=[...pick.files];if(d.files.length+added.length>3)throw Error('Até 3 arquivos por faturamento. Use outro faturamento para outra empresa.');for(const f of added)if(!f.size||f.size>10485760||! /\.(pdf|xml|png|jpe?g)$/i.test(f.name))throw Error('Arquivo inválido ou maior que 10 MB.');if([...d.files,...added].reduce((sum,f)=>sum+f.size,0)>26214400)throw Error('Limite de 25 MB por faturamento.');d.files.push(...added);invalidate();drawFiles();await persist();if(added.some(f=>/\.xml$/i.test(f.name)))await recognize(true);else fileNotice.textContent='Documentos guardados no rascunho.';}catch(e){report(e.message);}finally{pick.value='';}};
 metadata.append(btn('Ler dados do documento',()=>recognize(false)));
 grid.addEventListener('input',e=>{if(e.target===subject)subjectManual=true;if(e.target===content)contentManual=true;if(e.target!==confirmed){invalidate();if([company,nf,amount,due].includes(e.target))refreshMessage();if(e.target===company)contactChips(chips,to,company.value);}schedule();});
 box.addEventListener('close',()=>{clearTimeout(timer);if(!closingSaved)persist().then(()=>draw()).catch(e=>report(e.message));});
 const saveDraft=btn('Salvar rascunho',async()=>{clearTimeout(timer);await persist();closingSaved=true;box.close();draw();});
 async function finish(openReview){if(preparing||reading||busy)return;clearTimeout(timer);await persist();validate(d);preparing=true;busy=true;
  const enabled=[...box.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);enabled.forEach(n=>n.disabled=true);
  let prepared=false;try{feedback.textContent='Preparando a conferência…';await prepare(d);prepared=true;}
  finally{preparing=false;busy=false;enabled.forEach(n=>n.disabled=false);}
  if(prepared){closingSaved=true;box.close();draw();if(openReview){selection=new Set([d.id]);await sendSelected();}else report('Faturamento adicionado ao lote. Você pode preparar o próximo.');}
 }
 const queue=btn('Adicionar ao lote',()=>finish(false)),review=btn('Conferir envio',()=>finish(true));review.classList.add('hsn941-primary');footer.append(saveDraft,queue,review);
 drawFiles();refreshMessage();if(original&&(original.subject!==d.subject||original.content!==d.content))invalidate();contactChips(chips,to,company.value);
 company.focus({preventScroll:true});
}

async function prepare(d){if(!cap)throw Error('Instale a migração e a função hsn-dispatch antes de preparar envios.');validate(d);const payload={action:'prepare',kind:d.kind,company:d.company,nf:d.nf,amount:d.amount,due_date:d.due_date,to:emails(d.to),cc:emails(d.cc),subject:d.subject,content:d.content,collection_ids:d.titles?.map(x=>x.id),confirm_documents:true,resend_of:d.resend_of,resend_reason:d.resend_reason};const r=await invoke(payload,d.kind==='billing'?d.files:null);d.remoteId=r.id;d.approval=r.approval;d.serverSnapshot=r.snapshot;d.status='prepared';d.error='';await save(d);selection.add(d.id);}
async function sendSelected(){if(busy)return;const list=drafts.filter(d=>selection.has(d.id));if(!list.length)throw Error('Selecione os rascunhos que deseja enviar.');if(list.some(d=>!['prepared','failed'].includes(d.status)))throw Error('Prepare e confira todos os itens selecionados. Enviados e resultados incertos não podem ser repetidos.');
 for(const d of list)validate(d);
 const box=dialog('Conferência final · '+list.length+' e-mail(s)'),container=el('div',undefined,'hsn94-review');box.append(container);
 for(const d of list){const snapshot=d.serverSnapshot;if(!snapshot||snapshot.subject!==d.subject||snapshot.content!==d.content||JSON.stringify(snapshot.to)!==JSON.stringify(emails(d.to))||JSON.stringify(snapshot.cc)!==JSON.stringify(emails(d.cc)))throw Error('O rascunho mudou. Refaça a prévia antes de enviar.');const detail=el('details');detail.open=true;detail.append(el('summary',d.company+' · '+(d.kind==='billing'?'Faturamento':'Cobrança')+' · '+money(d.amount)),el('p','Para: '+d.to+' · CC: '+(d.cc||'—')),el('strong',d.subject),el('pre',d.content),el('p','Documentos: '+(d.files?.map(f=>f.name).join(' · ')||d.titles.map(t=>t.external_reference).join(' · '))));const mismatched=contacts.filter(c=>emails(d.to+';'+d.cc).some(e=>e.toLowerCase()===c.email.toLowerCase())&&c.companies.length&&!c.companies.some(name=>clean(name)===clean(d.company)));if(mismatched.length)detail.append(el('p','Confira a associação: estes endereços também estão cadastrados em outras empresas: '+mismatched.map(c=>c.email+' ('+c.companies.join(', ')+')').join('; '),'hsn94-error'));container.append(detail);}
 const progress=el('p');progress.setAttribute('role','status');box.append(progress);const run=btn('Confirmar e enviar estes itens',async()=>{
 if(busy)return;busy=true;const sendingOwner=uid;run.disabled=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);let sent=0;
 try{const execute=async()=>{for(const [i,d]of list.entries()){if(sendingOwner!==uid||!user||user.id!==sendingOwner){progress.textContent='Sessão alterada. Fila interrompida.';break;}if(!navigator.onLine){progress.textContent='Sem conexão. Fila pausada; rascunhos preservados.';break;}
   try{progress.textContent=(i+1)+'/'+list.length+' · '+d.company;
    // Renew an expired approval with the same confirmed snapshot; never change data.
    validate(d);if(d.status==='failed'||!d.approval||JSON.parse(d.approval.body).expires<Date.now()+15000)await prepare(d);
    d.status='processing';await save(d);draw();const r=await invoke({action:'send',id:d.remoteId,approval:d.approval,confirm:'ENVIAR_APROVADOS'});d.status=r.status;d.sent_at=new Date().toISOString();d.approval=null;await save(d);selection.delete(d.id);sent++;
   }catch(e){d.status=e.state||'review';d.error=e.message;await save(d);progress.textContent='Fila pausada: '+e.message;break;}
   draw();if(i<list.length-1)await new Promise(r=>setTimeout(r,6500));
  }};
  if(!navigator.locks)throw Error('Este navegador não oferece bloqueio seguro entre abas. Use Chrome ou Edge atualizado.');
  await navigator.locks.request('hsn-send:'+uid,{ifAvailable:true},async lock=>{if(!lock)throw Error('Outra aba está enviando.');await execute();});
  progress.textContent+=' · '+sent+' envio(s) confirmado(s).';
 }finally{busy=false;box.querySelectorAll('button').forEach(b=>b.disabled=false);run.disabled=true;loadedAt=0;draw();}
 });box.append(run);
}
function lockedTitleIds(){return new Set([...remote.filter(r=>['prepared','processing','review','sent'].includes(r.status)),...drafts.filter(r=>['draft','prepared','failed','processing','review','sent'].includes(r.status))].flatMap(r=>(r.titles||r.snapshot?.titles||[]).map(t=>t.id)).concat(rows.filter(r=>r.kind==='collection'&&r.collection_id).map(r=>r.collection_id)));}
function eligibleTitle(t,blocked=lockedTitleIds()){return t.status==='pending'&&t.due_date<day()&&!!t.external_reference&&!blocked.has(t.id);}
function updateActions(){const button=root?.querySelector('[data-batch-action]');if(!button)return;const count=selection.size;button.textContent=count?'Conferir selecionados ('+count+')':'Conferir selecionados';button.disabled=busy||!count;}
async function continueSelection(){
 if(busy)return;
 const picked=drafts.filter(d=>selection.has(d.id)),pickedTitles=titles.filter(t=>selection.has('title:'+t.id));
 if(picked.length&&pickedTitles.length)throw Error('Selecione boletos novos ou itens da fila, uma operação por vez.');
 if(pickedTitles.length)return collectionDrafts(consolidated);
 if(!picked.length)throw Error('Selecione os itens que deseja conferir.');
 if(picked.every(d=>d.kind==='collection')&&picked.some(d=>d.status==='draft'))return reviewCollections(picked);
 return sendSelected();
}
async function collectionDrafts(consolidate){
 const selected=titles.filter(t=>selection.has('title:'+t.id));if(!selected.length)throw Error('Selecione os boletos.');
 const blocked=lockedTitleIds();if(selected.some(t=>!eligibleTitle(t,blocked)))throw Error('Há título pago, não vencido, sem documento ou já em conferência. Atualize a lista.');
 const groups=new Map();for(const t of selected){const key=consolidate?t.company:t.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 if([...groups.values()].some(group=>group.length>50))throw Error('Selecione até 50 boletos por empresa em cada mensagem.');
 const created=[];for(const group of groups.values()){const d={id:crypto.randomUUID(),owner:uid,kind:'collection',status:'draft',company:group[0].company,nf:group.map(t=>t.external_reference).join(', '),amount:Math.round(group.reduce((sum,t)=>sum+Number(t.amount),0)*100)/100,due_date:group[0].due_date,titles:group,files:[],to:'',cc:'',confirmed:false,created_at:new Date().toISOString()};applyModel(d,'collection');await save(d);created.push(d);}
 selection.clear();statusFilter='';page=1;draw();await reviewCollections(created);
}
async function reviewCollections(items){
 if(busy)return;if(items.some(d=>!['draft','prepared','failed'].includes(d.status)))throw Error('Há um envio bloqueado nesse grupo. Confira o histórico.');
 const list=items.map(item=>{const d=structuredClone(item);delete d.snapshot;delete d.local;return d;});
 const box=dialog('Conferir cobranças · '+list.length+' mensagem(ns)'),body=el('div',undefined,'hsn941-companies');box.append(body);
 const groups=new Map();for(const d of list){const recipientKey=JSON.stringify([d.company,Array.isArray(d.to)?d.to.join('; '):d.to||'',Array.isArray(d.cc)?d.cc.join('; '):d.cc||'']);if(!groups.has(recipientKey))groups.set(recipientKey,[]);groups.get(recipientKey).push(d);}
 const fields=[];let preparing=false,closingSaved=false,timer;
 for(const companyItems of groups.values()){const company=companyItems[0].company;
  const card=el('section',undefined,'hsn941-company');card.append(el('h3',company));
  const titleMap=new Map(companyItems.flatMap(d=>d.titles).map(t=>[t.id,t]));
  card.append(el('small',titleMap.size+' boleto(s) · '+companyItems.length+' e-mail(s) · '+money([...titleMap.values()].reduce((sum,t)=>sum+Number(t.amount),0))));
  // Differing saved destinations are never silently combined or overwritten.
  const savedTo=[...new Set(companyItems.map(d=>Array.isArray(d.to)?d.to.join('; '):d.to||''))],savedCC=[...new Set(companyItems.map(d=>Array.isArray(d.cc)?d.cc.join('; '):d.cc||''))];
  const to=suggestionInput(card,'Para · '+company,savedTo.length===1?savedTo[0]:'',()=>company),chips=el('div',undefined,'hsn941-chips');contactChips(chips,to,company);card.append(chips);
  const options=el('details',undefined,'hsn941-options');options.open=savedCC.length===1&&!!savedCC[0];options.append(el('summary','Cópia · opcional'));const cc=suggestionInput(options,'CC · '+company,savedCC.length===1?savedCC[0]:'',()=>company);card.append(options);
  const titlesList=el('div',undefined,'hsn941-titles-preview');for(const t of titleMap.values()){const row=el('div');row.append(el('strong',t.external_reference),el('span',t.due_date.split('-').reverse().join('/')),el('span',money(t.amount)));titlesList.append(row);}card.append(titlesList);
  const messageFields=[];for(const [index,d]of companyItems.entries()){const detail=el('details',undefined,'hsn941-options');detail.append(el('summary',companyItems.length>1?'Mensagem '+(index+1)+' · '+d.nf:'Mensagem pronta · revisar ou editar'));
   const subject=field(detail,'Assunto · '+company+' · '+(index+1),d.subject),content=field(detail,'Mensagem · '+company+' · '+(index+1),d.content,'textarea');messageFields.push({d,subject,content});card.append(detail);}
  fields.push({company,items:companyItems,to,cc,messageFields});body.append(card);
 }
 const label=el('label',undefined,'hsn94-check'),confirmed=el('input');confirmed.type='checkbox';label.append(confirmed,el('span','Conferi as empresas, os boletos, os valores e todos os destinatários.'));box.append(label);
 function sync(){for(const g of fields)for(const item of g.messageFields){const d=item.d;d.to=g.to.value;d.cc=g.cc.value;d.subject=item.subject.value;d.content=item.content.value;d.confirmed=confirmed.checked;}}
 async function persist(){sync();for(const d of list){if(!d.confirmed&&['prepared','failed'].includes(d.status)){d.status='draft';d.approval=null;}await save(d);}}
 body.addEventListener('input',()=>{confirmed.checked=false;for(const d of list){d.status='draft';d.approval=null;}clearTimeout(timer);timer=setTimeout(()=>persist().catch(e=>report(e.message)),250);});
 box.addEventListener('close',()=>{clearTimeout(timer);if(!closingSaved)persist().then(()=>draw()).catch(e=>report(e.message));});
 const footer=el('div',undefined,'hsn94-bar hsn941-dialog-actions'),saveDraft=btn('Guardar para depois',async()=>{clearTimeout(timer);await persist();closingSaved=true;box.close();draw();});
 const next=btn('Continuar para envio',async()=>{
  if(preparing||busy)return;clearTimeout(timer);sync();for(const d of list)validate(d);
  preparing=true;busy=true;const enabled=[...box.querySelectorAll('input,textarea,button,select')].filter(n=>!n.disabled);enabled.forEach(n=>n.disabled=true);let done=0,completed=false;
  try{for(const d of list){report('Preparando '+(done+1)+' de '+list.length+'…');await save(d);await prepare(d);done++;}completed=true;}
  catch(e){report(done+' preparado(s). Os rascunhos foram preservados. '+e.message);}
  finally{preparing=false;busy=false;enabled.forEach(n=>n.disabled=false);}
  if(completed){closingSaved=true;box.close();selection=new Set(list.map(d=>d.id));draw();await sendSelected();}
 });next.classList.add('hsn941-primary');footer.append(saveDraft,next);box.append(footer);
}

async function importContacts(){const picker=el('input');picker.type='file';picker.accept='.csv,text/csv';picker.onchange=async()=>{try{const f=picker.files[0];if(!f||f.size>3*1024*1024)throw Error('Selecione um CSV de até 3 MB.');const rows=HSN_FATURAMENTO.parseCSV(await f.text());if(rows.length<2)throw Error('CSV sem contatos.');const heads=rows[0].map(clean),emailCols=heads.map((h,i)=>/e-?mail|correio/.test(h)?i:-1).filter(i=>i>=0),companyCol=heads.findIndex(h=>/company|empresa|organizacao/.test(h)),nameCols=heads.map((h,i)=>/name|nome/.test(h)&&i!==companyCol?i:-1).filter(i=>i>=0);if(!emailCols.length)throw Error('Não identifiquei colunas de e-mail. Confira o CSV do Zoho.');const imported=new Map();for(const row of rows.slice(1,5001)){const name=nameCols.map(i=>row[i]||'').join(' ').trim().slice(0,160),company=companyCol<0?'':String(row[companyCol]||'').trim();for(const col of emailCols)for(const address of emails(row[col])){if(!valid(address))continue;const email=address.toLowerCase();let r=imported.get(email);if(!r){const old=contacts.find(x=>x.email.toLowerCase()===email);r={owner_id:uid,email,display_name:old?.display_name||name,companies:[...old?.companies||[]]};imported.set(email,r);}if(company&&!r.companies.includes(company))r.companies.push(company);}}if(!imported.size)throw Error('Nenhum e-mail válido.');
 if(!confirm('Importar '+imported.size+' e-mail(s), preservando nomes e associações anteriores? Nenhuma mensagem será enviada.'))return;
 const data=[...imported.values()];for(let i=0;i<data.length;i+=100){const result=await client().from('hsn_send_contacts').upsert(data.slice(i,i+100),{onConflict:'owner_id,email'});if(result.error)throw result.error;}await load(true);draw();report(imported.size+' contato(s) importado(s) com nomes e empresas. Nenhum destinatário foi selecionado automaticamente.');
 }catch(e){report('Importação: '+e.message);}};picker.click();}

async function importDocuments(){const picker=el('input');picker.type='file';picker.accept='.xml,.pdf,.png,.jpg,.jpeg';picker.multiple=true;
 picker.onchange=async()=>{try{const all=[...picker.files];if(all.length>60||all.reduce((s,f)=>s+f.size,0)>150*1024*1024)throw Error('Importe até 60 arquivos ou 150 MB por operação.');
 const groups=new Map();for(const file of all){if(!file.size||file.size>10485760||! /\.(pdf|xml|png|jpe?g)$/i.test(file.name))throw Error('Arquivo inválido: '+file.name);
 let metadata={};try{if(file.name.toLowerCase().endsWith('.xml'))metadata=await readFile(file);}catch{}
 const key=metadata.company&&metadata.nf?clean(metadata.company)+'|'+metadata.nf:crypto.randomUUID();let d=groups.get(key);
 if(!d||d.files.length>=3){d={id:crypto.randomUUID(),owner:uid,kind:'billing',status:'draft',company:metadata.company||'',nf:metadata.nf||'',amount:metadata.amount?Number(metadata.amount):null,due_date:metadata.due_date||'',files:[],to:'',cc:'',confirmed:false,created_at:new Date().toISOString()};groups.set(key+(d.files.length>=3?d.id:''),d);}
 d.files.push(file);applyModel(d,'billing');await save(d);
 }statusFilter='draft';page=1;draw();report('Documentos guardados em rascunhos. Sem empresa/NF inequívocas, cada arquivo fica separado. Abra as linhas para conferir e agrupar anexos da mesma empresa.');
 }catch(e){report(e.message+' Os rascunhos já guardados foram preservados.');}};picker.click();}

async function copyRow(r){if(r.kind!=='billing')throw Error('Cobranças devem ser preparadas a partir dos títulos ainda pendentes.');const d=structuredClone(r.local?r:r.snapshot);d.id=crypto.randomUUID();d.owner=uid;d.kind='billing';d.status='draft';d.created_at=new Date().toISOString();d.to=Array.isArray(d.to)?d.to.join('; '):d.to;d.cc=Array.isArray(d.cc)?d.cc.join('; '):d.cc||'';d.confirmed=false;d.remoteId=null;d.approval=null;
 if(r.status==='sent'){const reason=prompt('Motivo da segunda via (mínimo 10 caracteres):');if(!reason||reason.trim().length<10)return;d.resend_of=r.legacy?'legacy:'+r.id:r.remoteId||r.id;d.resend_reason=reason;}
 // Reuse private attachments only via authenticated, short-lived URLs.
 if(!r.local&&r.snapshot.files?.length&&!r.legacy){d.files=[];for(let i=0;i<r.snapshot.files.length;i++){const f=r.snapshot.files[i],url=await invoke({action:'attachment',id:r.id,index:i}),res=await fetch(url.url);if(!res.ok)throw Error('Não foi possível recuperar anexo.');d.files.push(new File([await res.blob()],f.name,{type:f.type}));}}
 if(r.legacy){d.files=[];report('Histórico anterior contém nomes dos anexos. Selecione os arquivos originais novamente.');}
 await save(d);await editor(d);
}
const civilDate=v=>v?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'';
function histories(){const list=allRows();return list.filter(r=>(mode==='all'||r.kind===mode)&&(!statusFilter||r.status===statusFilter)&&(!search||clean([r.snapshot.company,r.snapshot.nf,r.snapshot.subject,...(r.snapshot.titles||[]).map(t=>t.external_reference),...(Array.isArray(r.snapshot.cc)?r.snapshot.cc:emails(r.snapshot.cc)),...(Array.isArray(r.snapshot.to)?r.snapshot.to:emails(r.snapshot.to))].join(' ')).includes(clean(search)))&&(panel==='work'||!fromDate||civilDate(r.sent_at||r.created_at)>=fromDate)&&(panel==='work'||!toDate||civilDate(r.sent_at||r.created_at)<=toDate)).sort((a,b)=>String(b.sent_at||b.created_at).localeCompare(String(a.sent_at||a.created_at)));}
async function importTitles(){
 const pick=el('input');pick.type='file';pick.accept='.csv,text/csv';pick.onchange=async()=>{try{
  const file=pick.files[0];if(!file||file.size>3*1024*1024)throw Error('Escolha um CSV Sicoob de até 3 MB.');
  const parsed=HSN_SICOOB.parseCsv(HSN_FATURAMENTO.parseCSV(await file.text()));if(!parsed.length)throw Error('Nenhum título válido foi identificado.');
  const key=t=>t.reference+'|'+t.due_date,existing=new Map(titles.map(t=>[key(t),t]));
  for(const row of parsed){const previous=existing.get(key(row));if(previous&&(clean(previous.company)!==clean(row.company)||Number(previous.amount)!==Number(row.amount)))throw Error('Empresa ou valor diferente no título '+row.reference+'. Confira o relatório antes de importar.');}
  const fresh=parsed.filter(t=>!existing.has(key(t))),paid=parsed.filter(t=>t.reported_paid),changed=parsed.filter(t=>existing.has(key(t))&&t.external_reference&&t.external_reference!==existing.get(key(t)).external_reference);
  const box=dialog('Conferir importação Sicoob');box.append(el('p',parsed.length+' título(s) válido(s) · '+fresh.length+' novo(s) · '+paid.length+' identificado(s) como pago(s).'),el('p','A importação não envia cobranças. Pagamentos informados no relatório serão aplicados após sua confirmação; os demais estados e valores existentes serão preservados.'));
  const preview=el('div',undefined,'hsn941-titles-preview');for(const t of parsed.slice(0,10))preview.append(el('p',t.company+' · '+t.external_reference+' · '+money(t.amount)+(t.reported_paid?' · Pago':'')));box.append(preview);
  const action=btn('Confirmar importação',async()=>{
   if(busy)return;busy=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{if(fresh.length){const data=fresh.map(({reported_paid,...t})=>({...t,owner_id:uid,status:reported_paid?'paid':'pending'}));for(let i=0;i<data.length;i+=100){const result=await client().from('sicoob_collections').upsert(data.slice(i,i+100),{onConflict:'owner_id,reference,due_date',ignoreDuplicates:true});if(result.error)throw result.error;}}
    for(const t of changed){const result=await client().from('sicoob_collections').update({external_reference:t.external_reference}).eq('owner_id',uid).eq('reference',t.reference).eq('due_date',t.due_date);if(result.error)throw result.error;}
    for(const t of paid){const result=await client().from('sicoob_collections').update({status:'paid'}).eq('owner_id',uid).eq('reference',t.reference).eq('due_date',t.due_date);if(result.error)throw result.error;}
    await load(true);selection.clear();busy=false;box.close();draw();report('Relatório importado. Selecione os boletos vencidos para conferir as cobranças.');
   }catch(e){report('Importação interrompida: '+e.message+'. Confira a atualização antes de continuar.');}
   finally{busy=false;box.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });action.classList.add('hsn941-primary');box.append(action);
 }catch(e){report(e.message);}};pick.click();
}
function rowUI(parent,r){
 const s=r.snapshot,line=el('details',undefined,'hsn94-line'),summary=el('summary'),check=el('input');
 check.type='checkbox';check.setAttribute('aria-label','Selecionar '+s.company);check.checked=selection.has(r.id);
 check.disabled=busy||!r.local||!['prepared','failed',...(r.kind==='collection'?['draft']:[])].includes(r.status);
 check.onclick=e=>e.stopPropagation();check.onchange=()=>{check.checked?selection.add(r.id):selection.delete(r.id);updateActions();};
 summary.append(check,el('strong',s.company||'Faturamento avulso'),el('span',r.kind==='billing'?'Faturamento':'Sicoob'),el('span',s.nf||s.titles?.map(t=>t.external_reference).join(', ')||'—'),el('span',money(s.amount)),el('small',date(r.sent_at||r.created_at)),el('span',labels[r.status]||r.status,'hsn94-state '+r.status));
 if(r.local&&['draft','prepared','failed'].includes(r.status)){const edit=btn('Conferir',()=>editor(r));edit.onclick=e=>{e.preventDefault();e.stopPropagation();if(!busy)editor(r).catch(e=>report(e.message));};edit.classList.add('hsn941-row-action');summary.append(edit);}
 line.append(summary);const body=el('div',undefined,'hsn94-detail');
 body.append(el('p','Para: '+(Array.isArray(s.to)?s.to.join('; '):s.to||'—')+' · CC: '+(Array.isArray(s.cc)?s.cc.join('; '):s.cc||'—')),el('strong',s.subject||'—'),el('pre',s.content||'Mensagem não armazenada no histórico anterior.'),el('p','Documentos: '+(s.files?.map(f=>f.name).join(' · ')||s.titles?.map(t=>t.external_reference).join(' · ')||'—')));
 if(r.error||r.error_detail)body.append(el('p',r.error||r.error_detail,'hsn94-error'));
 if(r.kind==='billing'&&!['processing','review'].includes(r.status))body.append(btn(r.status==='sent'?'Preparar segunda via':'Copiar para novo envio',()=>copyRow(r)));
 if(!r.local&&!r.legacy&&s.files?.length)for(const [index,f]of s.files.entries())body.append(btn('Baixar '+f.name,async()=>{const result=await invoke({action:'attachment',id:r.id,index});const a=el('a');a.href=result.url;a.target='_blank';a.rel='noopener';a.click();}));
 line.append(body);parent.append(line);
}
function draw(){
 if(!root||!root.isConnected)return;root.replaceChildren();
 const head=el('div',undefined,'hsn94-bar hsn941-header');
 const primary=mode==='collection'?btn('Importar relatório Sicoob',importTitles):btn('Novo faturamento',()=>editor());primary.classList.add('hsn941-primary');head.append(primary,btn('Atualizar',async()=>{if(busy)return;await load(true);draw();}));
 const more=el('details',undefined,'hsn941-more');more.append(el('summary','Mais opções'));const menu=el('div');menu.append(btn('Modelos de e-mail',templatesUI),btn('Importar contatos Zoho CSV',importContacts));if(mode!=='collection')menu.append(btn('Importar lote de documentos',importDocuments));
 menu.append(btn('Cadastros e importações anteriores',()=>{if(busy)return;if(mode==='collection'){view='sicoob_collections';HSN_SICOOB.load();}else{view='billing_send';HSN_FATURAMENTO.show();}}));if(mode==='all')menu.append(btn('Vínculos e acompanhamentos',()=>HSN_COMMUNICATIONS.load()));more.append(menu);head.append(more);root.append(head);
 msg=el('p',mode==='collection'?'Selecione os boletos, confira os destinatários e autorize o envio.':'Adicione os documentos, confira os destinatários e autorize o envio.','hsn94-message');root.append(msg);
 if(issues.length){const errors=el('details',undefined,'hsn94-error');errors.open=true;errors.append(el('summary','Há dados indisponíveis. Os totais podem estar incompletos.'),el('pre',issues.join('\n')));root.append(errors);}
 const data=allRows().filter(r=>mode==='all'||r.kind===mode),pending=titles.filter(t=>t.status==='pending'&&t.due_date<day()),kpis=el('div',undefined,'hsn94-kpis');
 const stats=[['A conferir',data.filter(r=>r.status==='draft').length],['Prontos',data.filter(r=>r.status==='prepared').length],['Enviados',data.filter(r=>r.status==='sent').length],['Falhas',data.filter(r=>r.status==='failed'||r.status==='review').length],[mode==='billing'?'Em preparação':'Boletos vencidos',mode==='billing'?data.filter(r=>['draft','prepared','failed'].includes(r.status)).length:pending.length],[mode==='billing'?'Valor em preparação':'Valor vencido',mode==='billing'?money(data.filter(r=>['draft','prepared','failed'].includes(r.status)).reduce((sum,r)=>sum+Number(r.snapshot.amount||0),0)):money(pending.reduce((sum,t)=>sum+Number(t.amount),0))]];
 for(const [label,value]of stats){const card=el('article');card.append(el('small',label),el('strong',String(value)));kpis.append(card);}root.append(kpis);
 const tabs=el('div',undefined,'hsn94-bar hsn941-tabs');for(const [value,label]of [['work','A fazer'],['history','Histórico']]){const b=btn(label,()=>{panel=value;page=1;selection.clear();statusFilter='';draw();});b.setAttribute('aria-pressed',String(panel===value));tabs.append(b);}
 if(mode==='all')for(const [value,label]of [['billing','Faturamentos'],['collection','Sicoob']])tabs.append(btn(label,()=>show(value)));root.append(tabs);
 const filters=el('div',undefined,'hsn94-filters hsn941-filters'),q=field(filters,'Pesquisar empresa, documento ou destinatário',search,'search');q.placeholder='Empresa, NF, boleto ou e-mail';
 q.oninput=()=>{const position=q.selectionStart;search=q.value;page=titlePage=1;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{draw();const next=root.querySelector('input[type=search]');next?.focus({preventScroll:true});next?.setSelectionRange(position,position);},180);};
 const status=el('select');status.setAttribute('aria-label','Situação');status.append(new Option('Todas as situações',''));for(const [value,label]of Object.entries(labels))if(!['paid','pending'].includes(value)&&(panel==='history'||value!=='sent'))status.append(new Option(label,value));status.value=statusFilter;status.onchange=()=>{statusFilter=status.value;page=1;draw();};filters.append(status);
 if(panel==='history'){const period=el('details',undefined,'hsn941-period');period.open=!!fromDate||!!toDate;period.append(el('summary','Filtrar período'));const dates=el('div',undefined,'hsn94-bar'),a=field(dates,'De',fromDate,'date'),b=field(dates,'Até',toDate,'date');a.onchange=()=>{fromDate=a.value;page=1;draw();};b.onchange=()=>{toDate=b.value;page=1;draw();};period.append(dates);filters.append(period);}root.append(filters);
 if(panel==='work'){
  const actions=el('div',undefined,'hsn94-bar hsn941-selection'),send=btn('Conferir selecionados',continueSelection);send.dataset.batchAction='true';send.classList.add('hsn941-primary');actions.append(send,btn('Limpar seleção',()=>{selection.clear();draw();}));root.append(actions);
  if(mode!=='billing')pendingUI();
 }
 const list=histories().filter(r=>panel==='work'?r.status!=='sent':r.status!=='draft');
 page=Math.min(page,Math.max(1,Math.ceil(list.length/10)));
 const title=el('div',undefined,'hsn94-bar hsn941-list-heading');title.append(el('h3',panel==='work'?'Fila de envios':'Envios e resultados'),el('small',list.length+' registro(s)'));root.append(title);
 const scroll=el('div',undefined,'hsn94-scroll');scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Histórico de envios');for(const r of list.slice((page-1)*10,page*10))rowUI(scroll,r);
 if(!list.length)scroll.append(el('p',panel==='work'?'Nenhum envio aguardando preparo.':'Nenhum registro corresponde aos filtros.','hsn941-empty'));root.append(scroll);
 if(list.length>10){const pagination=el('div',undefined,'hsn94-bar hsn941-paging'),previous=btn('Anterior',()=>{page--;draw();}),next=btn('Próxima',()=>{page++;draw();});previous.disabled=page===1;next.disabled=page*10>=list.length;pagination.append(previous,el('small','Página '+page+'/'+Math.ceil(list.length/10)),next);root.append(pagination);}
 updateActions();
}

function pendingUI(){
 const section=el('section',undefined,'hsn94-pending hsn941-pending'),head=el('div',undefined,'hsn94-bar');head.append(el('h3','Boletos para cobrar'));
 const controls=el('div',undefined,'hsn94-bar');
 const all=btn('Selecionar vencidos',()=>{const blocked=lockedTitleIds();for(const t of titles)if(eligibleTitle(t,blocked)&&(!search||clean(t.company+' '+t.external_reference).includes(clean(search))))selection.add('title:'+t.id);renderRows();updateActions();});
 const method=el('select');method.setAttribute('aria-label','Como agrupar as cobranças');method.append(new Option('Uma mensagem por empresa','company'),new Option('Uma mensagem por boleto','title'));method.value=consolidated?'company':'title';method.onchange=()=>consolidated=method.value==='company';
 const filter=el('select');filter.setAttribute('aria-label','Filtrar boletos');filter.append(new Option('Vencidos disponíveis','ready'),new Option('Todos pendentes','all'));filter.value=showOtherTitles?'all':'ready';filter.onchange=()=>{showOtherTitles=filter.value==='all';titlePage=1;renderRows();};controls.append(all,filter,method);head.append(controls);section.append(head);
 const scroll=el('div',undefined,'hsn94-scroll'),footer=el('div',undefined,'hsn94-bar hsn941-paging');section.append(scroll,footer);root.append(section);
 function renderRows(){
  scroll.replaceChildren();footer.replaceChildren();
  const blocked=lockedTitleIds(),visible=titles.filter(t=>t.status==='pending'&&(showOtherTitles||eligibleTitle(t,blocked))&&(!search||clean(t.company+' '+t.external_reference).includes(clean(search)))).sort((a,b)=>a.company.localeCompare(b.company,'pt-BR')||a.due_date.localeCompare(b.due_date));
  titlePage=Math.min(titlePage,Math.max(1,Math.ceil(visible.length/20)));
  const table=el('div',undefined,'hsn941-title-table');const columns=el('div',undefined,'hsn941-title-row hsn941-title-head');for(const text of ['','Empresa','Documento','Vencimento','Valor','Situação'])columns.append(el('span',text));table.append(columns);
  for(const t of visible.slice((titlePage-1)*20,titlePage*20)){const label=el('label',undefined,'hsn941-title-row'),c=el('input');c.type='checkbox';c.setAttribute('aria-label','Selecionar boleto '+t.external_reference+' · '+t.company);c.checked=selection.has('title:'+t.id);c.disabled=busy||t.due_date>=day()||!t.external_reference||blocked.has(t.id);
   c.onchange=()=>{c.checked?selection.add('title:'+t.id):selection.delete('title:'+t.id);updateActions();};
   const state=blocked.has(t.id)?'Na fila / já cobrado':!t.external_reference?'Sem documento':t.due_date>=day()?'Ainda não vencido':'Vencido';
   label.append(c,el('strong',t.company),el('span',t.external_reference||'—'),el('span',t.due_date.split('-').reverse().join('/')),el('span',money(t.amount)),el('small',state));table.append(label);}
  if(!visible.length)table.append(el('p','Nenhum boleto pendente para esta pesquisa.'));scroll.append(table);
  const previous=btn('Anteriores',()=>{titlePage--;renderRows();}),next=btn('Próximos',()=>{titlePage++;renderRows();});previous.disabled=titlePage===1;next.disabled=titlePage*20>=visible.length;
  footer.append(previous,el('small',visible.length+' boleto(s) · página '+titlePage+'/'+Math.max(1,Math.ceil(visible.length/20))),next);
 }
 renderRows();
}

async function templatesUI(){const box=dialog('Modelos reutilizáveis'),select=el('select');select.setAttribute('aria-label','Modelo para personalizar');for(const t of defaults)select.append(new Option(t[1],t[0]));box.append(select);const title=field(box,'Título',model(select.value).title),subject=field(box,'Assunto com variáveis',model(select.value).subject),body=field(box,'Texto com variáveis',model(select.value).body,'textarea');select.onchange=()=>{const t=model(select.value);title.value=t.title;subject.value=t.subject;body.value=t.body;};box.append(el('p','Variáveis: {{empresa}}, {{documento}}, {{valor}}, {{vencimento}}, {{titulos}}. A assinatura institucional será acrescentada pelo servidor.'),btn('Salvar modelo',async()=>{if(!title.value.trim()||subject.value.length<2||body.value.length<5)throw Error('Preencha título, assunto e texto.');const row={owner_id:uid,code:select.value,title:title.value,subject:subject.value,body:body.value};const r=await client().from('hsn_send_templates').upsert(row,{onConflict:'owner_id,code'});if(r.error)throw r.error;models=models.filter(t=>t.code!==row.code).concat(row);box.close();}));}
async function show(nextMode='all'){if(!user)return;const previousUid=uid;uid=user.id;if(previousUid&&previousUid!==uid){contacts=[];drafts=[];remote=[];titles=[];rows=[];loadedAt=0;selection.clear();}if(mode!==nextMode){selection.clear();statusFilter='';search='';page=titlePage=1;panel='work';}mode=nextMode;const navView=mode==='billing'?'billing_send':mode==='collection'?'sicoob_collections':'communications';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===navView));for(const id of ['summary','finance-controls','calendar-board','commission-calendar-summary','records'])$(id)?.replaceChildren();$('new').hidden=true;$('search')?.closest('.search-wrap')?.setAttribute('hidden','');$('view-title').textContent=mode==='billing'?'Envio de faturamento':mode==='collection'?'Cobranças Sicoob':'Central de envios';$('view-description').textContent='Prepare, confira e acompanhe cada operação.';root=el('section',undefined,'hsn94-root');$('records').append(root);msg=el('p','Carregando dados…');root.append(msg);try{await load();draw();}catch(e){report(e.message);}}
function reset(){clearTimeout(searchTimer);panel='work';generation++;loading=null;uid='';ownerCache='';contacts=[];drafts=[];remote=[];rows=[];titles=[];models=[];cap=null;loadedAt=0;selection.clear();document.querySelectorAll('.hsn94-dialog').forEach(x=>x.remove());}
return {show,reset,validate,mergeContacts,variables,defaults};
})();
