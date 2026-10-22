/* Fase 2 — contas a pagar. Comissões e DDA não entram nos dados ou totais. */
(function(root){'use strict';
const D=()=>HSN_DATES;
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const labels={paid:'Paga',overdue:'Vencida',today:'Vence hoje',upcoming:'A vencer'};
// Etapas do trabalho bancário são distintas do pagamento confirmado.
const workflowOptions=[
 ['pending','Pendente'],
 ['awaiting_signature','Pagamento pendente de assinatura'],
 ['scheduled_signature','Programado e pendente de assinatura'],
 ['scheduled','Programado no banco'],
 ['approved','Assinado / autorizado'],
 ['cancelled','Cancelado']
];
const workflowText=Object.fromEntries(workflowOptions);
const workflowStage=p=>p.payment_status==='paid'?'paid':workflowText[p.workflow_status]?p.workflow_status:'pending';
const workflowName=p=>p.payment_status==='paid'?'Pago':workflowText[workflowStage(p)];
const stageIsOpen=p=>p.payment_status!=='paid'&&workflowStage(p)!=='cancelled';

const docNames={boleto:'Boleto',nota_fiscal:'Nota fiscal',comprovante:'Comprovante',outros:'Outros'};
let data={payables:[],models:[],suppliers:[],types:[],holidays:[],documents:[]};
let month='',statusFilter='',workflowFilter='',typeFilter='',calendarMode='month',showArchived=false,kind='payables',version=0;
let workflowSupported=null,financeSnapshotInFlight=null;const selectedPayables=new Set();const selectedRecurring=new Set();
let selected=null,editingRecord=null,editingTable='',preview=[],previewMonth='',pendingUpload=null;
const handles=v=>['dashboard','payables','recurring_models','calendar','local_holidays'].includes(v)||HSN_PHASE3.handles(v)||HSN_PHASE4.handles(v)||HSN_PHASE5.handles(v)||HSN_PUSH.handles(v);
const byId=(list,id)=>list.find(r=>r.id===id);
const supplier=p=>byId(data.suppliers,p.supplier_id);
const type=p=>byId(data.types,p.type_id);
const amount=p=>p.actual_amount===null||p.actual_amount===undefined?p.estimated_amount:p.actual_amount;
const docs=p=>data.documents.filter(d=>d.payable_id===p.id);
const missing=p=>(p.required_documents||[]).filter(t=>!docs(p).some(d=>d.document_type===t));
function reset(){selectedPayables.clear();selectedRecurring.clear();workflowFilter='';workflowSupported=null;financeSnapshotInFlight=null;HSN_PUSH.reset();HSN_PHASE5.reset();HSN_PHASE4.reset();HSN_DOCUMENT_READING.reset();HSN_ATTACHMENTS.reset();HSN_PHASE3.reset();version++;data={payables:[],models:[],suppliers:[],types:[],holidays:[],documents:[]};selected=null;editingRecord=null;pendingUpload=null;preview=[];document.getElementById('summary')?.replaceChildren();document.getElementById('calendar-board')?.replaceChildren();document.getElementById('finance-controls')?.replaceChildren();for(const id of ['finance-dialog','documents-dialog','preview-dialog'])document.getElementById(id)?.close();document.getElementById('finance-fields')?.replaceChildren();document.getElementById('document-list')?.replaceChildren();document.getElementById('preview-list')?.replaceChildren();}
async function all(table,order='created_at'){let result=[];for(let offset=0;;offset+=1000){const batch=check(await db.from(table).select('*').order(order).order('id').range(offset,offset+999));result.push(...batch);if(batch.length<1000)break;}return result;}
// Compartilha apenas consultas SIMULTANEAS; depois de concluidas, a proxima navegacao
// busca dados novos. Nao utiliza cache financeiro persistente ou por tempo.
async function financeSnapshot(){
 if(financeSnapshotInFlight)return financeSnapshotInFlight;
 const promise=Promise.all([all('payables'),all('recurring_models'),all('suppliers'),all('account_types'),all('local_holidays'),all('payable_documents'),all('message_templates'),...HSN_PHASE3.requests(all),...HSN_PHASE4.requests(all),...HSN_PHASE5.requests(all),...HSN_PUSH.requests(all)]);
 financeSnapshotInFlight=promise;
 try{return await promise;}finally{if(financeSnapshotInFlight===promise)financeSnapshotInFlight=null;}
}
async function loadFinance(v){if(!user)return;kind=v;const token=++version;month ||= D().today().slice(0,7);$('records').replaceChildren(el('p','Carregando seu financeiro…'));try{requireOnline();const results=await financeSnapshot();if(token!==version||view!==v||!user)return;[data.payables,data.models,data.suppliers,data.types,data.holidays,data.documents,templates]=results;
 // Detecta se o novo campo foi instalado no Supabase, sem gravar nada.
 if(workflowSupported===null){const probe=await db.from('payables').select('workflow_status').limit(1);workflowSupported=!probe.error;}
HSN_PHASE3.receive(data,results.slice(7,11));HSN_PHASE4.receive(data,results[11]);HSN_PHASE5.receive(data,results.slice(12,13));HSN_PUSH.receive(results.slice(13));renderFinance();if(selected)renderDocuments();HSN_PHASE3.showDailySummary();}catch(e){if(token!==version||view!==v)return;data.payables=[];$('records').replaceChildren(el('p','Não foi possível consultar. Confira fase-6-push.sql e a conexão.'));failure(e);}}

function supplierPicker(container,suppliers,value=''){
 const wrap=el('div',undefined,'hsn-supplier-picker');
 const search=el('input');search.type='search';search.placeholder='Pesquisar por nome ou CNPJ';search.autocomplete='off';search.setAttribute('aria-label','Pesquisar fornecedor');
 const label=el('label','Fornecedor cadastrado');const sel=el('select');sel.name='supplier_id';sel.required=true;
 const sorted=[...suppliers].sort((a,b)=>(a.trade_name||a.legal_name).localeCompare(b.trade_name||b.legal_name,'pt-BR'));
 function fill(){const q=HSN_IMPORT_RULES.normalize(search.value),digits=search.value.replace(/\D/g,'');
  const previous=sel.value||value;sel.replaceChildren(new Option('Selecione o fornecedor',''));
  const found=sorted.filter(s=>!q||HSN_IMPORT_RULES.normalize([s.legal_name,s.trade_name,s.tax_id].join(' ')).includes(q)||(digits.length>=3&&String(s.tax_id||'').replace(/\D/g,'').includes(digits)));
  for(const s of found)sel.append(new Option((s.trade_name||s.legal_name)+(s.tax_id?' · '+s.tax_id:''),s.id));
  if(found.some(s=>s.id===previous))sel.value=previous;else sel.value='';
 }
 search.addEventListener('input',fill);fill();if(value)sel.value=value;
 label.append(sel);wrap.append(search,label);container.append(wrap);return sel;
}
function openFinanceRegistration(module){if(busy)return;$('finance-dialog').close();view=module;$('search').value='';load();}
async function createTypeInAccount(select){
 if(busy)return;const name=prompt('Nome do novo tipo de conta (ex.: Energia elétrica):');if(name===null)return;
 const clean=name.trim();if(!clean){notice('Informe o nome do tipo de conta.',true);return;}if(clean.length>80){notice('O nome pode ter até 80 caracteres.',true);return;}
 const present=data.types.find(t=>HSN_IMPORT_RULES.normalize(t.name)===HSN_IMPORT_RULES.normalize(clean));
 if(present){select.value=present.id;notice('Tipo já cadastrado. Ele foi selecionado.');return;}
 await operation(async()=>{
  const fresh=check(await db.from('account_types').select('*').eq('owner_id',user.id));
  const duplicate=fresh.find(t=>HSN_IMPORT_RULES.normalize(t.name)===HSN_IMPORT_RULES.normalize(clean));
  if(duplicate){data.types=fresh;select.replaceChildren(...fresh.map(t=>new Option(t.name,t.id)));select.value=duplicate.id;notice('Tipo já existente. Selecionado.');return;}
  const made=check(await db.from('account_types').insert({owner_id:user.id,name:clean,color:'#f97316'}).select('*'));
  if(made.length!==1)throw Error('Não foi possível confirmar a criação do tipo.');
  data.types.push(made[0]);select.append(new Option(made[0].name,made[0].id));select.value=made[0].id;notice('Tipo "'+clean+'" cadastrado e selecionado.');
 });
}
function selectField(container,key,title,options,value='',required=false){const label=el('label',title),select=el('select');select.name=key;select.required=required;options.forEach(([val,text,disabled])=>{const option=new Option(text,val);option.disabled=!!disabled;select.append(option);});select.value=value;label.append(select);container.append(label);return select;}
function inputField(container,key,title,value='',type='text',required=false){return field(container,key,title,value,type,required);}
function hint(container,text){container.append(el('p',text,'hint'));}
function requiredFields(container,values=['boleto']){container.append(el('h3','Documentos obrigatórios'));const group=el('div',undefined,'check-grid');Object.entries(docNames).forEach(([key,title])=>{const label=el('label',title),input=el('input');input.type='checkbox';input.name='required_documents';input.value=key;input.checked=values.includes(key);label.prepend(input);group.append(label);});container.append(group);}
function filterControls(){const controls=$('finance-controls');controls.replaceChildren();if(['payables','calendar'].includes(kind)){
 const m=inputField(controls,'filter_month','Competência / mês',month,'month',true);m.onchange=()=>{if(m.value){month=m.value;renderFinance();}};
 const st=selectField(controls,'filter_status','Prazo / pagamento',[['','Todos'],...Object.entries(labels).map(([k,v])=>[k,v])],statusFilter);st.onchange=()=>{statusFilter=st.value;renderFinance();};
 if(kind==='payables'){
  const steps=selectField(controls,'filter_workflow','Etapa bancária',[['','Todas as etapas'],...workflowOptions,['paid','Pago']],workflowFilter);
  steps.onchange=()=>{workflowFilter=steps.value;renderFinance();};
 }
 const ty=selectField(controls,'filter_type','Tipo',[['','Todos os tipos'],...data.types.map(t=>[t.id,t.name])],typeFilter);ty.onchange=()=>{typeFilter=ty.value;renderFinance();};
 if(kind==='payables'){controls.append(button('Fornecedores',()=>openFinanceRegistration('suppliers')));controls.append(button('Gerenciar tipos',()=>openFinanceRegistration('account_types')));controls.append(button('Importar pagamentos CSV',()=>openFinanceRegistration('imports')));}
 if(kind==='calendar'){
 const mode=selectField(controls,'calendar_mode','Visualização',[['month','Mês'],['list','Lista']],calendarMode);mode.onchange=()=>{calendarMode=mode.value;renderFinance();};
 const moduleSelect=selectField(controls,'module','Módulo',HSN_PHASE3.calendarOptions(),HSN_PHASE3.getCalendarModule());moduleSelect.onchange=()=>HSN_PHASE3.setCalendarModule(moduleSelect.value);
 }else{const archive=selectField(controls,'archived','Exibição',[['active','Ativas'],['archived','Arquivadas']],showArchived?'archived':'active');archive.onchange=()=>{showArchived=archive.value==='archived';renderFinance();};}
 }
 if(kind==='recurring_models'){
 const m=inputField(controls,'generate_month','Gerar competência',month,'month',true);m.onchange=()=>{month=m.value;};controls.append(button('Conferir e gerar mês',prepareGeneration,'primary'));hint(controls,'O app calcula vencimento e média. Você confere e confirma; nenhum valor real ou pagamento é lançado sozinho.');
 }
}
function filtered(){if(kind==='calendar'&&['commissions','dda'].includes(HSN_PHASE3.getCalendarModule()))return [];const search=$('search').value.toLocaleLowerCase('pt-BR');return data.payables.filter(p=>p.archived===(kind==='calendar'?false:showArchived)).filter(p=>(kind==='calendar'?p.due_date.slice(0,7):p.competence.slice(0,7))===month).filter(p=>!statusFilter||D().status(p)===statusFilter).filter(p=>kind!=='payables'||!workflowFilter||workflowStage(p)===workflowFilter).filter(p=>!typeFilter||p.type_id===typeFilter).filter(p=>[p.title,supplier(p)?.legal_name,supplier(p)?.trade_name,type(p)?.name,p.document_number].join(' ').toLocaleLowerCase('pt-BR').includes(search)).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.title.localeCompare(b.title));}
function stat(title,value,description,cls=''){const card=el('div',undefined,'stat '+cls);card.append(el('small',title),el('strong',money(value)),el('span',description,'muted'));$('summary').append(card);}
function renderFinance(){HSN_THEME.describe(view);if(!handles(view))return;kind=view;HSN_PHASE3.clearCalendar();
 if(kind==='dashboard')return renderDashboard();if(HSN_PUSH.handles(view))return HSN_PUSH.render();if(HSN_PHASE5.handles(view))return HSN_PHASE5.render();if(HSN_PHASE4.handles(view))return HSN_PHASE4.render();$('new').hidden=false;if(HSN_PHASE3.handles(view))return HSN_PHASE3.render();$('view-title').textContent=titles[kind];$('new').textContent=kind==='calendar'?'Nova conta':'Novo cadastro';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===kind));$('records').replaceChildren();$('calendar-board').replaceChildren();$('summary').replaceChildren();filterControls();
 if(['payables','calendar'].includes(kind)){
 const list=filtered(),open=list.filter(stageIsOpen),paid=list.filter(p=>p.payment_status==='paid'),today=list.filter(p=>stageIsOpen(p)&&D().status(p)==='today'),late=list.filter(p=>stageIsOpen(p)&&D().status(p)==='overdue');const sum=arr=>arr.reduce((total,p)=>total+Number(amount(p)),0);
 stat('Pendente · contas',sum(open),open.length+' contas');stat('Pago · contas',sum(paid),paid.length+' contas','green');stat('Hoje · contas',sum(today),today.length+' contas','orange');stat('Vencido · contas',sum(late),late.length+' contas','red');
 if(kind==='calendar'&&calendarMode==='month'){renderCalendar(list);HSN_PHASE3.enhanceCalendar(month,calendarMode);HSN_PHASE4.calendar(month,calendarMode);return;}
 if(kind==='payables'){
  const visible=new Set(list.map(p=>p.id));for(const id of [...selectedPayables])if(!visible.has(id))selectedPayables.delete(id);
  $('records').append(bulkPayableToolbar(list));
  if(workflowSupported===false){const warning=el('div',undefined,'hsn86-migration-alert');warning.append(el('strong','Ative os status bancários no Supabase'),el('p','As caixas de seleção já funcionam, mas para salvar as novas etapas é preciso executar o arquivo SQL incluído nesta atualização. Nenhuma conta será alterada até essa configuração.'));$('records').append(warning);}
 }
 if(!list.length)$('records').append(el('p','Nenhuma conta neste período e filtro.'));
 if(list.length)$('records').append(accountTable(list));if(kind==='calendar'){HSN_PHASE3.enhanceCalendar(month,calendarMode);HSN_PHASE4.calendar(month,calendarMode);}if(kind==='payables'&&!showArchived){const absent=data.models.filter(m=>m.active&&m.first_month.slice(0,7)<=month&&(!m.last_month||m.last_month.slice(0,7)>=month)&&!data.payables.some(p=>p.model_id===m.id&&p.competence.slice(0,7)===month));if(absent.length){const card=el('section',undefined,'card full-width');card.append(el('h3',absent.length+' recorrência(s) aguardando geração'),el('p','Prepare os lançamentos de '+month.slice(5)+'/'+month.slice(0,4)+' e confira antes de confirmar.'),button('Conferir lançamentos',prepareGeneration));$('records').prepend(card);}}
 }else if(kind==='recurring_models'){
 const term=$('search').value.toLocaleLowerCase('pt-BR');const list=data.models.filter(m=>[m.title,supplier(m)?.legal_name].join(' ').toLocaleLowerCase('pt-BR').includes(term));for(const id of [...selectedRecurring])if(!list.some(m=>m.id===id))selectedRecurring.delete(id);$('records').append(bulkRecurringToolbar(list));if(!list.length)$('records').append(el('p','Cadastre um modelo mensal para começar.'));
 list.forEach(m=>{const card=el('article',undefined,'record');const ck=el('input');ck.type='checkbox';ck.className='hsn86-checkbox';ck.checked=selectedRecurring.has(m.id);ck.setAttribute('aria-label','Selecionar recorrência '+m.title);ck.addEventListener('change',()=>{ck.checked?selectedRecurring.add(m.id):selectedRecurring.delete(m.id);renderFinance();});const checkboxLabel=el('label',undefined,'hsn88-inline-select');checkboxLabel.append(ck,el('span','Selecionar'));card.append(checkboxLabel);card.append(el('h2',m.title),el('span',m.active?'Ativa':'Pausada','pill'),el('p',(supplier(m)?.trade_name||supplier(m)?.legal_name||'')+' · '+(type(m)?.name||'')),el('p','Vencimento: dia '+m.due_day+' · Estimativa inicial: '+money(m.estimated_amount)),el('p','A média dos últimos até 3 meses pagos substituirá a estimativa na próxima geração.','muted'));const actions=el('div',undefined,'actions');actions.append(button('Editar',()=>editor(m)),button('Histórico',()=>showModelHistory(m)));card.append(actions);$('records').append(card);});
 }else{
 const term=$('search').value.toLocaleLowerCase('pt-BR');const list=data.holidays.filter(h=>h.name.toLocaleLowerCase('pt-BR').includes(term));hint($('records'),'Nacionais e datas móveis são calculados no código. Carnaval e Corpus Christi são considerados dias não úteis por opção operacional. Cadastre aqui os estaduais e municipais. Alterar feriados não modifica contas já geradas; abra a conta e confirme a nova data se necessário.');
 list.forEach(h=>{const card=el('article',undefined,'record');card.append(el('h2',h.name),el('p',D().br(h.holiday_date)+' · '+(h.annually?'Todo ano':'Somente neste ano')+' · '+h.scope));const actions=el('div',undefined,'actions');actions.append(button('Editar',()=>editor(h)),button('Excluir',()=>deleteHoliday(h),'danger'));card.append(actions);$('records').append(card);});
 }
}
// Painel inicial usa somente dados consultados; nenhuma rotina bancária é executada aqui.
function goModule(next){if(busy)return;selectedPayables.clear();view=next;$('search').value='';$('hsn7-search')&&($('hsn7-search').value='');window.scrollTo(0,0);load();}
function renderDashboard(){
 $('view-title').textContent='Seu painel';$('new').hidden=true;$('search').closest('.search-wrap').hidden=true;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='dashboard'));
 $('finance-controls').replaceChildren();$('calendar-board').replaceChildren();$('summary').replaceChildren();$('records').replaceChildren();
 const current=data.payables.filter(p=>!p.archived&&p.competence.slice(0,7)===month);
 const pending=current.filter(stageIsOpen), paid=current.filter(p=>p.payment_status==='paid');
 const signing=current.filter(p=>['awaiting_signature','scheduled_signature'].includes(workflowStage(p)));
 const overdue=pending.filter(p=>p.due_date<D().today());const total=ps=>ps.reduce((n,p)=>n+Number(amount(p)),0);
 stat('Aguardando pagamento',total(pending),pending.length+' contas');stat('Aguardando assinatura',total(signing),signing.length+' contas','orange');stat('Pagas no mês',total(paid),paid.length+' contas','green');stat('Vencidas',total(overdue),overdue.length+' contas','red');
 const main=el('section',undefined,'hsn86-dashboard-section');main.append(el('h2','Atalhos financeiros'),el('p','Visualize e organize as contas sem confundir programação bancária com pagamento efetivo.'));
 const links=el('div',undefined,'hsn86-dashboard-links');for(const [title,description,target] of [['Contas a pagar','Selecionar, classificar e conferir títulos','payables'],['DDA','Importar, conferir e converter boletos','dda'],['Calendário','Vencimentos e compromissos','calendar'],['Cobranças Sicoob','Histórico e títulos de cobrança','sicoob_collections']]){const b=button(title+' →',()=>goModule(target),'hsn86-dashboard-link');b.append(el('small',description));links.append(b);}main.append(links);$('records').append(main);
 const queued=signing.sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,8);const block=el('section',undefined,'hsn86-dashboard-section');block.append(el('h2','Aguardando assinatura do diretor'));if(!queued.length)block.append(el('p','Nenhuma conta nesta etapa para a competência atual.'));for(const p of queued){const row=el('div',undefined,'hsn86-dashboard-row');row.append(el('strong',p.title),el('span',D().br(p.due_date)+' · '+money(amount(p))),el('span',workflowName(p),'hsn86-stage hsn86-stage-'+workflowStage(p)));block.append(row);}block.append(button('Abrir contas a pagar →',()=>goModule('payables')));$('records').append(block);
}
function bulkPayableToolbar(list){
 const bar=el('section',undefined,'hsn86-bulkbar full-width');
 const selected=list.filter(p=>selectedPayables.has(p.id));const sum=selected.reduce((n,p)=>n+Number(amount(p)),0);
 const heading=el('div',undefined,'hsn86-bulkheading');heading.append(el('h3','Ações em lote — Contas a pagar'),el('p','Marque as contas na tabela para alterar a etapa bancária ou organizar o pagamento.'));bar.append(heading);
 const details=el('div',undefined,'hsn86-bulkdetails');details.append(el('strong',selected.length+' selecionada(s)'),el('span',money(sum)+' · valor apresentado (real ou estimado)'));bar.append(details);
 const actions=el('div',undefined,'hsn86-bulkactions');
 const all=button('Selecionar todas ('+list.length+')',()=>{list.forEach(p=>selectedPayables.add(p.id));renderFinance();});all.disabled=!list.length||selected.length===list.length;actions.append(all);
 const clear=button('Limpar seleção',()=>{selectedPayables.clear();renderFinance();});clear.disabled=!selected.length;actions.append(clear);
 const status=button('Alterar etapa bancária',()=>editWorkflow(selected),'primary');status.disabled=!selected.length||workflowSupported!==true;actions.append(status);
 const changeType=button('Alterar tipo de conta',()=>bulkChangeType(selected));changeType.disabled=!selected.length;actions.append(changeType);
 const paid=button('Confirmar pagamentos',()=>bulkMarkPaid(selected));paid.disabled=!selected.length;actions.append(paid);
 const archiveBtn=button(showArchived?'Restaurar selecionadas':'Arquivar selecionadas',()=>bulkArchive(selected,showArchived));archiveBtn.disabled=!selected.length;actions.append(archiveBtn);
 bar.append(actions);bar.append(el('p','Programado ou aguardando assinatura NÃO significa pago. Comprovante é opcional, mas a baixa exige confirmação do pagamento efetivo, data e valor real.','hsn86-bulkhelp'));return bar;
}
function getWorkflowDialog(){let dialog=$('hsn86-workflow-dialog');if(!dialog){dialog=el('dialog');dialog.id='hsn86-workflow-dialog';dialog.className='hsn86-workflow-dialog';document.getElementById('app').append(dialog);}return dialog;}
function editWorkflow(items){
 if(workflowSupported!==true){notice('Execute primeiro o SQL de migração do HSN 8.6 no Supabase.',true);return;}
 const eligible=items.filter(p=>p.payment_status!=='paid'&&!p.archived);
 if(!eligible.length){notice('Nenhuma conta ativa e não paga na seleção.',true);return;}
 const dialog=getWorkflowDialog();dialog.replaceChildren();dialog.className='hsn86-workflow-dialog';const form=el('form');form.method='dialog';form.className='hsn86-workflow-form';
 const head=el('div',undefined,'hsn86-workflow-head');head.append(el('h2','Alterar etapa bancária'),el('p',eligible.length+' conta(s) elegível(is). '+(items.length-eligible.length)+' já pagas/arquivadas serão ignoradas.'));form.append(head);
 const stageLabel=el('label','Nova etapa');const sel=el('select');sel.required=true;for(const [value,label] of workflowOptions)sel.append(new Option(label,value));stageLabel.append(sel);form.append(stageLabel);
 const dateLabel=el('label','Data programada no banco');const date=el('input');date.type='date';date.value=D().today();dateLabel.append(date);form.append(dateLabel);
 const noteLabel=el('label','Observação / responsável (recomendado)');const note=el('textarea');note.rows=3;note.maxLength=2000;note.placeholder='Ex.: programado no Sicoob, aguardando assinatura do diretor';noteLabel.append(note);form.append(noteLabel);
 const warning=el('p','Esta etapa é um registro interno e não confirma assinatura, transferência ou pagamento no banco.','hsn86-workflow-warning');form.append(warning);
 const consentLabel=el('label',undefined,'hsn86-consent');const consent=el('input');consent.type='checkbox';consentLabel.append(consent,el('span','Conferi os boletos selecionados e confirmo a atualização dos status.'));form.append(consentLabel);
 const controls=el('div',undefined,'hsn86-dialog-actions');const cancel=button('Cancelar',()=>dialog.close());const submit=button('Salvar '+eligible.length+' conta(s)',()=>{},'primary');submit.type='submit';controls.append(cancel,submit);form.append(controls);
 function sync(){dateLabel.hidden=!['scheduled','scheduled_signature'].includes(sel.value);date.required=!dateLabel.hidden;note.required=sel.value==='cancelled';submit.disabled=!consent.checked||!sel.value||date.required&&!date.value||note.required&&!note.value.trim();}
 sel.onchange=sync;date.oninput=sync;note.oninput=sync;consent.onchange=sync;sync();
 form.addEventListener('submit',async e=>{e.preventDefault();sync();if(submit.disabled)return;
  if(!confirm('Confirmar a etapa "'+workflowText[sel.value]+'" para '+eligible.length+' conta(s)? Nenhum pagamento será efetuado.'))return;
  dialog.close();const target=sel.value,info=note.value.trim(),scheduled=['scheduled','scheduled_signature'].includes(target)?date.value:null;
  await runBulkMutation(eligible,p=>({workflow_status:target,workflow_note:info,bank_scheduled_date:scheduled,workflow_updated_at:new Date().toISOString()}),'Etapa bancária atualizada');
 });dialog.append(form);dialog.showModal();
}
async function runBulkMutation(items,makePayload,title){
 if(!items.length)return;await operation(async()=>{
 const errors=[];let done=0;for(const p of items){try{
 const fresh=check(await db.from('payables').select('updated_at,payment_status,archived').eq('id',p.id).eq('owner_id',user.id).single());
 if(fresh.updated_at!==p.updated_at||fresh.payment_status!==p.payment_status||fresh.archived!==p.archived){errors.push(p.title+': registro alterado, atualize a tela');continue;}
 const payload=makePayload(p);const result=check(await db.from('payables').update(payload).eq('id',p.id).eq('owner_id',user.id).eq('updated_at',p.updated_at).select('id'));
 if(result.length!==1)throw Error('registro alterado, atualize a tela');done++;
 }catch(e){errors.push(p.title+': '+(e.message||'erro'));}}
 selectedPayables.clear();await loadFinance(view);
 notice(title+': '+done+' concluída(s); '+errors.length+' falha(s).'+(errors.length?' '+errors.slice(0,3).join(' | '):''),errors.length>0);
 });
}
async function bulkArchive(items,restore){const eligible=items.filter(p=>p.archived===restore);if(!eligible.length)return;if(!confirm((restore?'Restaurar':'Arquivar')+' '+eligible.length+' conta(s) selecionada(s)? O histórico será preservado.'))return;await runBulkMutation(eligible,()=>({archived:!restore}),restore?'Restauração':'Arquivamento');}
// Baixa administrativa com comprovante opcional. Não executa transações bancárias.
// O Supabase mantém a regra payables_check: pago exige paid_date e actual_amount.
function paymentBlockReason(p){
 if(p.payment_status==='paid')return 'já paga';
 if(p.archived)return 'arquivada';
 if(p.approval_status==='waiting')return 'aguardando aprovação';
 if(workflowStage(p)==='cancelled')return 'cancelada';
 if(['awaiting_signature','scheduled_signature'].includes(workflowStage(p)))return 'aguardando assinatura do diretor';
 return '';
}
function paymentAudit(p,paidOn,amountValue,source,reason,hasReceipt){
 const when=new Date().toISOString();
 const audit='[BAIXA HSN 8.8 · '+when+' · operador '+user.id+' · pago em '+paidOn+' · '+money(amountValue)+' · fonte: '+source+' · '+(hasReceipt?'comprovante anexado':'SEM COMPROVANTE; '+reason)+']';
 const old=String(p.workflow_note||'');
 if(old.length+audit.length+1<=2000)return {workflow_note:(old?old+'\n':'')+audit,workflow_updated_at:when};
 const notes=String(p.notes||'');
 if(notes.length+audit.length+1<=2000)return {notes:(notes?notes+'\n':'')+audit,workflow_updated_at:when};
 throw Error('O histórico de observações atingiu o limite. Abra a conta e libere espaço antes da baixa.');
}
async function bulkMarkPaid(items){
 if(busy)return;
 const unique=[...new Map(items.map(p=>[p.id,p])).values()];
 const eligible=unique.filter(p=>!paymentBlockReason(p));
 const rejected=unique.filter(p=>paymentBlockReason(p));
 if(!eligible.length){notice('Nenhuma conta elegível. Contas pagas, canceladas, arquivadas ou aguardando assinatura não podem receber nova baixa.',true);return;}
 const dialog=getWorkflowDialog();dialog.replaceChildren();dialog.className='hsn86-workflow-dialog hsn88-paid-dialog';
 const form=el('form');form.className='hsn86-workflow-form hsn88-paid-form';
 form.append(el('h2','Confirmar pagamentos selecionados'),el('p',eligible.length+' conta(s) elegível(is). O HSN registrará a baixa, mas NÃO realizará pagamentos no banco.','hsn88-help'));
 const total=eligible.reduce((n,p)=>n+Number(amount(p)),0);
 form.append(el('strong','Total apresentado: '+money(total),'hsn88-total'));
 if(rejected.length){const skipped=el('details',undefined,'hsn88-skipped');skipped.append(el('summary',rejected.length+' conta(s) não serão alteradas'));for(const p of rejected)skipped.append(el('p',p.title+': '+paymentBlockReason(p)));form.append(skipped);}
 const dateLabel=el('label','Data efetiva do pagamento (para todas)');const date=el('input');date.type='date';date.required=true;date.value=D().today();dateLabel.append(date);form.append(dateLabel);
 const evidenceLabel=el('label','Como o pagamento foi confirmado?');const evidence=el('select');evidence.required=true;for(const [id,text]of [['','Selecione a origem'],['bank_statement','Extrato ou consulta bancária'],['director_confirmation','Confirmação do diretor'],['manual_check','Conferência administrativa']])evidence.append(new Option(text,id));evidenceLabel.append(evidence);form.append(evidenceLabel);
 const lacking=eligible.filter(p=>!docs(p).some(d=>d.document_type==='comprovante'));
 if(lacking.length){
  const warning=el('p',lacking.length+' conta(s) sem comprovante anexado. O comprovante é OPCIONAL, mas o pagamento precisa ter sido confirmado por outra fonte. A falta ficará registrada no histórico.','hsn88-missing-proof');form.append(warning);
 }
 const noteLabel=el('label','Observação da confirmação (obrigatória para baixas sem comprovante)');const note=el('textarea');note.rows=2;note.maxLength=300;note.placeholder='Ex.: diretor confirmou a execução no Sicoob em 22/10';noteLabel.append(note);form.append(noteLabel);
 const entries=el('div',undefined,'hsn88-paid-entries');const rowValues=new Map();
 for(const p of eligible){
  const row=el('div',undefined,'hsn88-paid-row');const description=el('div');description.append(el('strong',p.title),el('small',supplier(p)?.trade_name||supplier(p)?.legal_name||'Fornecedor não informado'));
  const valueLabel=el('label','Valor efetivamente pago (R$)');const input=el('input');input.type='number';input.step='0.01';input.min='0';input.max='999999999999.99';input.required=true;input.value=Number(amount(p)||0).toFixed(2);valueLabel.append(input);row.append(description,valueLabel);
  if(p.actual_amount===null||p.actual_amount===undefined)row.append(el('small','Valor preenchido a partir da estimativa: confira e confirme o valor real.','hsn88-estimate-warning'));
  if(!docs(p).some(d=>d.document_type==='comprovante'))row.append(el('small','Sem comprovante anexado','hsn88-no-proof'));
  entries.append(row);rowValues.set(p.id,input);
 }
 form.append(entries);
 const label=el('label',undefined,'hsn86-consent');const consent=el('input');consent.type='checkbox';consent.required=true;label.append(consent,el('span','Confirmo que estes pagamentos foram EFETIVAMENTE REALIZADOS e que conferi data e valor de cada conta.'));form.append(label);
 const controls=el('div',undefined,'hsn86-dialog-actions');const cancel=button('Cancelar',()=>dialog.close());cancel.type='button';const save=button('Registrar '+eligible.length+' pagamento(s)',()=>{},'primary');save.type='submit';controls.append(cancel,save);form.append(controls);
 form.addEventListener('submit',async event=>{event.preventDefault();
  try{
   D().parse(date.value);if(!evidence.value)throw Error('Selecione como confirmou o pagamento.');
   if(lacking.length&&note.value.trim().length<8)throw Error('Para contas sem comprovante, informe uma observação com pelo menos 8 caracteres.');
   const plans=eligible.map(p=>{const value=Number(rowValues.get(p.id).value);if(!Number.isFinite(value)||value<0)throw Error(p.title+': informe um valor real válido.');return {p,value:Math.round(value*100)/100};});
   const sum=plans.reduce((n,r)=>n+r.value,0);
   if(!confirm('CONFIRMAR BAIXA FINANCEIRA\n\n'+plans.length+' conta(s) · '+money(sum)+'\nData: '+D().br(date.value)+'\n'+lacking.length+' sem comprovante anexado.\n\nConfirma que TODOS estes pagamentos já ocorreram no banco?'))return;
   save.disabled=true;dialog.close();
   await operation(async()=>{
    let done=0;const errors=[];
    for(const {p,value} of plans){try{
     const live=check(await db.from('payables').select('updated_at,payment_status,workflow_status,archived,workflow_note,notes,actual_amount').eq('id',p.id).eq('owner_id',user.id).single());
     if(live.updated_at!==p.updated_at||paymentBlockReason(live))throw Error('registro alterado, pago, cancelado ou aguardando assinatura; atualize a tela');
     const proof=docs(p).some(d=>d.document_type==='comprovante');
     const audit=paymentAudit(live,date.value,value,evidence.selectedOptions[0]?.textContent||evidence.value,note.value.trim(),proof);
     const result=check(await db.from('payables').update({payment_status:'paid',paid_date:date.value,actual_amount:value,...audit}).eq('id',p.id).eq('owner_id',user.id).eq('updated_at',p.updated_at).select('id'));
     if(result.length!==1)throw Error('registro alterado, atualize a tela');done++;
    }catch(err){errors.push(p.title+': '+(err.message||'falha'));}}
    selectedPayables.clear();await loadFinance(view);
    notice(done+' pagamento(s) registrado(s) após confirmação.'+(errors.length?' '+errors.length+' falha(s): '+errors.slice(0,4).join(' | '):''),errors.length>0);
   });
  }catch(e){failure(e);}
 });
 dialog.append(form);dialog.showModal();
}
function bulkChangeType(items){
 const eligible=items.filter(p=>!p.archived&&p.payment_status!=='paid');
 if(!eligible.length){notice('Selecione contas ativas e não pagas para alterar o tipo.',true);return;}
 if(!data.types.length){notice('Cadastre um tipo de conta primeiro.',true);return;}
 const dialog=getWorkflowDialog();dialog.replaceChildren();dialog.className='hsn86-workflow-dialog';
 const form=el('form');form.className='hsn86-workflow-form';form.append(el('h2','Alterar tipo de conta em lote'),el('p',eligible.length+' conta(s) serão reclassificadas. Contas pagas e arquivadas ficam intactas.'));
 const label=el('label','Novo tipo de conta');const sel=el('select');sel.required=true;sel.append(new Option('Selecione...',''));for(const t of data.types)sel.append(new Option(t.name,t.id));label.append(sel);form.append(label);
 const actions=el('div',undefined,'hsn86-dialog-actions');const cancel=button('Cancelar',()=>dialog.close());cancel.type='button';const save=button('Alterar '+eligible.length+' conta(s)',()=>{},'primary');save.type='submit';actions.append(cancel,save);form.append(actions);
 form.onsubmit=e=>{e.preventDefault();if(!sel.value||!data.types.some(t=>t.id===sel.value))return;if(!confirm('Alterar o tipo de '+eligible.length+' contas para '+sel.selectedOptions[0].textContent+'?'))return;dialog.close();runBulkMutation(eligible,()=>({type_id:sel.value}),'Tipo de conta atualizado');};
 dialog.append(form);dialog.showModal();
}
function accountTable(list){
 const wrap=el('div',undefined,'account-table-wrap full-width'),table=el('table',undefined,'account-table hsn86-payables-table');
 const caption=el('caption','Contas a pagar da competência selecionada');caption.className='sr-only';table.append(caption);
 const head=el('thead'),header=el('tr');
 const first=el('th');first.scope='col';const allCheck=el('input');allCheck.type='checkbox';allCheck.className='hsn86-checkbox';allCheck.setAttribute('aria-label','Selecionar todas as contas exibidas');
 const chosen=list.filter(p=>selectedPayables.has(p.id)).length;allCheck.checked=!!list.length&&chosen===list.length;allCheck.indeterminate=chosen>0&&chosen<list.length;
 allCheck.addEventListener('change',()=>{list.forEach(p=>allCheck.checked?selectedPayables.add(p.id):selectedPayables.delete(p.id));renderFinance();});first.append(allCheck);header.append(first);
 for(const name of ['Conta / competência','Fornecedor','Vencimento','Valor','Etapa bancária','Prazo','Documentos','Ações']){const th=el('th',name);th.scope='col';header.append(th);}head.append(header);table.append(head);
 const body=el('tbody');for(const p of list){const row=el('tr');if(selectedPayables.has(p.id))row.classList.add('hsn86-row-selected');
 const td=(label,node)=>{const cell=el('td');cell.dataset.label=label;if(typeof node==='string')cell.textContent=node;else cell.append(node);row.append(cell);return cell;};
 const ck=el('input');ck.type='checkbox';ck.className='hsn86-checkbox';ck.checked=selectedPayables.has(p.id);ck.setAttribute('aria-label','Selecionar conta '+p.title);ck.addEventListener('change',()=>{ck.checked?selectedPayables.add(p.id):selectedPayables.delete(p.id);renderFinance();});td('Selecionar',ck);
 const title=el('div');title.append(el('strong',p.title),el('small',p.competence.slice(5,7)+'/'+p.competence.slice(0,4)+' · '+(type(p)?.name||'')));td('Conta',title);
 td('Fornecedor',supplier(p)?.trade_name||supplier(p)?.legal_name||'—');td('Vencimento',D().br(p.due_date));const value=el('div',money(amount(p)),'table-money');if(p.actual_amount===null)value.append(el('small','Valor estimado'));td('Valor',value);
 const step=el('span',workflowName(p),'hsn86-stage hsn86-stage-'+workflowStage(p));td('Etapa bancária',step);
 td('Prazo',el('span',workflowStage(p)==='cancelled'?'—':labels[D().status(p)],'pill '+(workflowStage(p)==='cancelled'?'':D().status(p))));
 const files=el('div');files.append(el('span',docs(p).length+' anexo(s)'));if(missing(p).length)files.append(el('small','Falta: '+missing(p).map(k=>docNames[k]).join(', '),'table-doc-warning'));if(p.bank_scheduled_date)files.append(el('small','Programado: '+D().br(p.bank_scheduled_date)));td('Documentos',files);
 const details=el('details',undefined,'table-actions');details.append(el('summary','Ações'));details.append(accountCard(p).querySelector('.actions'));td('Ações',details);body.append(row);
 }table.append(body);wrap.append(table);return wrap;
}
function accountCard(p){const card=el('article',undefined,'record');const accent=el('div',undefined,'record-accent');accent.style.backgroundColor=type(p)?.color||'#ee790c';card.append(accent,el('span',workflowName(p),'hsn86-stage hsn86-stage-'+workflowStage(p)));if(p.actual_amount===null)card.append(el('span','Estimado','pill'));if(missing(p).length)card.append(el('span',missing(p).length+' doc. pendente(s)','pill missing'));card.append(el('h2',p.title),el('p',supplier(p)?.trade_name||supplier(p)?.legal_name||''));const meta=el('div',undefined,'meta');meta.append(el('span','Vence '+D().br(p.due_date),'muted'),el('span',p.competence.slice(5,7)+'/'+p.competence.slice(0,4),'muted'));card.append(meta,el('div',money(amount(p)),'money'));if(missing(p).length)card.append(el('p','Faltam: '+missing(p).map(k=>docNames[k]).join(', '),'muted'));if(p.approval_status==='waiting')card.append(el('span','Aguardando aprovação','pill missing'));if(p.approval_status==='received')card.append(el('span','Aprovação recebida','pill paid'));const actions=el('div',undefined,'actions');actions.append(button('Editar',()=>editor(p)),button('Anexos ('+docs(p).length+')',()=>openDocuments(p)),button('Alterar etapa',()=>editWorkflow([p])));if(!p.archived&&p.payment_status!=='paid'&&workflowStage(p)!=='cancelled')actions.append(button('Marcar paga',()=>markPaid(p),'primary'));const wa=button('WhatsApp',()=>accountWhatsApp(p,false));wa.disabled=!(supplier(p)?.contacts||[]).some(c=>HSN_UTILS.whatsappNumber(c.whatsapp).valid);actions.append(wa);const second=button('2ª via',()=>accountWhatsApp(p,true));second.disabled=wa.disabled;actions.append(second);if(p.approval_status==='waiting')actions.append(button('Registrar aprovação',()=>recordApproval(p)));actions.append(button(p.archived?'Restaurar':'Arquivar',()=>archive(p),'danger'));card.append(actions);return card;}
function bulkRecurringToolbar(list){
 const box=el('section',undefined,'hsn86-bulkbar hsn88-bulkbar full-width');const picked=list.filter(m=>selectedRecurring.has(m.id));
 box.append(el('h3','Ações em lote — Contas recorrentes'),el('p',picked.length+' selecionada(s) · a mudança não altera competências já geradas.'));
 const actions=el('div',undefined,'hsn86-bulkactions');
 const all=button('Selecionar todas exibidas ('+list.length+')',()=>{list.forEach(m=>selectedRecurring.add(m.id));renderFinance();});all.disabled=!list.length||picked.length===list.length;actions.append(all);
 const clear=button('Limpar seleção',()=>{selectedRecurring.clear();renderFinance();});clear.disabled=!picked.length;actions.append(clear);
 for(const [title,active] of [['Ativar selecionadas',true],['Pausar selecionadas',false]]){const btn=button(title,()=>bulkRecurringSet(picked,active));btn.disabled=!picked.some(m=>m.active!==active);actions.append(btn);}
 box.append(actions);return box;
}
async function bulkRecurringSet(records,active){
 const targets=records.filter(m=>m.active!==active);if(!targets.length)return;
 if(!confirm((active?'Ativar':'Pausar')+' '+targets.length+' recorrência(s)? Competências já geradas não serão alteradas.'))return;
 await operation(async()=>{
  let done=0;const errors=[];
  for(const m of targets){try{const changed=check(await db.from('recurring_models').update({active}).eq('id',m.id).eq('owner_id',user.id).eq('updated_at',m.updated_at).select('id'));if(changed.length!==1)throw Error('alterada em outro aparelho');done++;}catch(e){errors.push(m.title+': '+e.message);}}
  selectedRecurring.clear();await loadFinance(view);notice(done+' recorrência(s) '+(active?'ativada(s)':'pausada(s)')+'.'+(errors.length?' Falhas: '+errors.slice(0,3).join(' | '):''),errors.length>0);
 });
}
function renderCalendar(list){const board=$('calendar-board'),h=D().holidays(Number(month.slice(0,4)),data.holidays);const today=D().today();const todayList=data.payables.filter(p=>!p.archived&&p.due_date===today&&p.payment_status!=='paid'&&(!typeFilter||p.type_id===typeFilter));const strip=el('section',undefined,'today-strip');strip.append(el('h3','Hoje · '+D().br(today)),el('p',todayList.length?todayList.length+' conta(s) a conferir':'Nenhuma conta pendente vence hoje.'));todayList.forEach(p=>strip.append(button(p.title+' · '+money(amount(p)),()=>editor(p))));board.append(strip);board.append(el('p','◈ Contas a pagar · cores dos tipos · toque em uma conta para abrir. ✦ Comissões em roxo · ◆ DDA em azul · cada módulo com dados próprios.','legend'));const wrap=el('div',undefined,'calendar-wrap'),grid=el('div',undefined,'calendar-grid');for(const w of ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])grid.append(el('div',w,'weekday'));const first=month+'-01',weekday=D().parse(first).getUTCDay(),last=Number(D().monthDay(month,31).slice(8));for(let i=0;i<weekday;i++)grid.append(el('div',undefined,'day empty'));for(let day=1;day<=last;day++){const date=D().monthDay(month,day),cell=el('div',undefined,'day'+(date===today?' is-today':''));cell.dataset.date=date;cell.append(el('strong',String(day)));if(h.has(date))cell.append(el('p',h.get(date),'holiday'));list.filter(p=>p.due_date===date).forEach(p=>{const node=button('◈ '+p.title+' · '+money(amount(p)),()=>editor(p),'calendar-event '+D().status(p));node.style.borderLeftColor=type(p)?.color||'#ee790c';cell.append(node);});grid.append(cell);}while((grid.children.length-7)%7)grid.append(el('div',undefined,'day empty'));wrap.append(grid);board.append(wrap);}
function editor(record=null){if(busy)return;if(HSN_PHASE4.handles(kind))return HSN_PHASE4.editor(record);if(HSN_PHASE3.handles(kind))return HSN_PHASE3.editor(record);editingTable=kind==='calendar'?'payables':kind;editingRecord=record;$('finance-form').dataset.table=editingTable;$('finance-title').textContent=(record?'Editar · ':'Novo · ')+titles[editingTable];const container=$('finance-fields');container.replaceChildren();const grid=el('div',undefined,'grid');container.append(grid);
 if(editingTable==='local_holidays'){inputField(grid,'name','Nome',record?.name||'','text',true);inputField(grid,'holiday_date','Data',record?.holiday_date||D().today(),'date',true);selectField(grid,'annually','Repetição',[['false','Somente neste ano'],['true','Todo ano']],String(record?.annually||false));selectField(grid,'scope','Abrangência',[['municipal','Municipal'],['estadual','Estadual']],record?.scope||'municipal');}
 else{
 if(!data.suppliers.length){notice('Cadastre um fornecedor antes de criar uma conta. Os beneficiários do DDA podem ser captados pelo botão no módulo DDA.',true);return;}
 inputField(grid,'title','Descrição da conta',record?.title||'','text',true);
 supplierPicker(grid,data.suppliers,record?.supplier_id||'');
 const types=selectField(grid,'type_id','Tipo de conta',[['','Selecione o tipo'],...data.types.map(t=>[t.id,t.name])],record?.type_id||'',true);
 const typeControls=el('div',undefined,'hsn-account-type-actions');typeControls.append(button('+ Criar tipo de conta',()=>createTypeInAccount(types),'secondary'));grid.append(typeControls);
 const estimated=inputField(grid,'estimated_amount','Valor estimado (R$)',record?.estimated_amount??0,'number',true);estimated.min='0';estimated.step='.01';
 selectField(grid,'due_rule','Fim de semana / feriado',[['keep','Manter vencimento'],['before','Antecipar para dia útil'],['after','Adiar para dia útil']],record?.due_rule||'keep',true);
 if(editingTable==='recurring_models'){
 inputField(grid,'contract_adjustment_date','Próximo reajuste do contrato (opcional)',record?.contract_adjustment_date||'','date');const days=inputField(grid,'contract_notice_days','Avisar reajuste com antecedência (dias)',record?.contract_notice_days??30,'number',true);days.min='0';days.max='365';days.step='1';
 const day=inputField(grid,'due_day','Dia do vencimento',record?.due_day||10,'number',true);day.min='1';day.max='31';day.step='1';inputField(grid,'first_month','Primeira competência',(record?.first_month||month+'-01').slice(0,7),'month',true);inputField(grid,'last_month','Última competência (opcional)',record?.last_month?.slice(0,7)||'','month');selectField(grid,'active','Situação',[['true','Ativa'],['false','Pausada']],String(record?.active??true));
 }else{
 const comp=inputField(grid,'competence','Competência',(record?.competence||month+'-01').slice(0,7),'month',true);if(record&&docs(record).length)comp.disabled=true;
 inputField(grid,'original_due_date','Vencimento original',record?.original_due_date||D().monthDay(month,10),'date',true);
 const actual=inputField(grid,'actual_amount','Valor real (R$) · deixe vazio se estimado',record?.actual_amount??'','number');actual.min='0';actual.step='.01';HSN_PHASE3.attachVariation(record,container,actual,data);inputField(grid,'document_number','Número do documento',record?.document_number||'');
 const stage=selectField(grid,'workflow_status','Etapa bancária',workflowOptions,record?.workflow_status||'pending');
  stage.disabled=record?.payment_status==='paid'||workflowSupported===false;
  const scheduledDate=inputField(grid,'bank_scheduled_date','Data da programação bancária (opcional)',record?.bank_scheduled_date||'','date');
  const stageNote=inputField(container,'workflow_note','Observação da etapa bancária',record?.workflow_note||'','textarea');stageNote.maxLength=2000;
  selectField(grid,'approval_status','Aprovação (registro anterior)',[['not_required','Não precisa'],['waiting','Aguardando'],['received','Recebida externamente']],record?.approval_status||'not_required');inputField(grid,'approval_note','Registro da aprovação',record?.approval_note||'','textarea');
 const barcode=inputField(container,'barcode','Linha digitável / código de barras',record?.barcode||'');barcode.maxLength=80;inputField(container,'issuing_bank','Banco emissor (quando identificado)',record?.issuing_bank||'');container.append(button('Validar e conferir boleto',readBoleto));const result=el('div');result.id='boleto-result';container.append(result);
 if(record?.model_id){const history=paidHistory(record.model_id,record.competence);hint(container,'Últimos meses pagos: '+(history.length?history.map(p=>p.competence.slice(0,7)+' '+money(p.actual_amount)).join(' · '):'nenhum')+'. Média: '+(history.length?money(history.reduce((n,p)=>n+Number(p.actual_amount),0)/history.length):'sem histórico')+'.');}
 if(record?.payment_status==='paid')hint(container,'Esta conta já está paga. Editar descrição, vencimento ou valor exige sua conferência; a situação não é alterada automaticamente.');
 }
 const arrival=inputField(grid,'arrival_day','Dia habitual de chegada do boleto (opcional)',record?.arrival_day||'','number');arrival.min='1';arrival.max='31';arrival.step='1';requiredFields(container,record?.required_documents||['boleto']);inputField(container,'notes','Observações',record?.notes||'','textarea');
 hint(container,'O vencimento ajustado será apresentado antes de salvar. Datas são salvas sem horário. Alterar um modelo afeta somente novas competências, preservando os meses já lançados.');
 }
 $('finance-dialog').showModal();
}
function paidHistory(modelId,competence){return data.payables.filter(p=>p.model_id===modelId&&p.payment_status==='paid'&&!p.archived&&p.competence<competence).sort((a,b)=>b.competence.localeCompare(a.competence)).slice(0,3);}
function showModelHistory(model){const history=data.payables.filter(p=>p.model_id===model.id).sort((a,b)=>b.competence.localeCompare(a.competence));alert('Histórico de '+model.title+'\n\n'+(history.length?history.map(p=>p.competence.slice(0,7)+' · '+money(amount(p))+' · '+labels[D().status(p)]).join('\n'):'Nenhuma competência lançada.'));}
function readBoleto(){try{const form=$('finance-form'),result=HSN_BOLETOS.read(form.elements.barcode.value),box=$('boleto-result');box.replaceChildren();hint(box,'Código válido nos dígitos verificadores. '+result.bank+'\nValor: '+(result.amount===null?'não codificado':money(result.amount))+'\n'+result.warning+'\nValidar os dígitos não comprova autenticidade ou registro bancário.');const dateSelect=selectField(box,'boleto_date','Data a aplicar',[['','Não alterar vencimento'],...result.dates.map(r=>[r.date,r.label+' · '+D().br(r.date)])],'');box.append(button('Aplicar dados conferidos',()=>{if(!confirm('Aplicar valor e data selecionados ao formulário? Confira com o documento original.'))return;if(result.amount!==null)form.elements.actual_amount.value=result.amount.toFixed(2);if(dateSelect.value)form.elements.original_due_date.value=dateSelect.value;form.elements.issuing_bank.value=result.bank;form.elements.barcode.value=result.digits;hint(box,'Dados aplicados ao formulário. Ainda é necessário salvar.');}));}catch(e){$('boleto-result').replaceChildren();failure(e);}}
function numberValue(fd,key,nullable=false){const raw=String(fd.get(key)||'').trim();if(nullable&&raw==='')return null;const n=Number(raw);if(raw===''||!Number.isFinite(n)||n<0||n>999999999999.99)throw Error('Valor inválido em '+key);return Math.round(n*100)/100;}
async function saveFinance(event){event.preventDefault();await operation(async()=>{const form=$('finance-form'),fd=new FormData(form),table=editingTable,record=editingRecord,payload={};if(table==='local_holidays'){payload.name=String(fd.get('name')||'').trim();payload.holiday_date=String(fd.get('holiday_date'));D().parse(payload.holiday_date);payload.annually=fd.get('annually')==='true';payload.scope=String(fd.get('scope'));}
 else{
 for(const key of ['title','supplier_id','type_id','due_rule','notes'])payload[key]=String(fd.get(key)||'').trim();payload.estimated_amount=numberValue(fd,'estimated_amount');payload.required_documents=fd.getAll('required_documents');payload.arrival_day=fd.get('arrival_day')?Number(fd.get('arrival_day')):null;
 if(payload.arrival_day!==null&&(!Number.isInteger(payload.arrival_day)||payload.arrival_day<1||payload.arrival_day>31))throw Error('Dia de chegada deve estar entre 1 e 31.');
 if(table==='recurring_models'){payload.contract_adjustment_date=String(fd.get('contract_adjustment_date')||'')||null;if(payload.contract_adjustment_date)D().parse(payload.contract_adjustment_date);payload.contract_notice_days=Number(fd.get('contract_notice_days'));if(!Number.isInteger(payload.contract_notice_days)||payload.contract_notice_days<0||payload.contract_notice_days>365)throw Error('Antecedência de reajuste deve ser de 0 a 365 dias.');payload.due_day=Number(fd.get('due_day'));if(!Number.isInteger(payload.due_day)||payload.due_day<1||payload.due_day>31)throw Error('Dia de vencimento inválido');payload.first_month=String(fd.get('first_month'))+'-01';payload.last_month=fd.get('last_month')?String(fd.get('last_month'))+'-01':null;D().parse(payload.first_month);if(payload.last_month){D().parse(payload.last_month);if(payload.last_month<payload.first_month)throw Error('Última competência anterior à primeira.');}payload.active=fd.get('active')==='true';}
 else{
 payload.competence=record&&docs(record).length?record.competence:String(fd.get('competence'))+'-01';D().parse(payload.competence);payload.original_due_date=String(fd.get('original_due_date'));D().parse(payload.original_due_date);payload.due_date=D().adjust(payload.original_due_date,payload.due_rule,data.holidays);payload.actual_amount=numberValue(fd,'actual_amount',true);
 for(const key of ['document_number','issuing_bank','approval_status','approval_note'])payload[key]=String(fd.get(key)||'').trim();
  if(workflowSupported){const w=String(fd.get('workflow_status')||record?.workflow_status||'pending');if(!workflowText[w])throw Error('Etapa bancária inválida.');
   if(record?.payment_status==='paid'&&w==='cancelled')throw Error('Contas pagas não podem ser canceladas.');
   payload.workflow_status=w;payload.workflow_note=String(fd.get('workflow_note')||'').trim().slice(0,2000);
   payload.bank_scheduled_date=String(fd.get('bank_scheduled_date')||'')||null;
   if(['scheduled','scheduled_signature'].includes(w)&&!payload.bank_scheduled_date)throw Error('Informe a data da programação bancária.');
   if(w!==record?.workflow_status)payload.workflow_updated_at=new Date().toISOString();
  }payload.barcode=String(fd.get('barcode')||'').replace(/[\s.\-]/g,'');if(payload.barcode)HSN_BOLETOS.read(payload.barcode);if(record?.payment_status==='paid'&&payload.actual_amount===null)throw Error('Conta paga precisa manter o valor real.');
 if(payload.due_date!==payload.original_due_date&&!confirm('O vencimento será ajustado de '+D().br(payload.original_due_date)+' para '+D().br(payload.due_date)+'. Confirmar?'))return;
 if(record?.payment_status==='paid'&&!confirm('Salvar alterações nesta conta já paga?'))return;
 }
 }
 if(table==='payables'&&!HSN_PHASE3.confirmVariation(record,payload,data))return;
 const result=check(await (record?db.from(table).update(payload).eq('id',record.id).eq('updated_at',record.updated_at):db.from(table).insert({...payload,owner_id:user.id})).select('id'));if(result.length!==1)throw Error('Cadastro mudou em outro aparelho. Feche e atualize antes de salvar.');$('finance-dialog').close();notice('Cadastro salvo no Supabase.');await loadFinance(view);if(table==='payables')HSN_DOCUMENT_READING.afterSave(result[0].id);});}
async function prepareGeneration(){if(busy)return;await operation(async()=>{previewMonth=month+'-01';D().parse(previewMonth);preview=check(await db.rpc('preview_recurring_month',{p_month:previewMonth}));$('preview-list').replaceChildren();$('preview-info').textContent=preview.length+' lançamento(s) para '+month.slice(5)+'/'+month.slice(0,4)+'. Valores estimados; confira antes de confirmar. Competências já existentes não serão duplicadas.';preview.forEach(p=>{const card=el('div',undefined,'record');card.append(el('h3',p.title),el('p','Vencimento: '+D().br(p.due_date)+' · Estimativa: '+money(p.estimated_amount)));const old=paidHistory(p.model_id,p.competence);card.append(el('p',old.length?'Média de '+old.length+' mês(es) pago(s): '+old.map(r=>r.competence.slice(0,7)+' '+money(r.actual_amount)).join(' · '):'Sem histórico pago: usa a estimativa do modelo.','muted'));$('preview-list').append(card);});$('preview-confirm').disabled=preview.length===0;$('preview-dialog').showModal();});}
async function confirmGeneration(){await operation(async()=>{if(!preview.length)return;const fresh=check(await db.rpc('preview_recurring_month',{p_month:previewMonth}));const signature=list=>JSON.stringify(list.map(p=>[p.model_id,p.due_date,p.estimated_amount]).sort());if(signature(fresh)!==signature(preview)){throw Error('A prévia mudou. Feche e confira os lançamentos novamente antes de confirmar.');}const count=check(await db.rpc('generate_recurring_month',{p_month:previewMonth,p_preview:preview}));$('preview-dialog').close();notice(count+' lançamento(s) gerado(s). Nenhum pagamento foi marcado.');await loadFinance(view);});}
async function deleteHoliday(h){if(!confirm('Excluir o feriado '+h.name+'? Contas existentes não serão alteradas.'))return;await operation(async()=>{const result=check(await db.from('local_holidays').delete().eq('id',h.id).eq('updated_at',h.updated_at).select('id'));if(result.length!==1)throw Error('Feriado alterado em outro aparelho. Atualize.');await loadFinance(view);notice('Feriado excluído.');});}
async function archive(p){if(!confirm((p.archived?'Restaurar':'Arquivar')+' a conta '+p.title+'? O histórico e os documentos serão preservados.'))return;await updateAccount(p,{archived:!p.archived},'Conta '+(p.archived?'restaurada':'arquivada')+'.');}
async function updateAccount(p,payload,message){await operation(async()=>{const result=check(await db.from('payables').update(payload).eq('id',p.id).eq('updated_at',p.updated_at).select('id'));if(result.length!==1)throw Error('Conta mudou em outro aparelho. Atualize a lista antes de confirmar.');notice(message);await loadFinance(view);});}
function accountWhatsApp(p,second){const s=supplier(p);if(!s)return;openWhatsApp(s);$('wa-month').value=p.competence.slice(0,7);$('wa-value').value=Number(amount(p)).toFixed(2);if(second){const t=templates.find(t=>t.title.toLocaleLowerCase('pt-BR').includes('segunda'));if(t){$('wa-template').value=t.id;$('wa-fill').click();}}}
async function recordApproval(p){const text=prompt('Registre de quem recebeu a aprovação, data e canal (WhatsApp, e-mail etc.):',p.approval_note||'');if(text===null)return;if(!text.trim()){notice('Informe o registro da aprovação.',true);return;}if(!confirm('Confirmar aprovação recebida externamente?'))return;const updated={approval_status:'received',approval_note:text.trim()};
 if(workflowSupported&&['awaiting_signature','scheduled_signature'].includes(workflowStage(p))){updated.workflow_status=workflowStage(p)==='scheduled_signature'?'scheduled':'approved';updated.workflow_note='Assinatura confirmada externamente: '+text.trim();updated.workflow_updated_at=new Date().toISOString();}
 await updateAccount(p,updated,'Aprovação registrada.');}
async function markPaid(p){return bulkMarkPaid([p]);}
function openDocuments(p,kind='boleto'){selected=p;HSN_ATTACHMENTS.reset();$('document-kind').value=kind;renderDocuments();$('documents-dialog').showModal();}
function renderDocuments(){if(!selected)return;selected=byId(data.payables,selected.id)||selected;$('documents-title').textContent=selected.title+' · '+selected.competence.slice(5,7)+'/'+selected.competence.slice(0,4);$('documents-info').textContent='Adicionar nova versão preserva todas as anteriores. Faltam: '+(missing(selected).map(k=>docNames[k]).join(', ')||'nenhum documento obrigatório')+'.';$('document-list').replaceChildren();const list=docs(selected).sort((a,b)=>b.created_at.localeCompare(a.created_at));if(!list.length)$('document-list').append(el('p','Nenhum anexo nesta competência.'));const seen=new Set();list.forEach(d=>{const row=el('div',undefined,'document-row'),info=el('div');const latest=!seen.has(d.document_type);seen.add(d.document_type);info.append(el('strong',docNames[d.document_type]+(latest?' · mais recente':' · histórico')),el('p',d.original_name),el('small',new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(d.created_at))));row.append(info,button('Abrir',()=>viewDocument(d)));$('document-list').append(row);});if(pendingUpload?.payableId===selected.id)hint($('document-list'),'Existe um arquivo enviado cujo registro falhou. Clique em Adicionar ao histórico para tentar registrar novamente, sem reenviar o arquivo.');}
async function viewDocument(d){const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{requireOnline();const result=check(await db.storage.from('hsn-documentos').createSignedUrl(d.storage_path,60));if(tab)tab.location.replace(result.signedUrl);else{const a=el('a','Abrir documento (válido por 60 segundos)');a.href=result.signedUrl;a.target='_blank';a.rel='noopener noreferrer';$('document-list').prepend(a);}}catch(e){tab?.close();failure(e);}}
async function uploadDocument(event){event.preventDefault();if(HSN_DOCUMENT_READING.isRunning()){notice('Aguarde ou cancele a leitura antes de anexar.',true);return;}await operation(async()=>{if(!selected)throw Error('Abra uma conta antes de anexar.');const p=selected;let meta=pendingUpload?.payableId===p.id?pendingUpload.metadata:null;if(!meta){const file=HSN_ATTACHMENTS.getFile();if(!file)throw Error('Selecione o arquivo.');if(file.size<=0||file.size>20971520)throw Error('Arquivo deve ter até 20 MB e não pode estar vazio.');const suppliedExtension=(file.name||'').split('.').pop().toLowerCase(),extension=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[file.type]||suppliedExtension),mime={'pdf':'application/pdf','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png'}[extension];if(!mime)throw Error('Use PDF, JPG ou PNG.');const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());const match=extension==='pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!match)throw Error('O conteúdo não corresponde ao tipo informado.');const documentType=$('document-kind').value;const path=user.id+'/'+p.id+'/'+p.competence.slice(0,7)+'/'+documentType+'/'+Date.now()+'-'+crypto.randomUUID()+'.'+extension;check(await db.storage.from('hsn-documentos').upload(path,file,{upsert:false,contentType:mime}));meta={owner_id:user.id,payable_id:p.id,competence:p.competence,document_type:documentType,storage_path:path,original_name:(file.name||'foto-documento.'+extension).slice(0,255),mime_type:mime,size_bytes:file.size};pendingUpload={payableId:p.id,metadata:meta};}
 try{check(await db.from('payable_documents').insert(meta).select('id'));pendingUpload=null;}catch(e){$('document-file').required=false;renderDocuments();throw Error('O arquivo foi enviado e preservado no Storage, mas seu registro falhou: '+e.message+'. Tente Adicionar ao histórico novamente.');}
 HSN_ATTACHMENTS.reset();notice('Documento adicionado. Versões anteriores preservadas.');await loadFinance(view);renderDocuments();if(meta.document_type==='comprovante'){const refreshed=data.payables.find(r=>r.id===p.id);if(refreshed)setTimeout(()=>HSN_PHASE3.suggestPaid(refreshed),0);}});}
function wire(){ $('finance-form').onsubmit=saveFinance;$('finance-close').onclick=()=>{if(!busy)$('finance-dialog').close();};$('documents-close').onclick=()=>{if(!busy){$('documents-dialog').close();HSN_ATTACHMENTS.reset();selected=null;}};$('preview-close').onclick=()=>{if(!busy)$('preview-dialog').close();};$('preview-confirm').onclick=confirmGeneration;$('document-upload').onsubmit=uploadDocument;for(const id of ['finance-dialog','documents-dialog','preview-dialog'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault();}); }
document.addEventListener('DOMContentLoaded',wire);
root.HSN_FINANCE={bulkPaid:bulkMarkPaid,selectedAccount:()=>selected,accountById:id=>data.payables.find(p=>p.id===id),openDocuments,handles,load:loadFinance,render:renderFinance,editor,reset,all,markPaid,activate:(v,m)=>{kind=v;if(m)month=m;}};
})(window);
