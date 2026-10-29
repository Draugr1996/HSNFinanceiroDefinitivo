/* Financeiro HSN 9.3 — Central de comunicacao. Leitura por usuario, sem disparo automatico. */
window.HSN_COMMUNICATIONS=(()=>{'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const button=(text,handler,cls='secondary')=>{const e=node('button',text,cls);e.type='button';e.addEventListener('click',handler);return e;};
const emailPattern=/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;
const emails=v=>String(v||'').split(/[;,\n]+/).map(x=>x.trim()).filter(x=>emailPattern.test(x));
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});};
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(x=>x.type===t)?.value||'';return get('year')+'-'+get('month')+'-'+get('day');};
let billing=[],sicoob=[],billContacts=[],sicoobContacts=[],sicoobDispatch=[],links=[],followups=[],inbox=[];
let linkEnabled=false,notesEnabled=false,loaded=false,loading=false,query='',mode='all',errorText='',inboxError='',statusArea,searchInput,rowsNode,kpiNode,linkPanel,notesPanel,replyNode;
let summaryCount=0,page=1,statusFilter='',readIssues=[],sourceOK={};
const pageSize=10;
function filteredActivities(){const q=clean(query);return activityRows().filter(r=>(mode==='all'||r.kind===mode)&&(!statusFilter||r.status===statusFilter)&&(!q||clean([r.company,r.subject,r.recipient,r.nf,r.status,r.raw.reference||''].join(' ')).includes(q)));}
function renderReadIssues(root){if(!readIssues.length)return;
 const box=node('section',undefined,'hsn93-alert');box.setAttribute('role','alert');
 box.append(node('strong','Dados incompletos: '+readIssues.length+' consulta(s) falharam. Os indicadores afetados ficam indisponíveis.'));
 for(const issue of readIssues){const e=issue.error||{},code=String(e.code||'sem código');
 let tip='Confira a conexão e tente atualizar os dados.';
 if(['42P01','PGRST205'].includes(code))tip='Tabela ausente ou fora do esquema exposto. Confira a migração e o cache de esquema do Supabase.';
 else if(['42703','PGRST204'].includes(code))tip='Coluna ausente. Compare a versão da tabela com a versão do módulo; confira a migração.';
 else if(['42501','PGRST301','PGRST302'].includes(code))tip='Confira a sessão, as permissões e as políticas de acesso do usuário. Não desative RLS.';
 const detail=node('details');detail.append(node('summary',issue.table+' · '+code),node('p',String(e.message||'Falha de leitura.')),node('p',tip));
 if(e.details)detail.append(node('p',String(e.details)));if(e.hint)detail.append(node('p',String(e.hint)));box.append(detail);
 }root.append(box);
}
async function fetchRows(table,select,order='created_at',max=1000){
 const out=[];
 for(let from=0;from<max;from+=500){
  let q=db.from(table).select(select).eq('owner_id',user.id).order(order,{ascending:false}).range(from,from+499);
  const {data,error}=await q;if(error)throw error;
  out.push(...data||[]);if(!data||data.length<500)break;
 }return out;
}
async function safeRows(table,select,order,limit){try{return {data:await fetchRows(table,select,order,limit),ok:true};}catch(error){return {data:[],ok:false,error};}}
function note(msg,type=''){if(statusArea){statusArea.textContent=msg;statusArea.dataset.kind=type;}}
function removeOld(){for(const id of ['summary','finance-controls','calendar-board','commission-calendar-summary','records'])$(id)?.replaceChildren();}
function companyNames(){return [...new Set([...sicoob.map(r=>r.company),...sicoobContacts.map(r=>r.company),...billContacts.map(r=>r.company).filter(v=>v&&!/^EMAIL: /i.test(v)),...followups.map(r=>r.company)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function allContacts(){const m=new Map();function add(email,company,source){for(const addr of emails(email)){
 const key=addr.toLowerCase();let value=m.get(key);if(!value){value={email:addr,companies:new Set(),sources:new Set()};m.set(key,value);}
 if(company&&!/^EMAIL: /i.test(company))value.companies.add(company);value.sources.add(source);
 }}
 for(const r of billContacts){add(r.to_emails,r.company,'Faturamento');add(r.cc_emails,r.company,'Faturamento');}
 for(const r of sicoobContacts)add(r.email,r.company,'Sicoob');
 return [...m.values()].sort((a,b)=>a.email.localeCompare(b.email,'pt-BR'));
}
const nfFromSubject=str=>{const m=String(str||'').match(/NF\s*n[º°o.]?\s*([^\s|]+)/i);return m?m[1]:'—';};
function billingCompany(r){const direct=String(r.company||'').trim();if(direct&&clean(direct)!=='faturamento avulso')return direct;
 const addresses=new Set(emails((r.to_emails||'')+';'+(r.cc_emails||'')).map(s=>s.toLowerCase()));
 const matches=sicoobContacts.filter(x=>emails(x.email).some(e=>addresses.has(e.toLowerCase()))).map(x=>x.company);
 return matches.length===1?matches[0]:'Faturamento avulso';
}
function activityRows(){const all=[...billing.map(r=>({id:r.id,kind:'billing',company:billingCompany(r),date:r.sent_at||r.created_at,recipient:r.to_emails||'',subject:r.subject||'',nf:nfFromSubject(r.subject),amount:null,status:r.status,raw:r})),...sicoobDispatch.map(r=>{
 const title=sicoob.find(c=>c.id===r.collection_id);return {id:r.id,kind:'collection',company:title?.company||'Empresa não identificada',date:r.sent_at||r.created_at,recipient:r.recipient_email||'',subject:'Boleto nº '+(title?.external_reference||title?.reference||'—'),nf:'—',amount:title?.amount,status:r.status,raw:r};
 })].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 return all;
}
function duplicatesOf(r){const relevant=sicoobDispatch.filter(d=>d.collection_id===r.id);
 return relevant.filter(d=>['processing','sent'].includes(d.status)).length>0;
}
function eligibleSicoob(r){return r.status==='pending'&&String(r.due_date||'')<today()&&!!String(r.external_reference||'').trim()&&!duplicatesOf(r)&&sicoobContacts.some(c=>clean(c.company)===clean(r.company)&&emails(c.email).length);}
function renderKPIs(){if(!kpiNode)return;kpiNode.replaceChildren();const sent=billing.filter(x=>x.status==='sent');const pending=sicoob.filter(r=>r.status==='pending');const due=pending.filter(r=>String(r.due_date||'')<today());const follow=followups.filter(r=>r.status==='pending');
 const stats=[['Faturamentos enviados',sent.length,'No histórico recente'],['Boletos vencidos',due.length,money(due.reduce((v,r)=>v+Number(r.amount||0),0))],['Cobranças enviadas',sicoobDispatch.filter(x=>x.status==='sent').length,'Confirmações registradas'],['Acompanhamentos',follow.length,'Anotações pendentes']];
 const available=[sourceOK.hsn_billing_dispatches,sourceOK.sicoob_collections,sourceOK.sicoob_collection_dispatches,sourceOK.hsn_communication_followups];
 let statIndex=0;for(const [label,rawValue,rawFoot] of stats){const ok=available[statIndex++]!==false,value=ok?rawValue:'—',foot=ok?rawFoot:'Leitura indisponível';const box=node('article',undefined,'hsn93-stat');box.append(node('span',label),node('strong',String(value)),node('small',foot));kpiNode.append(box);} }
function rowDetails(r){const wrap=node('div',undefined,'hsn93-details');wrap.append(node('div','Destinatários: '+(r.recipient||'—')),node('div','Assunto / documento: '+(r.subject||'—')));
 if(r.kind==='billing'){
 const repeated=billing.filter(x=>x.id!==r.id&&x.status==='sent'&&nfFromSubject(x.subject)!=='—'&&nfFromSubject(x.subject)===r.nf&&emails(x.to_emails).some(e=>emails(r.recipient).some(y=>e.toLowerCase()===y.toLowerCase())));
 if(repeated.length)wrap.append(node('div','Atenção: '+repeated.length+' outro(s) envio(s) com esta NF para um destinatário coincidente. Confira antes de reenviar.','hsn93-alert'));
 const f=r.raw.file_names||[];const names=(Array.isArray(f)?f:[]).map(x=>typeof x==='string'?x:x.nome||x.name||'Arquivo');
 wrap.append(node('div','Anexos: '+(names.join(' · ')||'Não informados')));
 const assigned=links.filter(l=>l.billing_dispatch_id===r.id);for(const link of assigned){const title=sicoob.find(x=>x.id===link.sicoob_collection_id);wrap.append(node('div','Vinculado ao boleto: '+(title?.external_reference||title?.reference||'Título indisponível'),'hsn93-linked'));}
 if(r.raw.status==='sent'&&linkEnabled)wrap.append(button('Vincular a boleto Sicoob',()=>openLink(r.raw),'secondary'));
 }
 if(r.kind==='collection')wrap.append(node('div','Situação registrada do envio: '+r.status));
 return wrap;}
function renderTimeline(){if(!rowsNode)return;rowsNode.replaceChildren();const results=filteredActivities();page=Math.min(Math.max(1,page),Math.max(1,Math.ceil(results.length/pageSize)));
 summaryCount=results.length;
 const head=node('div',undefined,'hsn93-timeline-head');head.append(node('h3','Comunicações'),node('span',results.length+' registro(s) encontrados'));rowsNode.append(head);
 if(!results.length){rowsNode.append(node('p','Nenhuma comunicação corresponde aos filtros.','hsn93-muted'));return;}
 const list=node('div',undefined,'hsn93-activity-list');rowsNode.append(list);
 for(const r of results.slice((page-1)*pageSize,page*pageSize)){const details=node('details',undefined,'hsn93-activity');const sum=node('summary');const icon=node('span',r.kind==='billing'?'NF':'$', 'hsn93-kind '+r.kind);const body=node('div',undefined,'hsn93-activity-main');body.append(node('strong',r.company),node('small',r.kind==='billing'?(r.nf==='—'?'Faturamento sem NF':'NF '+r.nf):r.subject));const side=node('div',undefined,'hsn93-activity-side');const stat=r.status==='sent'?'Enviado':r.status==='review'?'Revisão':r.status==='processing'?'Processando':r.status==='failed'?'Falha':r.status;side.append(node('small',date(r.date)),node('span',stat,'hsn93-status '+r.status));sum.append(icon,body,side);details.append(sum,rowDetails(r));list.append(details);}
 const pagination=node('nav',undefined,'hsn93-pagination');pagination.setAttribute('aria-label','Paginação das comunicações');
 const previous=button('Anterior',()=>{page--;renderTimeline();rowsNode.querySelector('.hsn93-pagination button')?.focus();});previous.disabled=page===1;
 const next=button('Próxima',()=>{page++;renderTimeline();rowsNode.querySelector('.hsn93-pagination button:last-child')?.focus();});next.disabled=page*pageSize>=results.length;
 const count=node('span',((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,results.length)+' de '+results.length+' · Página '+page+' de '+Math.ceil(results.length/pageSize));count.setAttribute('aria-live','polite');pagination.append(previous,count,next);rowsNode.append(pagination);
}
function renderAddressBook(parent){const details=node('details',undefined,'hsn93-panel');const head=node('summary','Agenda compartilhada · '+allContacts().length+' e-mails');details.append(head);const area=node('div',undefined,'hsn93-panel-content');const search=node('input');search.type='search';search.placeholder='Buscar nome da empresa ou e-mail';search.setAttribute('aria-label','Buscar na agenda compartilhada');area.append(search);
 const list=node('div',undefined,'hsn93-contact-list');area.append(list);
 const draw=()=>{const q=clean(search.value);const filtered=allContacts().filter(x=>!q||clean([x.email,...x.companies].join(' ')).includes(q));list.replaceChildren();for(const c of filtered.slice(0,25)){const card=node('div',undefined,'hsn93-contact');const info=node('div');info.append(node('strong',c.email),node('small',Array.from(c.companies).join(', ')||'Contato sem empresa'));card.append(info,button('Copiar',()=>navigator.clipboard?.writeText(c.email).then(()=>note('E-mail copiado.')).catch(()=>note('Selecione o texto para copiar.'))));list.append(card);}if(filtered.length>25)list.append(node('small','Mostrando 25 de '+filtered.length+' contatos. Busque para refinar.'));};
 search.addEventListener('input',draw);draw();details.append(area);parent.append(details);}
async function linkSave(billId,colId,notes){if(!linkEnabled)throw Error('Execute primeiro a migração SQL de vínculos.');if(!billId||!colId)throw Error('Selecione um faturamento e um boleto.');if(links.some(l=>l.billing_dispatch_id===billId&&l.sicoob_collection_id===colId))throw Error('Esse vínculo já foi cadastrado.');const {error}=await db.from('hsn_communication_links').insert({owner_id:user.id,billing_dispatch_id:billId,sicoob_collection_id:colId,note:notes.slice(0,1200)});if(error)throw error;links=await fetchRows('hsn_communication_links','*');renderTimeline();renderLinks();}
function openLink(bill){if(!sicoob.length){note('Não há boletos cadastrados no Sicoob.','error');return;}const sel=$('hsn93-link-bill');if(sel)sel.value=bill.id;linkPanel?.scrollIntoView({block:'start',behavior:'smooth'});note('Faturamento selecionado. Escolha o boleto correspondente e confira o vínculo.');}
function renderLinks(){if(!linkPanel)return;linkPanel.replaceChildren();const header=node('h3','Vincular NF e boleto');linkPanel.append(header,node('p','Vinculação manual: o mesmo destinatário ou valor não prova que a cobrança é a mesma. O vínculo não altera pagamento nem status de boleto.','hsn93-muted'));
 if(!linkEnabled){linkPanel.append(node('p','Vínculos indisponíveis. Confira o diagnóstico da consulta hsn_communication_links acima antes de alterar o banco.','hsn93-alert'));return;}
 const selectBill=node('select');selectBill.id='hsn93-link-bill';selectBill.append(new Option('Selecione o faturamento enviado',''));
 for(const r of billing.filter(x=>x.status==='sent'))selectBill.append(new Option((nfFromSubject(r.subject)==='—'?'Sem NF':'NF '+nfFromSubject(r.subject))+' · '+(r.to_emails||'').slice(0,55)+' · '+date(r.sent_at||r.created_at),r.id));
 const selectCol=node('select');selectCol.append(new Option('Selecione o boleto do Sicoob',''));
 for(const r of sicoob)selectCol.append(new Option(r.company+' · '+(r.external_reference||r.reference)+' · '+money(r.amount)+' · '+r.status,r.id));
 const noteInput=node('input');noteInput.placeholder='Observação (opcional)';noteInput.maxLength=1200;
 const save=button('Vincular após conferência',async()=>{if(!selectBill.value||!selectCol.value){note('Escolha o faturamento e o boleto.','error');return;}const a=billing.find(x=>x.id===selectBill.value),b=sicoob.find(x=>x.id===selectCol.value);if(!confirm('CONFIRMAR VÍNCULO\n\n'+(a?.subject||'Faturamento')+'\n'+(a?.to_emails||'')+'\n\n'+b?.company+' · '+(b?.external_reference||b?.reference)+' · '+money(b?.amount)+'\n\nVocê confirmou que se trata da mesma obrigação? Isso NÃO altera o pagamento.'))return;try{save.disabled=true;await linkSave(selectBill.value,selectCol.value,noteInput.value);note('Vínculo registrado com segurança.','success');}catch(e){note('Não foi possível vincular: '+e.message,'error');}finally{save.disabled=false;}});
 const fields=node('div',undefined,'hsn93-link-fields');for(const [label,field] of [['Faturamento',selectBill],['Título Sicoob',selectCol],['Observação',noteInput]]){const l=node('label',label);l.append(field);fields.append(l);}fields.append(save);linkPanel.append(fields);
 const past=node('div',undefined,'hsn93-link-list');for(const l of links.slice(0,25)){const a=billing.find(x=>x.id===l.billing_dispatch_id),b=sicoob.find(x=>x.id===l.sicoob_collection_id);const row=node('div',undefined,'hsn93-link-line');row.append(node('span',(nfFromSubject(a?.subject)==='—'?'Faturamento':'NF '+nfFromSubject(a?.subject))+' → '+(b?.company||'Boleto não carregado')+' · '+(b?.external_reference||b?.reference||'—')));
 row.append(button('Desvincular',async()=>{if(!confirm('Desvincular essa relação? Nenhum boleto ou faturamento será excluído.'))return;const {error}=await db.from('hsn_communication_links').delete().eq('owner_id',user.id).eq('id',l.id);if(error){note(error.message,'error');return;}links=links.filter(x=>x.id!==l.id);renderLinks();renderTimeline();}));past.append(row);}if(links.length)linkPanel.append(past);}
function renderFollowups(){if(!notesPanel)return;notesPanel.replaceChildren();notesPanel.append(node('h3','Acompanhar respostas e solicitações'));
 if(!notesEnabled){notesPanel.append(node('p','Anotações indisponíveis. Confira o diagnóstico da consulta hsn_communication_followups acima antes de alterar o banco.','hsn93-alert'));return;}
 const form=node('div',undefined,'hsn93-follow-form');const company=node('input');company.placeholder='Empresa';company.maxLength=160;company.setAttribute('list','hsn93-company-options');const datalist=node('datalist');datalist.id='hsn93-company-options';for(const name of companyNames())datalist.append(new Option(name));const email=node('input');email.placeholder='E-mail (opcional)';email.maxLength=320;const subject=node('input');subject.placeholder='Assunto ou NF (opcional)';subject.maxLength=250;const text=node('textarea');text.placeholder='Ex.: empresa confirmou recebimento; aguardando retorno sobre boleto 53582';text.maxLength=2000;text.rows=2;
 const submit=button('Salvar acompanhamento',async()=>{if(company.value.trim().length<2||!text.value.trim()){note('Preencha a empresa e uma observação.','error');return;}if(email.value.trim()&&!emailPattern.test(email.value.trim())){note('E-mail inválido.','error');return;}submit.disabled=true;try{const {error}=await db.from('hsn_communication_followups').insert({owner_id:user.id,company:company.value.trim(),email:email.value.trim(),subject:subject.value.trim(),note:text.value.trim(),status:'pending',source:'manual'});if(error)throw error;followups=await fetchRows('hsn_communication_followups','*');renderKPIs();renderFollowups();note('Acompanhamento registrado.','success');}catch(e){note(e.message,'error');}finally{submit.disabled=false;}});
 form.append(datalist,company,email,subject,text,submit);notesPanel.append(form);
 for(const item of followups.slice(0,30)){const row=node('div',undefined,'hsn93-follow');const body=node('div');body.append(node('strong',item.company+(item.status==='resolved'?' · Resolvido':'')),node('small',item.note+' · '+date(item.created_at)));row.append(body,button(item.status==='resolved'?'Reabrir':'Marcar resolvido',async()=>{const next=item.status==='resolved'?'pending':'resolved';const {error}=await db.from('hsn_communication_followups').update({status:next,updated_at:new Date().toISOString()}).eq('id',item.id).eq('owner_id',user.id);if(error){note(error.message,'error');return;}item.status=next;renderKPIs();renderFollowups();}));notesPanel.append(row);}
}
function csvEscape(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",;\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function exportCSV(){const data=filteredActivities();const header=['Data','Tipo','Empresa','NF','Assunto / Documento','Destinatários','Status','Valor'];const lines=[header,...data.map(r=>[date(r.date),r.kind==='billing'?'Faturamento':'Cobrança',r.company,r.nf,r.subject,r.recipient,r.status,r.amount??''])].map(row=>row.map(csvEscape).join(';')).join('\r\n');const blob=new Blob(['\ufeff'+lines],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='HSN-Comunicacoes-'+today()+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);note('Relatório CSV gerado com os registros filtrados.','success');}
async function fetchInbox(){inboxError='';replyNode?.replaceChildren(node('p','Consultando Zoho Mail…','hsn93-muted'));const {data,error}=await db.functions.invoke('hsn-zoho-inbox-read',{body:{limit:30}});if(error){let reason='';try{reason=(await error.context?.json())?.error||'';}catch(_){}throw Error(reason||error.message);}if(!data?.success)throw Error(data?.error||'Resposta inesperada do Zoho.');inbox=Array.isArray(data.messages)?data.messages:[];}
function renderReplies(){if(!replyNode)return;replyNode.replaceChildren();const header=node('div',undefined,'hsn93-timeline-head');header.append(node('h3','Respostas do Zoho'),button('Consultar caixa de entrada',async()=>{try{await fetchInbox();renderReplies();note('Mensagens consultadas. Nenhum e-mail foi enviado nem modificado.','success');}catch(e){inboxError=e.message;renderReplies();note('Não foi possível ler respostas do Zoho: '+e.message,'error');}}));replyNode.append(header);
 replyNode.append(node('p','Leitura sob demanda, sem marcar mensagens como lidas. Exige autorização ZohoMail.messages.READ e ZohoMail.folders.READ na conexão OAuth.','hsn93-muted'));
 if(inboxError)replyNode.append(node('p',inboxError+' · Consulte as instruções de autorização no pacote.','hsn93-alert'));
 for(const m of inbox.slice(0,30)){const row=node('div',undefined,'hsn93-reply');const details=node('div');details.append(node('strong',m.subject||'Sem assunto'),node('small',(m.from||'Remetente desconhecido')+' · '+date(m.received_at)));if(m.summary)details.append(node('small',m.summary.slice(0,240)));row.append(details);
 if(notesEnabled)row.append(button('Registrar retorno',()=>{const company=prompt('Empresa relacionada à resposta:',m.from||'');if(!company||company.trim().length<2)return;const observation=prompt('Descreva a providência necessária:',m.subject||'');if(!observation?.trim())return;db.from('hsn_communication_followups').insert({owner_id:user.id,company:company.trim().slice(0,160),email:m.from.slice(0,320),subject:m.subject.slice(0,250),note:observation.slice(0,2000),source:'zoho',zoho_message_id:m.message_id||null,status:'pending'}).then(async({error})=>{if(error){note(error.message,'error');return;}followups=await fetchRows('hsn_communication_followups','*');renderFollowups();renderKPIs();note('Resposta registrada para acompanhamento.');});}));replyNode.append(row);}
}
async function load(){if(loading||!user)return;loading=true;loaded=false;errorText='';readIssues=[];sourceOK={};note('Atualizando informações…');try{
 const [a,b,c,d,e,f,g]=await Promise.all([
  safeRows('hsn_billing_dispatches','id,owner_id,company,subject,to_emails,cc_emails,file_names,status,sent_at,created_at'),
  safeRows('sicoob_collections','id,owner_id,company,reference,external_reference,due_date,amount,status','due_date'),
  safeRows('hsn_billing_recipients','id,owner_id,company,to_emails,cc_emails,updated_at','updated_at'),
  safeRows('sicoob_contacts','id,owner_id,company,email','company'),
  safeRows('sicoob_collection_dispatches','id,owner_id,collection_id,status,recipient_email,created_at,sent_at'),
  safeRows('hsn_communication_links','*'),
  safeRows('hsn_communication_followups','*')]);
 const names=['hsn_billing_dispatches','sicoob_collections','hsn_billing_recipients','sicoob_contacts','sicoob_collection_dispatches','hsn_communication_links','hsn_communication_followups'];
 [a,b,c,d,e,f,g].forEach((result,i)=>{sourceOK[names[i]]=result.ok;if(!result.ok)readIssues.push({table:names[i],error:result.error});});
 billing=a.data;sicoob=b.data;billContacts=c.data;sicoobContacts=d.data;sicoobDispatch=e.data;
 links=f.data;linkEnabled=f.ok;followups=g.data;notesEnabled=g.ok;loaded=true;render();
 }catch(e){errorText=e?.message||'Falha ao carregar dados.';loaded=true;render();}finally{loading=false;}}
function render(){if(view!=='communications')return;const app=$('app');if(app?.hidden)return;$('new').hidden=true;const search=$('search')?.closest('.search-wrap');if(search)search.hidden=true;$('view-title').textContent='Central de comunicação';$('view-description').textContent='Faturamentos, cobranças, contatos e acompanhamentos em um só lugar.';removeOld();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='communications'));
 const root=node('section',undefined,'hsn93-root'),top=node('div',undefined,'hsn93-top');const intro=node('div');intro.append(node('small','HOTEL SERRA NEGRA · CENTRAL INTEGRADA','hsn93-eyebrow'),node('h2','Comunicação financeira'),node('p','Consulte faturamentos e cobranças Sicoob. As operações de envio permanecem nas telas próprias e exigem sua confirmação.'));
 const shortcuts=node('div',undefined,'hsn93-shortcuts');shortcuts.append(button('Novo faturamento',()=>document.querySelector('[data-view="billing_send"]')?.click()),button('Cobranças Sicoob',()=>document.querySelector('[data-view="sicoob_collections"]')?.click()),button('Atualizar dados',()=>{if(!loading)load();}));top.append(intro,shortcuts);root.append(top);
 statusArea=node('p',errorText||'Nenhum e-mail será enviado nesta tela.','hsn93-message');statusArea.setAttribute('role','status');if(errorText)statusArea.dataset.kind='error';root.append(statusArea);renderReadIssues(root);
 kpiNode=node('div',undefined,'hsn93-kpis');root.append(kpiNode);
 const tools=node('section',undefined,'hsn93-tools');searchInput=node('input');searchInput.type='search';searchInput.placeholder='Buscar empresa, NF, boleto ou e-mail';searchInput.value=query;searchInput.setAttribute('aria-label','Buscar empresa, NF, boleto ou e-mail');searchInput.addEventListener('input',()=>{query=searchInput.value;page=1;renderTimeline();});const tabs=node('div',undefined,'hsn93-tabs');for(const [value,label] of [['all','Todos'],['billing','Faturamentos'],['collection','Cobranças']]){const b=button(label,()=>{mode=value;page=1;for(const el of tabs.querySelectorAll('button'))el.classList.toggle('active',el.dataset.mode===mode);renderTimeline();});b.dataset.mode=value;if(mode===value)b.classList.add('active');tabs.append(b);}const statusSelect=node('select');statusSelect.setAttribute('aria-label','Filtrar situação do envio');
 for(const [value,label] of [['','Todas as situações'],['sent','Enviado'],['review','Revisão'],['processing','Processando'],['failed','Falha']])statusSelect.append(new Option(label,value));
 statusSelect.value=statusFilter;statusSelect.addEventListener('change',()=>{statusFilter=statusSelect.value;page=1;renderTimeline();});
 tools.append(searchInput,tabs,statusSelect,button('Exportar relatório CSV',exportCSV));root.append(tools);
 rowsNode=node('section',undefined,'hsn93-timeline');root.append(rowsNode);
 const below=node('div',undefined,'hsn93-columns');const left=node('div'),right=node('div');renderAddressBook(left);linkPanel=node('section',undefined,'hsn93-panel hsn93-link-panel');left.append(linkPanel);notesPanel=node('section',undefined,'hsn93-panel hsn93-followups');right.append(notesPanel);replyNode=node('section',undefined,'hsn93-panel hsn93-replies');right.append(replyNode);below.append(left,right);root.append(below);
 const info=node('div',undefined,'hsn93-footer');info.append(node('p','Cobrança em lote: prepare e revise as seleções em “Cobranças Sicoob”. Cada título é validado novamente no servidor antes de enviar. A Central não dá baixa bancária automaticamente.'));root.append(info);$('records').append(root);
 if(!loaded){statusArea.textContent='Carregando informações da Central…';return;}renderKPIs();renderTimeline();renderLinks();renderFollowups();renderReplies();}
return {load,render};})();
