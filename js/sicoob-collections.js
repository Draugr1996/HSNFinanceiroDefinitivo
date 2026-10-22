/* Cobranças Sicoob: conferência humana obrigatória. Sem credenciais Zoho no navegador. */
window.HSN_SICOOB=(()=>{'use strict';
let items=[], contacts=[], dispatches=[], historyError="", ready=false, busy=false, selected=new Set(), activeTab="pending";
const $=id=>document.getElementById(id), node=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
const button=(txt,fn)=>{const b=node('button',txt,'secondary');b.type='button';b.onclick=fn;return b;};
const fmt=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const iso=s=>{s=String(s||'').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [d,m,y]=s.split('/');return `${y}-${m}-${d}`;}return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';};
const money=s=>Number(String(s||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));
function csv(text){const rows=[];let row=[],field='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;}
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function parse(rows){
 const parsed=[];let cols=null;
 for(const r of rows){
  const heads=r.map(clean);
  if(heads.some(v=>v==='sacado')&&heads.some(v=>v.includes('vencimento'))){
   const ix=s=>heads.findIndex(v=>v.includes(s));
   cols={name:ix('sacado'),our:ix('nosso numero'),your:heads.findIndex(v=>v.includes('numero do documento')||v.includes('numero documento')||v.includes('seu numero')),due:ix('vencimento'),amount:ix('valor')};
   if([cols.name,cols.our,cols.due,cols.amount].some(v=>v<0))throw Error('Cabeçalho incompleto.');
   continue;
  }
  if(!cols)continue;
  const company=String(r[cols.name]||'').trim(),reference=String(r[cols.our]||'').trim(),date=iso(r[cols.due]),value=money(r[cols.amount]);
  if(!company||!reference||!date||!Number.isFinite(value)||value<=0)continue;
  parsed.push({company,reference,external_reference:cols.your>=0?String(r[cols.your]||'').trim():'',due_date:date,amount:value});
 }
 if(!cols)throw Error('Cabeçalho Sicoob não encontrado.');
 return [...new Map(parsed.map(x=>[x.reference+'|'+x.due_date,x])).values()];
}
function check(x){if(x.error)throw x.error;return x.data;}
async function fetchData(){
 const [a,b,h]=await Promise.all([
  db.from('sicoob_collections').select('*').order('due_date',{ascending:true}),
  db.from('sicoob_contacts').select('*'),
  db.from('sicoob_collection_dispatches').select('id,collection_id,owner_id,status,recipient_email,sent_at,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(1000)
 ]);
 items=check(a)||[];contacts=check(b)||[];
 if(h.error){dispatches=[];historyError='Não foi possível consultar o histórico: '+h.error.message;}
 else{dispatches=h.data||[];historyError='';}
 ready=true;
}
async function load(){if(!user)return;try{await fetchData();render();}catch(e){ready=false;render();$('records').prepend(node('p','Não foi possível carregar as cobranças. Verifique as tabelas do Supabase. '+e.message,'hint'));}}
function contact(company){return contacts.find(c=>clean(c.company)===clean(company));}
const docNumber=r=>String(r.external_reference||'').trim();
const emailsFor=c=>String(c?.email||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
const validEmail=x=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(x);
function message(r){return `Prezados, bom dia!\n\nIdentificamos em nosso controle financeiro uma pendência referente ao boleto abaixo:\n\nEmpresa: ${r.company}\nNúmero do Documento: ${docNumber(r)||'[NÃO INFORMADO]'}\nVencimento: ${r.due_date.split('-').reverse().join('/')}\nValor original: ${fmt(r.amount)}\n\nSolicitamos, por gentileza, a verificação da pendência e, caso o pagamento já tenha sido realizado, o envio do respectivo comprovante para atualização de nossos registros.\n\nPermanecemos à disposição para quaisquer esclarecimentos.\n\nAtenciosamente,\nVanderson Santos\nSupervisor Administrativo Financeiro\nHotel Serra Negra\nfaturamento@hotelserranegra.com.br`;}
const eligible=r=>r.status==='pending'&&emailsFor(contact(r.company)).length>0&&!!docNumber(r)&&r.due_date<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
async function saveContact(company,primary,cc){const all=[primary.trim(),...cc.split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean)];if(!all[0]||all.some(x=>!validEmail(x)))throw Error('Confira os endereços de e-mail em Para e CC.');if(new Set(all.map(x=>x.toLowerCase())).size!==all.length)throw Error('Há e-mails repetidos entre Para e CC.');check(await db.from('sicoob_contacts').upsert({owner_id:user.id,company,email:all.join('; ')},{onConflict:'owner_id,company'}));await fetchData();render();}
async function importCsv(file){if(!file)return;try{const text=await file.text();const parsed=parse(csv(text.replace(/^\uFEFF/,'')));if(!parsed.length)throw Error('Nenhum boleto reconhecido.');const ok=confirm(`Foram encontrados ${parsed.length} títulos, totalizando ${fmt(parsed.reduce((s,r)=>s+r.amount,0))}.\n\nImportar e atualizar títulos existentes? Os status atuais serão preservados.`);if(!ok)return;const existing=new Set(items.map(x=>x.reference+'|'+x.due_date));const fresh=parsed.filter(x=>!existing.has(x.reference+'|'+x.due_date));const updates=parsed.filter(x=>existing.has(x.reference+'|'+x.due_date)&&x.external_reference&&x.external_reference!==items.find(y=>y.reference===x.reference&&y.due_date===x.due_date)?.external_reference);if(updates.length){for(const x of updates){const old=items.find(y=>y.reference===x.reference&&y.due_date===x.due_date);check(await db.from('sicoob_collections').update({external_reference:x.external_reference}).eq('id',old.id));}}if(fresh.length)check(await db.from('sicoob_collections').upsert(fresh.map(x=>({...x,owner_id:user.id,status:'pending'})),{onConflict:'owner_id,reference,due_date'}));await fetchData();render();alert(`${fresh.length} títulos novos importados. ${parsed.length-fresh.length} já cadastrados; ${updates.length} número(s) de documento atualizado(s), sem alterar a situação dos boletos.`);}catch(e){alert('Falha na importação: '+e.message);}}
async function setStatus(r,status){if(!confirm(`Alterar ${r.company} / ${r.reference} para ${status==='paid'?'pago':'pendente'}? Confira a situação no Sicoob.`))return;try{check(await db.from('sicoob_collections').update({status}).eq('id',r.id));await fetchData();render();}catch(e){alert(e.message);}}
async function prepareIndividual(r){
 if(busy)return;
 busy=true;
 try{
  if(!eligible(r)){alert('Este boleto não está elegível. Confira vencimento, situação, Número do Documento e destinatários salvos.');return;}
  // A conferência é feita no servidor; dados locais não autorizam envios.
  const {data,error}=await db.functions.invoke('zoho-send-mail',{
   body:{mode:'preview',collection_id:r.id}
  });
  if(error){
   let detail='';
   try{detail=(await error.context?.json())?.error||'';}catch(_e){}
   throw Error(detail||error.message||'Falha na conferência do Supabase.');
  }
  if(!data?.success||data.mode!=='preview'||data.sending_enabled!==false){
   throw Error(data?.error||'Resposta inesperada. Operação bloqueada.');
  }
  const preview=`EMPRESA: ${data.company}\nDOCUMENTO: ${data.document_number}\nVENCIMENTO: ${String(data.due_date).split('-').reverse().join('/')}\nVALOR: ${fmt(data.amount)}\nPARA: ${data.to}\nCC: ${(data.cc||[]).join('; ')||'(nenhum)'}\n\nASSUNTO: ${data.subject}\n\n${data.content}`;
   if(!data.approval_token)throw Error('Supabase não retornou autorização de envio.');
   if(!confirm('PRIMEIRA CONFERÊNCIA — dados validados pelo Supabase:\n\n'+preview+'\n\nProsseguir para a confirmação final?'))return;
   if(!confirm('SEGUNDA CONFIRMAÇÃO — ENVIO REAL\n\nO Zoho enviará AGORA esta cobrança para '+data.to+(data.cc?.length?' (CC: '+data.cc.join('; ')+')':'')+'.\n\nVocê verificou a pendência no Sicoob, o número do documento e TODOS os destinatários?\n\nClique OK somente se autorizar o envio real.'))return;
   const {data:result,error:sendError}=await db.functions.invoke('zoho-send-mail',{
     body:{mode:'send_individual',collection_id:r.id,approval_token:data.approval_token}
   });
   if(sendError){let detail='';try{detail=(await sendError.context?.json())?.error||'';}catch(_e){}throw Error(detail||'Resultado incerto. Não tente reenviar sem verificar o Zoho e o histórico.');}
   if(!result?.success)throw Error(result?.error||'Envio não confirmado. Não reenvie sem conferência.');
   await fetchData();render();
   alert(result.warning||'Cobrança enviada pelo Zoho e registrada no histórico.');
 }catch(e){alert('Não foi possível concluir a conferência: '+(e?.message||String(e)));}
 finally{busy=false;}
}
async function sendBatch(){alert('Envio em lote bloqueado nesta etapa. Vamos validar primeiro o envio individual.');}

function historyDate(value){
 if(!value)return '—';
 const d=new Date(value);
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function installHistoryStyle(){
 if(document.getElementById('hsn-sicoob-history-css'))return;
 const style=node('style');style.id='hsn-sicoob-history-css';
 style.textContent=`
 .sicoob-history{margin-top:0;padding:16px;border:1px solid rgba(148,163,184,.24);border-radius:16px;background:rgba(20,36,58,.38)}
 .sicoob-history-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
 .sicoob-history-head h2{margin:0;font-size:1.05rem}
 .sicoob-history-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
 .sicoob-history-tools input,.sicoob-history-tools select{min-height:35px;border:1px solid rgba(148,163,184,.32);border-radius:9px;padding:7px 10px;background:var(--surface,#13243a);color:inherit;max-width:100%}
 .sicoob-history-tools input{width:245px}
 .sicoob-history-scroll{overflow-x:auto;width:100%}
 .sicoob-history-table{width:100%;border-collapse:collapse;min-width:780px;font-size:.84rem}
 .sicoob-history-table th{text-align:left;font-weight:600;opacity:.8;padding:10px 9px;border-bottom:1px solid rgba(148,163,184,.25);white-space:nowrap}
 .sicoob-history-table td{padding:11px 9px;border-bottom:1px solid rgba(148,163,184,.14);vertical-align:top}
 .sicoob-history-table td small{display:block;opacity:.72;margin-top:3px}
 .sicoob-history-state{display:inline-block;border-radius:30px;padding:4px 9px;font-weight:700;font-size:.77rem;background:rgba(148,163,184,.15)}
 .sicoob-history-state.sent{color:#42d9aa;background:rgba(16,185,129,.12)}
 .sicoob-history-state.processing{color:#facc15;background:rgba(234,179,8,.12)}
 .sicoob-history-state.failed{color:#fb9292;background:rgba(239,68,68,.12)}
 .sicoob-history-info{font-size:.8rem;opacity:.75;margin:8px 0 0}
 .sicoob-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 12px}
 .sicoob-tab{border:1px solid rgba(148,163,184,.28);background:rgba(148,163,184,.07);border-radius:11px;padding:10px 15px;color:inherit;font-weight:650;cursor:pointer}
 .sicoob-tab.active{border-color:#f97316;background:rgba(249,115,22,.15);color:#fdba74}
 .sicoob-tab:focus-visible{outline:2px solid #fdba74;outline-offset:2px}
 .sicoob-history{border-color:rgba(249,115,22,.42);background:rgba(20,36,58,.58)}
 @media(max-width:650px){.sicoob-history-tools{width:100%}.sicoob-history-tools input{width:100%}.sicoob-tab{flex:1}}
 `;
 document.head.append(style);
}
function renderHistory(parent){
 installHistoryStyle();
 const section=node('section',undefined,'sicoob-history');
 const header=node('div',undefined,'sicoob-history-head');
 const heading=node('h2','Histórico de cobranças Sicoob');
 const controls=node('div',undefined,'sicoob-history-tools');
 const search=node('input');search.type='search';search.placeholder='Buscar empresa, documento ou e-mail';search.setAttribute('aria-label','Pesquisar histórico de cobranças');
 const filter=node('select');filter.setAttribute('aria-label','Filtrar situação do envio');
 for(const [value,label] of [['','Todas as situações'],['sent','Enviadas'],['processing','Em processamento'],['failed','Falhas / verificar']]){
  const opt=node('option',label);opt.value=value;filter.append(opt);
 }
 const refresh=button('Atualizar histórico',async()=>{
  if(busy)return;
  refresh.disabled=true;
  try{await fetchData();render();}catch(e){alert('Falha ao atualizar histórico: '+(e?.message||e));}
  finally{refresh.disabled=false;}
 });
 controls.append(search,filter,refresh);header.append(heading,controls);section.append(header);
 const count=node('p',undefined,'sicoob-history-info');
 const scroll=node('div',undefined,'sicoob-history-scroll');
 section.append(count,scroll);
 if(historyError){section.append(node('p',historyError,'sicoob-notice'));}
 const rows=dispatches.map(d=>({...d,collection:items.find(r=>r.id===d.collection_id)}));
 function draw(){
  const q=clean(search.value),status=filter.value;
  const filtered=rows.filter(d=>(!status||d.status===status)&&clean([
   d.collection?.company,d.collection?.external_reference,d.collection?.reference,d.recipient_email
  ].join(' ')).includes(q));
  count.textContent=`${filtered.length} registro(s) encontrado(s) · ${rows.filter(d=>d.status==='sent').length} enviado(s) · ${rows.filter(d=>d.status==='processing').length} em processamento · ${rows.filter(d=>d.status==='failed').length} com falha`;
  scroll.replaceChildren();
  if(!filtered.length){scroll.append(node('p',historyError?'Histórico indisponível.':'Nenhum registro encontrado.','sicoob-history-info'));return;}
  const table=node('table',undefined,'sicoob-history-table');
  const thead=node('thead'),tr=node('tr');
  for(const h of ['Empresa / Documento','Vencimento','Valor','Destinatário principal','Situação','Data / horário'])tr.append(node('th',h));
  thead.append(tr);table.append(thead);
  const tbody=node('tbody');
  for(const d of filtered){
   const r=d.collection,entry=node('tr');
   const company=node('td');company.append(node('strong',r?.company||'Boleto não localizado'),node('small','Documento: '+(r?.external_reference||'—')));
   entry.append(company,node('td',r?.due_date?String(r.due_date).split('-').reverse().join('/'):'—'),node('td',r?fmt(r.amount):'—'),node('td',d.recipient_email||'—'));
   const st=node('td');const label=d.status==='sent'?'Enviado':d.status==='processing'?'Em processamento':d.status==='failed'?'Falha — verificar':d.status;
   st.append(node('span',label,'sicoob-history-state '+d.status));entry.append(st);
   const when=node('td');when.append(node('span',historyDate(d.sent_at||d.created_at)),node('small',d.sent_at?'Envio confirmado':'Tentativa registrada'));
   entry.append(when);tbody.append(entry);
  }
  table.append(tbody);scroll.append(table);
 }
 search.oninput=draw;filter.onchange=draw;draw();
 section.append(node('p','Os horários seguem Brasília. O histórico registra o destinatário principal; os e-mails em CC de envios anteriores não estão armazenados. Falhas ou tentativas em processamento devem ser verificadas antes de qualquer nova ação.','sicoob-history-info'));
 parent.append(section);
}
function render(){
 if(view!=='sicoob_collections')return;
 $('view-title').textContent='Cobranças Sicoob';
 $('view-description').textContent='Importe, confira e prepare cada cobrança individualmente.';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='sicoob_collections'));
 $('new').hidden=true;
 for(const id of ['finance-controls','calendar-board','commission-calendar-summary','summary','records'])$(id).replaceChildren();
 const box=$('records');box.classList.add('sicoob-workspace');
 $('summary').classList.add('sicoob-summary');
 if(!ready){box.append(node('p','Preparando a central de cobranças…'));return;}
 const pending=items.filter(r=>r.status==='pending');
 const stat=(label,value,detail)=>{const el=node('article',undefined,'sicoob-stat');el.append(node('span',label,'sicoob-stat-label'),node('strong',value,'sicoob-stat-value'),node('small',detail,'sicoob-stat-detail'));return el;};
 $('summary').append(
  stat('Títulos pendentes',String(pending.length),'Aguardando conferência'),
  stat('Valor pendente',fmt(pending.reduce((s,r)=>s+Number(r.amount),0)),'Valor original dos títulos'),
  stat('Empresas',String(new Set(pending.map(r=>clean(r.company))).size),'Sacados com pendências'),
  stat('E-mails cadastrados',String(pending.filter(r=>emailsFor(contact(r.company)).length>0).length),'Títulos com destinatário')
 );
 // O histórico fica no início, antes dos cartões, para dispensar rolagem longa.
 renderHistory(box);
 const tabs=node('nav',undefined,'sicoob-tabs');tabs.setAttribute('aria-label','Filtrar boletos por situação');
 for(const [key,label] of [['pending','Pendentes'],['sent','Cobrados'],['paid','Pagos']]){
  const total=items.filter(r=>r.status===key).length;
  const tab=button(`${label} (${total})`,()=>{activeTab=key;render();});
  tab.className='sicoob-tab'+(activeTab===key?' active':'');
  tab.setAttribute('aria-pressed',String(activeTab===key));
  tabs.append(tab);
 }
 box.append(tabs);
 const panel=node('section',undefined,'sicoob-panel');
 const bar=node('div',undefined,'sicoob-actions');
 const importLabel=node('label',undefined,'sicoob-import');
 importLabel.append(node('span','Importar relatório CSV'));
 const input=node('input');input.type='file';input.accept='.csv,text/csv';
 input.onchange=()=>{const file=input.files?.[0];importCsv(file);input.value='';};
 importLabel.append(input);bar.append(importLabel);
 bar.append(button('Selecionar elegíveis',()=>{items.filter(eligible).forEach(r=>selected.add(r.id));render();}),button('Limpar seleção',()=>{selected.clear();render();}));
 const send=button(`Enviar selecionados (${[...selected].filter(id=>items.some(r=>r.id===id&&eligible(r))).length})`,sendBatch);
 send.disabled=true;send.title='Envio desativado até validação da função segura no Supabase';bar.append(send);
 panel.append(bar);
 panel.append(node('p','Envio individual disponível: confira o boleto e os destinatários. Após duas confirmações, o e-mail será enviado pelo Zoho. Envio em lote continua desativado.','sicoob-notice'));
 const count=node('div',undefined,'sicoob-table-heading');
 count.append(node('h2',activeTab==='pending'?'Boletos pendentes':activeTab==='sent'?'Boletos cobrados':'Boletos pagos'),node('span',`${items.filter(r=>r.status===activeTab).length} título(s) nesta aba · ${selected.size} selecionado(s)`));panel.append(count);
 const cards=node('div',undefined,'sicoob-cards');
 const term=clean($('search').value);
 const visible=items.filter(x=>x.status===activeTab&&clean(x.company+' '+x.reference+' '+(x.external_reference||'')).includes(term));
 for(const r of visible){
  const card=node('article',undefined,'sicoob-card');
  const cb=node('input');cb.type='checkbox';cb.className='sicoob-card-check';cb.setAttribute('aria-label',`Selecionar boleto ${r.reference}`);
  cb.checked=selected.has(r.id);cb.disabled=!eligible(r);
  cb.onchange=()=>{if(cb.checked)selected.add(r.id);else selected.delete(r.id);render();};
  const company=node('div',undefined,'sicoob-card-company');
  company.append(node('strong',r.company),node('span',`Número do Documento: ${docNumber(r)||'Não informado'}`),node('small',`Nosso número (controle interno): ${r.reference}`));
  const identity=node('div',undefined,'sicoob-card-identity');identity.append(cb,company);
  const details=node('div',undefined,'sicoob-card-details');
  const field=(label,value,cls='')=>{const el=node('div',undefined,'sicoob-card-field '+cls);el.append(node('span',label),node('strong',value));return el;};
  details.append(field('Vencimento',r.due_date.split('-').reverse().join('/'),'sicoob-card-due'),field('Valor',fmt(r.amount),'sicoob-card-amount'));
  const status=field('Situação',r.status==='paid'?'Pago':r.status==='sent'?'Cobrado':'Pendente','sicoob-card-state');
  status.classList.add('sicoob-state-'+r.status);details.append(status);
  const emailRow=node('div',undefined,'sicoob-card-email sicoob-email-multi');
  const savedEmails=emailsFor(contact(r.company));
  const toLabel=node('label',undefined,'sicoob-email-field');toLabel.append(node('span','Para · e-mail principal'));
  const email=node('input');email.type='email';email.placeholder='financeiro@empresa.com.br';email.value=savedEmails[0]||'';
  email.setAttribute('aria-label',`E-mail principal de ${r.company}`);toLabel.append(email);
  const ccLabel=node('label',undefined,'sicoob-email-field');ccLabel.append(node('span','CC · e-mails adicionais (separados por ponto e vírgula)'));
  const cc=node('textarea');cc.rows=2;cc.placeholder='contasapagar@empresa.com.br; outro@empresa.com.br';cc.value=savedEmails.slice(1).join('; ');
  cc.setAttribute('aria-label',`E-mails em cópia de ${r.company}`);ccLabel.append(cc);
  const save=button('Salvar destinatários',async()=>{try{await saveContact(r.company,email.value,cc.value);}catch(e){alert(e.message);}});
  emailRow.append(toLabel,ccLabel,save);
  const actions=node('div',undefined,'sicoob-card-actions');
  const preview=button('✉ Ver e-mail',()=>{const recipients=emailsFor(contact(r.company));alert(`Para: ${recipients[0]||'(não cadastrado)'}\nCC: ${recipients.slice(1).join('; ')||'(nenhum)'}\nAssunto: Hotel Serra Negra | Aviso de pendência financeira – Boleto nº ${docNumber(r)||'[NÃO INFORMADO]'}\n\n${message(r)}`);});
  preview.classList.add('sicoob-card-preview');
  const individual=button('Enviar cobrança individual',()=>prepareIndividual(r));individual.disabled=!eligible(r);individual.title=individual.disabled?'Requer boleto pendente e vencido, Número do Documento e destinatários salvos':'Conferir e enviar cobrança após duas confirmações';actions.append(individual);
  const change=button(r.status==='paid'?'Reabrir boleto':'Marcar pago',()=>setStatus(r,r.status==='paid'?'pending':'paid'));
  change.classList.add('secondary');actions.append(preview,change);
  if(!docNumber(r))card.append(node('p','Número do Documento ausente: reimporte o CSV com a coluna “Seu Número” ou “Número do Documento” antes de enviar.','sicoob-notice'));
  card.append(identity,details,emailRow,actions);cards.append(card);
 }
 if(!visible.length)cards.append(node('p','Nenhum boleto encontrado para a pesquisa.','sicoob-empty'));
 panel.append(cards);box.append(panel);
}

return {load,render,parseCsv:parse};})();
