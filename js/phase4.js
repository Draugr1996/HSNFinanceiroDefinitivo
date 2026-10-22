/* DDA, importação confirmada e relatórios separados. */
(function(root){'use strict';
let data=null,dda=[],kind='dda',ddaMonth='',ddaStatus='',archiveFilter=false,editing=null,formMode='',importRows=[],importModule='payables',importFile='',workbook=null,reportStart='',reportEnd='',reportType='',reportSupplier='',reportStatus='',reportModule='payables',hotelImport=false,hotelMatrix=null;
const R=()=>HSN_IMPORT_RULES,D=()=>HSN_DATES;
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const linkedAccount=c=>data?.payables?.find(p=>p.id===c.converted_payable_id);
const state=c=>c.converted_payable_id?(linkedAccount(c)?.payment_status==='paid'?'paid':'converted'):c.reviewed?'checked':'unchecked';
const stateNames={unchecked:'Não conferida',checked:'Conferida',converted:'Convertida em conta',paid:'Paga (conta vinculada)'};
// Seleção em lote restrita aos boletos visíveis na tela DDA.
const selectedDdaIds=new Set();
let lastDdaView=false;
const handles=v=>['dda','imports','reports'].includes(v);
function requests(all){return [all('dda_charges')];}
function receive(snapshot,rows){data=snapshot;dda=rows||[];const available=new Set(dda.map(c=>c.id));for(const id of selectedDdaIds)if(!available.has(id))selectedDdaIds.delete(id);ddaMonth ||= D().today().slice(0,7);reportStart ||= D().today().slice(0,7)+'-01';reportEnd ||= D().monthDay(reportStart.slice(0,7),31);}
function reset(){data=null;dda=[];selectedDdaIds.clear();lastDdaView=false;importRows=[];workbook=null;hotelImport=false;hotelMatrix=null;editing=null;for(const id of ['phase4-dialog','import-dialog','dda-batch-dialog'])document.getElementById(id)?.close();document.getElementById('phase4-fields')?.replaceChildren();document.getElementById('import-review')?.replaceChildren();}
function field4(c,key,title,value='',type='text',required=false){return field(c,key,title,value,type,required);}
function select4(c,key,title,options,value='',required=false){const label=el('label',title),select=el('select');select.name=key;select.required=required;options.forEach(([v,t])=>select.append(new Option(t,v)));select.value=value;label.append(select);c.append(label);return select;}

/* HSN 8.5 — Cadastro compartilhado: aproveitar fornecedores extraídos do DDA.
 * Não altera nomes/CNPJs existentes. Completa apenas CNPJ vazio quando o nome é inequívoco.
 * Reconsulta o Supabase antes de inserir, para reduzir cadastros duplicados.
 */
function supplierTax(value){return String(value||'').replace(/\D/g,'');}
function ddaSupplierMatch(name,tax,list=data?.suppliers||[]){
 const t=supplierTax(tax),key=R().normalize(name);
 if(t){const matches=list.filter(s=>supplierTax(s.tax_id)===t);if(matches.length===1)return matches[0];if(matches.length>1)return null;}
 const names=list.filter(s=>key&&(R().normalize(s.legal_name)===key||R().normalize(s.trade_name)===key));
 if(names.length!==1)return null;
 return !t||!supplierTax(names[0].tax_id)||supplierTax(names[0].tax_id)===t?names[0]:null;
}
function distinctDdaSuppliers(charges){
 const map=new Map();for(const c of charges){const name=String(c.supplier_name||'').trim().slice(0,180),tax=supplierTax(c.tax_id);
  if(!name)continue;
  const validTax=(tax.length===11||tax.length===14)&&!/^(\d)\1+$/.test(tax)?tax:'';
  const key=validTax?'doc:'+validTax:'name:'+R().normalize(name);
  if(!map.has(key))map.set(key,{name,tax:validTax});
 }
 return [...map.values()];
}
async function captureSuppliersFromDda(charges,{ask=false}={}){
 const candidates=distinctDdaSuppliers(charges);
 if(!candidates.length)return {created:0,existing:0,updated:0,problems:[],cancelled:false};
 const current=check(await db.from('suppliers').select('*').eq('owner_id',user.id));
 const planned=[];let existing=0;
 for(const c of candidates){
  const match=ddaSupplierMatch(c.name,c.tax,current);
  if(match){if(c.tax&&!supplierTax(match.tax_id))planned.push({kind:'fill',candidate:c,record:match});else existing++;}
  else planned.push({kind:'create',candidate:c});
 }
 if(ask){
  const created=planned.filter(p=>p.kind==='create').length,filled=planned.filter(p=>p.kind==='fill').length;
  if(!created&&!filled){notice('Todos os '+existing+' fornecedor(es) do DDA já estão cadastrados.');return {created:0,existing,updated:0,problems:[],cancelled:false};}
  if(!confirm('CAPTAR FORNECEDORES DO DDA\n\n'+created+' novo(s) fornecedor(es)\n'+filled+' cadastro(s) com CNPJ vazio a completar\n'+existing+' já cadastrado(s)\n\nSerão gravados apenas nome e CNPJ identificados nos boletos. Nenhum dado de pagamento será alterado. Continuar?'))return {created:0,existing,updated:0,problems:[],cancelled:true};
 }
 let created=0,updated=0;const problems=[];
 for(const plan of planned){
  const {candidate:c}=plan;
  try{
   // Revalidar antes de gravar; evita duplicação em recargas e importações sucessivas.
   const latest=check(await db.from('suppliers').select('*').eq('owner_id',user.id));
   const found=ddaSupplierMatch(c.name,c.tax,latest);
   if(found){
    if(c.tax&&!supplierTax(found.tax_id)){
     const result=check(await db.from('suppliers').update({tax_id:c.tax}).eq('id',found.id).eq('owner_id',user.id).eq('updated_at',found.updated_at).select('*'));
     if(result.length===1){updated++;data.suppliers=data.suppliers.filter(s=>s.id!==found.id).concat(result);}else problems.push(c.name+': cadastro modificado em outro dispositivo');
    }else existing++;
    continue;
   }
   const result=check(await db.from('suppliers').insert({owner_id:user.id,legal_name:c.name,trade_name:'',tax_id:c.tax,service_type:'',contacts:[]}).select('*'));
   if(result.length===1){created++;data.suppliers.push(result[0]);}
   else problems.push(c.name+': resultado incompleto');
  }catch(e){problems.push(c.name+': '+(e?.message||'erro ao cadastrar'));}
 }
 return {created,existing,updated,problems,cancelled:false};
}
function captureSummary(result){
 if(result.cancelled)return 'Operação cancelada.';
 return 'Fornecedores: '+result.created+' novo(s), '+result.updated+' CNPJ(s) completado(s), '+result.existing+' já existente(s)'+(result.problems.length?' · '+result.problems.length+' falha(s): '+result.problems.slice(0,3).join(' | '):'')+'.';
}
async function captureExistingDdaSuppliers(){
 if(busy)return;
 await operation(async()=>{
  const result=await captureSuppliersFromDda(dda,{ask:true});
  notice(captureSummary(result),result.problems.length>0);
 });
}
function gotoDdaRegistration(module){
 if(busy)return;view=module;$('search').value='';load();
}
function supplierOf(p){return data.suppliers.find(s=>s.id===p.supplier_id);}
function supplierLabel(s){return (s.trade_name||s.legal_name)+(s.tax_id?' · '+s.tax_id:'');}
function existing(){return [...data.payables.map(p=>({...p,module:'Contas'})),...dda.map(c=>({...c,module:'DDA'}))];}
function render(){if(!data)return;if(view!=='dda'&&lastDdaView)selectedDdaIds.clear();lastDdaView=view==='dda';HSN_FINANCE.activate(view);kind=view;HSN_THEME.describe(view);$('view-title').textContent=titles[view];$('new').hidden=view!=='dda';$('new').textContent='Nova cobrança DDA';$('records').replaceChildren();$('summary').replaceChildren();$('finance-controls').replaceChildren();$('calendar-board').replaceChildren();HSN_PHASE3.clearCalendar();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='dda')renderDda();else if(view==='imports')renderImports();else renderReports();}
function editor(record=null){if(view==='dda')openDda(record);}
function ddaCard(c,selectable=false){
 const card=el('article',undefined,'record dda-card');
 if(selectable){
  card.classList.add('dda-selectable');card.dataset.ddaId=c.id;
  const pick=el('label',undefined,'dda-card-select');
  const checkBox=el('input');checkBox.type='checkbox';checkBox.checked=selectedDdaIds.has(c.id);
  checkBox.setAttribute('aria-label','Selecionar cobrança '+c.title);
  checkBox.onchange=()=>{if(checkBox.checked)selectedDdaIds.add(c.id);else selectedDdaIds.delete(c.id);updateDdaSelectionUi();};
  pick.append(checkBox,el('span','Selecionar'));card.append(pick);
  card.classList.toggle('dda-selected',checkBox.checked);
 }
 card.append(el('span','DDA','pill dda-pill'),el('span',stateNames[state(c)],'pill dda-pill'),el('h2',c.title),el('p',c.supplier_name+(c.tax_id?' · '+c.tax_id:'')),el('p','Vencimento '+D().br(c.due_date)),el('div',money(c.amount),'money'));
 const actions=el('div',undefined,'actions');
 if(!c.converted_payable_id){actions.append(button('Editar',()=>openDda(c)));if(!c.reviewed)actions.append(button('Conferir',()=>reviewDda(c),'dda-button'));if(c.reviewed)actions.append(button('Converter em conta',()=>convertForm(c),'dda-button'));}
 else actions.append(button('Ver conta vinculada',()=>{const account=data.payables.find(p=>p.id===c.converted_payable_id);if(!account){notice('Atualize a lista para encontrar a conta vinculada.',true);return;}view='payables';HSN_FINANCE.activate(view,account.competence.slice(0,7));HSN_FINANCE.render();HSN_FINANCE.editor(account);}));
 actions.append(button(c.archived?'Restaurar':'Arquivar',()=>archiveDda(c),'danger'));card.append(actions);
 return card;
}
function visibleDdaRows(){
 const term=$('search').value.toLocaleLowerCase('pt-BR');
 return dda.filter(c=>c.archived===archiveFilter&&c.due_date.slice(0,7)===ddaMonth&&(!ddaStatus||state(c)===ddaStatus)&&[c.title,c.supplier_name,c.tax_id,c.document_number].join(' ').toLocaleLowerCase('pt-BR').includes(term));
}
function selectedVisibleDda(){return visibleDdaRows().filter(c=>selectedDdaIds.has(c.id));}
function updateDdaSelectionUi(){
 const rows=visibleDdaRows(),picked=selectedVisibleDda(),count=picked.length;
 const countNode=document.getElementById('dda-selection-summary');
 if(countNode)countNode.textContent=count+' selecionada(s) de '+rows.length+' · '+money(picked.reduce((sum,c)=>sum+Number(c.amount||0),0));
 const selectAll=document.getElementById('dda-select-all');
 if(selectAll){selectAll.checked=rows.length>0&&count===rows.length;selectAll.indeterminate=count>0&&count<rows.length;selectAll.disabled=!rows.length;}
 for(const [id,disabled] of [['dda-batch-review',!picked.some(c=>!c.archived&&!c.reviewed&&!c.converted_payable_id)],['dda-batch-convert',!picked.some(c=>!c.archived&&c.reviewed&&!c.converted_payable_id)],['dda-batch-paid',!picked.some(c=>!c.archived&&c.converted_payable_id&&linkedAccount(c)?.payment_status!=='paid')],['dda-batch-archive',!picked.some(c=>!c.archived)],['dda-batch-restore',!picked.some(c=>c.archived)],['dda-batch-export',!count],['dda-batch-clear',!count]]){
  const target=document.getElementById(id);if(target)target.disabled=disabled;
 }
 for(const card of document.querySelectorAll('#records .dda-selectable')){
  const selected=selectedDdaIds.has(card.dataset.ddaId);
  card.classList.toggle('dda-selected',selected);
  const input=card.querySelector('.dda-card-select input');if(input)input.checked=selected;
 }
}
function batchButton(text,id,handler,cls='secondary'){
 const target=button(text,handler,cls);target.id=id;return target;
}
function ddaSelectionToolbar(list){
 const section=el('section',undefined,'dda-batch-toolbar full-width');
 const upper=el('div',undefined,'dda-batch-heading');
 const label=el('label',undefined,'dda-batch-select-all');
 const checkBox=el('input');checkBox.type='checkbox';checkBox.id='dda-select-all';
 checkBox.onchange=()=>{for(const c of list){if(checkBox.checked)selectedDdaIds.add(c.id);else selectedDdaIds.delete(c.id);}updateDdaSelectionUi();};
 label.append(checkBox,el('span','Selecionar todos os boletos exibidos'));
 const summary=el('strong',undefined,'dda-batch-count');summary.id='dda-selection-summary';summary.setAttribute('aria-live','polite');
 upper.append(label,summary);section.append(upper);
 const actions=el('div',undefined,'dda-batch-actions');
 actions.append(
  batchButton('Conferir selecionados','dda-batch-review',()=>runDdaBatch('review'),'dda-button'),
  batchButton('Converter em contas','dda-batch-convert',openBatchConvert,'dda-button'),
  batchButton('Marcar como pagas','dda-batch-paid',openBatchPaid,'dda-button'),
  batchButton('Arquivar','dda-batch-archive',()=>runDdaBatch('archive')),
  batchButton('Restaurar','dda-batch-restore',()=>runDdaBatch('restore')),
  batchButton('Exportar Excel','dda-batch-export',exportSelectedDda),
  batchButton('Limpar seleção','dda-batch-clear',()=>{selectedDdaIds.clear();updateDdaSelectionUi();})
 );
 section.append(actions,el('p','As ações só afetam os títulos marcados. Conversão exige conferir fornecedor e categoria de cada título. A baixa exige confirmação do pagamento e valor real; o comprovante é opcional e sua ausência ficará registrada.','dda-batch-help'));
 return section;
}
function renderDda(){
 const controls=$('finance-controls');
 const month=field4(controls,'dda_month','Mês do vencimento',ddaMonth,'month',true);
 month.onchange=()=>{if(month.value){selectedDdaIds.clear();ddaMonth=month.value;render();}};
 const status=select4(controls,'dda_state','Conferência',[['','Todas'],...Object.entries(stateNames)],ddaStatus);
 status.onchange=()=>{selectedDdaIds.clear();ddaStatus=status.value;render();};
 const archived=select4(controls,'dda_archived','Exibição',[['active','Ativas'],['archived','Arquivadas']],archiveFilter?'archived':'active');
 archived.onchange=()=>{selectedDdaIds.clear();archiveFilter=archived.value==='archived';render();};
 controls.append(button('Importar DDA',()=>{selectedDdaIds.clear();view='imports';importModule='dda';render();}));
 controls.append(button('Captar fornecedores do DDA',captureExistingDdaSuppliers,'dda-button'));
 controls.append(button('Fornecedores',()=>gotoDdaRegistration('suppliers')));
 controls.append(button('Tipos de conta',()=>gotoDdaRegistration('account_types')));
 const list=visibleDdaRows();
 const info=el('section',undefined,'card full-width dda-card');
 info.append(el('h3','DDA · cobranças para conferir'),el('p','Não conferidas: '+list.filter(c=>!c.reviewed).length+' · Conferidas: '+list.filter(c=>c.reviewed&&!c.converted_payable_id).length+' · Convertidas: '+list.filter(c=>c.converted_payable_id&&state(c)!=='paid').length+' · Pagas: '+list.filter(c=>state(c)==='paid').length),el('p','DDA não é pagamento. Cobranças convertidas mantêm a origem e têm uma conta vinculada; nunca entram duas vezes nos totais de contas.','muted'));
 $('records').append(info,ddaSelectionToolbar(list));
 list.forEach(c=>$('records').append(ddaCard(c,true)));
 if(!list.length)$('records').append(el('p','Nenhuma cobrança neste mês e filtro.'));
 updateDdaSelectionUi();
}
/* Financeiro HSN 8.4 — conversão e confirmação de pagamentos em lote.
   Nenhum processamento automático: revisão dos dados por título, confirmação explícita,
   RPC de conversão transacional por item e atualização de pagamento com concorrência otimista. */
function getDdaBatchDialog(){
 let dialog=document.getElementById('dda-batch-dialog');
 if(dialog)return dialog;
 dialog=el('dialog',undefined,'hsn-dda-batch-dialog');dialog.id='dda-batch-dialog';
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 document.body.append(dialog);return dialog;
}
function getBatchForm(title,description,submitText){
 const dialog=getDdaBatchDialog();dialog.replaceChildren();
 const form=el('form',undefined,'hsn-dda-batch-form');form.method='dialog';
 const head=el('header',undefined,'hsn-batch-title');
 const top=el('div');top.append(el('h2',title),el('p',description,'muted'));
 const close=button('Fechar',()=>{if(!busy)dialog.close();},'secondary');close.setAttribute('aria-label','Fechar ações em lote');
 head.append(top,close);form.append(head);
 const content=el('div',undefined,'hsn-batch-content');form.append(content);
 const footer=el('footer',undefined,'hsn-batch-footer');
 const cancel=button('Cancelar',()=>{if(!busy)dialog.close();},'secondary');
 const submit=el('button',submitText,'primary');submit.type='submit';footer.append(cancel,submit);form.append(footer);
 dialog.append(form);return {dialog,form,content,submit};
}
function batchItemShell(c){
 const section=el('section',undefined,'hsn-batch-item');section.dataset.ddaBatchId=c.id;
 const title=el('div',undefined,'hsn-batch-item-title');
 title.append(el('strong',c.title),el('strong',money(c.amount),'hsn-batch-money'));
 section.append(title,el('p',(c.supplier_name||'Fornecedor não informado')+' · Documento: '+(c.document_number||'—')+' · Vencimento: '+D().br(c.due_date),'muted'));
 return section;
}
function batchSelect(container,key,label,options,value,required=true){
 const select=select4(container,key,label,options,value,required);
 select.dataset.batchField=key;return select;
}
function batchDate(container,key,label,value){
 const input=field4(container,key,label,value,'date',true);input.dataset.batchField=key;return input;
}
function batchFieldValue(section,key){return section.querySelector('[data-batch-field="'+key+'"]')?.value||'';}
function convertEligible(c){return !c.archived&&!c.converted_payable_id&&c.reviewed;}
function openBatchConvert(){
 if(busy)return;
 const chosen=selectedVisibleDda();const eligible=chosen.filter(convertEligible);
 if(!eligible.length){notice('Selecione boletos conferidos e não convertidos. Use Conferir selecionados antes de converter.',true);return;}
 if(!data.suppliers.length||!data.types.length){notice('Cadastre fornecedores e tipos de conta antes de converter DDA.',true);return;}
 const ui=getBatchForm('Converter DDA em contas a pagar',eligible.length+' título(s) aptos. Revise o fornecedor, tipo e competência de cada conta antes de criar os lançamentos.','Criar '+eligible.length+' conta(s)');
 const total=eligible.reduce((sum,c)=>sum+Number(c.amount||0),0);
 ui.content.append(el('p',eligible.length+' boleto(s) · '+money(total)+' · '+(chosen.length-eligible.length)+' selecionado(s) não conferido(s) ou já convertido(s) serão ignorados.','hsn-batch-banner'));
 const bulk=el('section',undefined,'hsn-batch-defaults');
 bulk.append(el('h3','Preenchimento rápido'));
 const defType=batchSelect(bulk,'default_type','Tipo para todos',[['','Escolha um tipo'],...data.types.map(t=>[t.id,t.name])],'',false);
 defType.onchange=()=>ui.content.querySelectorAll('[data-batch-field="type_id"]').forEach(input=>input.value=defType.value);
 const defRule=batchSelect(bulk,'default_rule','Regra de vencimento para todos',[['keep','Manter'],['before','Antecipar para dia útil'],['after','Adiar para dia útil']],'keep',false);
 defRule.onchange=()=>ui.content.querySelectorAll('[data-batch-field="due_rule"]').forEach(input=>input.value=defRule.value);
 bulk.append(el('p','Os campos preenchidos aqui podem ser alterados individualmente abaixo.','muted'));ui.content.append(bulk);
 for(const c of eligible){
  const section=batchItemShell(c),grid=el('div',undefined,'hsn-batch-grid');
  const match=ddaSupplierMatch(c.supplier_name,c.tax_id);
  const supplierId=c.supplier_id||match?.id||'';
  batchSelect(grid,'supplier_id','Fornecedor',[['','Selecione o fornecedor'],...data.suppliers.map(s=>[s.id,supplierLabel(s)])],supplierId);
  batchSelect(grid,'type_id','Tipo de conta',[['','Selecione o tipo'],...data.types.map(t=>[t.id,t.name])],'');
  const compLabel=el('label','Competência');const comp=el('input');comp.type='month';comp.required=true;comp.value=c.due_date.slice(0,7);comp.dataset.batchField='competence';compLabel.append(comp);grid.append(compLabel);
  batchSelect(grid,'due_rule','Vencimento',[['keep','Manter'],['before','Antecipar para dia útil'],['after','Adiar para dia útil']],'keep');
  section.append(grid);
  const candidate={...c,supplier_id:supplierId,original_due_date:c.due_date,actual_amount:c.amount};
  const duplicates=R().suspects(candidate,data.payables.map(p=>({...p,module:'Contas'})),data.suppliers);
  if(duplicates.length){
   const warn=el('div',undefined,'hsn-batch-warning');warn.append(el('strong','Possível conta duplicada'));
   warn.append(el('p',duplicates.slice(0,3).map(d=>d.record.title+' ('+d.reasons.join(', ')+')').join(' · ')));
   const label=el('label',undefined,'hsn-batch-confirm');const checkbox=el('input');checkbox.type='checkbox';checkbox.required=true;checkbox.dataset.duplicateConfirmed='1';
   label.append(checkbox,el('span','Revisei esta possível duplicidade e autorizo a conversão.'));warn.append(label);section.append(warn);
  }
  ui.content.append(section);
 }
 ui.form.onsubmit=e=>{e.preventDefault();if(!busy)saveBatchConvert(ui.dialog,eligible);};
 ui.dialog.showModal();
}
async function saveBatchConvert(dialog,eligible){
 const plans=[];
 try{
  for(const c of eligible){
   const item=dialog.querySelector('[data-dda-batch-id="'+c.id+'"]');
   const supplierId=batchFieldValue(item,'supplier_id'),typeId=batchFieldValue(item,'type_id');
   if(!data.suppliers.some(s=>s.id===supplierId)||!data.types.some(t=>t.id===typeId))throw Error('Revise fornecedor e tipo de '+c.title+'.');
   const competence=R().competence(batchFieldValue(item,'competence'));
   const rule=batchFieldValue(item,'due_rule');
   if(!['keep','before','after'].includes(rule))throw Error('Regra de vencimento inválida em '+c.title+'.');
   const due=D().adjust(c.due_date,rule,data.holidays);
   const confirmDup=item.querySelector('[data-duplicate-confirmed]');
   if(confirmDup&&!confirmDup.checked)throw Error('Confirme a revisão da possível duplicidade em '+c.title+'.');
   const candidate={...c,supplier_id:supplierId,original_due_date:c.due_date,actual_amount:c.amount};
   const duplicates=R().suspects(candidate,data.payables.map(p=>({...p,module:'Contas'})),data.suppliers);
   if(duplicates.length&&!confirmDup)throw Error('Possível duplicidade detectada em '+c.title+'. Feche e reabra a seleção para revisar.');
   plans.push({c,supplierId,typeId,competence,rule,due});
  }
 }catch(e){failure(e);return;}
 if(!plans.length)return;
 if(!confirm('CONFIRMAR CRIAÇÃO DE CONTAS\n\n'+plans.length+' conta(s) a pagar, total de '+money(plans.reduce((s,p)=>s+Number(p.c.amount||0),0))+'.\n\nCada conta será criada separadamente, sem registrar pagamentos. Deseja continuar?'))return;
 await operation(async()=>{
  let done=0;const failures=[];
  for(const {c,supplierId,typeId,competence,rule} of plans){
   try{
    // A função no Supabase valida cada conversão e vincula a conta criada ao DDA.
    check(await db.rpc('convert_dda_to_payable',{p_id:c.id,p_expected_updated_at:c.updated_at,p_supplier_id:supplierId,p_type_id:typeId,p_competence:competence,p_due_rule:rule}));
    done++;selectedDdaIds.delete(c.id);
   }catch(e){failures.push((c.document_number||c.title)+': '+(e.message||'Falhou'));}
  }
  dialog.close();await HSN_FINANCE.load(view);
  notice(done+' conta(s) criada(s), sem pagamento. '+(failures.length?failures.length+' falha(s): '+failures.slice(0,4).join(' | '):'Confira em Contas a pagar.'),failures.length>0);
 });
}
// Pagamentos do DDA usam o mesmo fluxo de confirmação das Contas a pagar.
// Comprovante opcional; exige data, valor real conferido e confirmação explícita.
async function openBatchPaid(){
 if(busy)return;
 const chosen=selectedVisibleDda();if(!chosen.length)return;
 const linked=[...new Map(chosen.filter(c=>c.converted_payable_id).map(c=>[c.converted_payable_id,linkedAccount(c)]).filter(([,p])=>!!p)).values()];
 const unconverted=chosen.filter(c=>!c.converted_payable_id||!linkedAccount(c));
 if(unconverted.length)notice(unconverted.length+' boleto(s) ainda precisam ser convertidos em contas a pagar e não serão incluídos na baixa.');
 if(!linked.length){notice('Selecione boletos que já foram convertidos em contas a pagar.',true);return;}
 return HSN_FINANCE.bulkPaid(linked);
}
async function runDdaBatch(action){
 if(busy)return;
 const chosen=selectedVisibleDda();
 const eligible=chosen.filter(c=>action==='review'?!c.archived&&!c.reviewed&&!c.converted_payable_id:action==='archive'?!c.archived:c.archived);
 if(!eligible.length){notice('Não há boletos elegíveis para esta ação nos selecionados.',true);return;}
 const ignored=chosen.length-eligible.length;
 const label={review:'conferir',archive:'arquivar',restore:'restaurar'}[action];
 const amount=money(eligible.reduce((sum,c)=>sum+Number(c.amount||0),0));
 const message=action==='review'
  ?'Você verificou individualmente o fornecedor, valor, vencimento e documento de todos os '+eligible.length+' boletos? Confirmar a conferência em lote ('+amount+')? Isso NÃO registra pagamentos nem cria contas.'
  :'Deseja '+label+' '+eligible.length+' boleto(s), no total de '+amount+'? '+(action==='archive'?'A conta vinculada não será modificada.':'A restauração não registra pagamentos.');
 if(!confirm(message+(ignored?'\n'+ignored+' selecionado(s) serão ignorados porque já estão nesta situação.':'')))return;
 await operation(async()=>{
  let done=0;const errors=[];
  for(const c of eligible){
   try{const payload=action==='review'?{reviewed:true,reviewed_date:D().today()}:{archived:action==='archive'};
    await persist('dda_charges',c,payload);done++;selectedDdaIds.delete(c.id);
   }catch(e){errors.push((c.document_number||c.title)+': '+(e?.message||'Falha'));}
  }
  await HSN_FINANCE.load(view);
  notice(done+' boleto(s) atualizado(s).'+(errors.length?' '+errors.length+' falha(s); confira e tente novamente:\n'+errors.slice(0,5).join('\n'):'')+(action==='review'?' Nenhum pagamento registrado.':''),errors.length>0);
 });
}
async function exportSelectedDda(){
 const chosen=selectedVisibleDda();
 if(!chosen.length){notice('Selecione ao menos um boleto DDA.',true);return;}
 try{
  await library('xlsx');
  const sheet=XLSX.utils.json_to_sheet(exportData(chosen,'dda'));
  sheet['!cols']=Array.from({length:16},()=>({wch:25}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'DDA selecionados');
  XLSX.writeFile(wb,'HSN-DDA-Selecionados-'+D().today()+'.xlsx');
 }catch(e){failure(e);}
}
function openForm(title,mode,c=null){if(busy)return false;editing=c;formMode=mode;$('phase4-title').textContent=title;$('phase4-fields').replaceChildren();$('phase4-submit').textContent=mode==='convert'?'Confirmar conversão':'Salvar no Supabase';return true;}
function openDda(c=null){if(c?.converted_payable_id){notice('Edite a conta vinculada; o DDA convertido preserva a origem.');return;}if(!openForm(c?'Editar cobrança DDA':'Nova cobrança DDA','dda',c))return;const box=$('phase4-fields'),grid=el('div',undefined,'grid');box.append(grid);field4(grid,'title','Descrição',c?.title||'','text',true);field4(grid,'supplier_name','Fornecedor / beneficiário',c?.supplier_name||'','text',true);field4(grid,'tax_id','CNPJ / CPF',c?.tax_id||'');field4(grid,'due_date','Vencimento',c?.due_date||D().today(),'date',true);const amount=field4(grid,'amount','Valor (R$)',c?.amount??0,'number',true);amount.min='0';amount.step='.01';field4(grid,'document_number','Número do documento',c?.document_number||'');field4(box,'barcode','Linha digitável / código de barras',c?.barcode||'').maxLength=100;field4(box,'notes','Observações',c?.notes||'','textarea');box.append(el('p','Inclusão e edição exigem sua revisão. Salvar edição financeira reabre a conferência antes de converter.','hint'));$('phase4-dialog').showModal();}
async function persist(table,c,payload){const rows=check(await(c?db.from(table).update(payload).eq('id',c.id).eq('updated_at',c.updated_at):db.from(table).insert({...payload,owner_id:user.id})).select('id'));if(rows.length!==1)throw Error('Registro mudou em outro aparelho. Atualize e confira.');return rows[0].id;}
async function saveDda(fd){const p={};for(const k of ['title','supplier_name','notes','document_number'])p[k]=String(fd.get(k)||'').trim();p.tax_id=R().tax(fd.get('tax_id'));p.amount=R().currency(fd.get('amount'));p.due_date=R().date(fd.get('due_date'));p.barcode=String(fd.get('barcode')||'').replace(/[\s.\-]/g,'');if(p.barcode)p.barcode=HSN_BOLETOS.read(p.barcode).digits;p.reviewed=false;p.reviewed_date=null;if(!p.title||!p.supplier_name)throw Error('Descrição e fornecedor obrigatórios.');if(p.tax_id&&!/^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/.test(p.tax_id))throw Error('Confira CPF/CNPJ: CPF com 11 dígitos ou CNPJ com 14 posições.');const hits=R().suspects({...p,id:editing?.id},existing(),data.suppliers);if(hits.length&&!confirm('Possível duplicidade:\n'+hits.map(h=>h.record.module+' · '+h.record.title+' · '+h.reasons.join(', ')).join('\n')+'\nSalvar mesmo assim?'))return false;await persist('dda_charges',editing,p);try{const saved=await captureSuppliersFromDda([p]);if(saved.problems.length)console.warn('Captura fornecedor DDA:',saved.problems);}catch(e){console.warn('Fornecedor não cadastrado automaticamente:',e);}return true;}
async function reviewDda(c){if(!confirm('Confirmar que conferiu fornecedor, valor, vencimento e documento desta cobrança? Isso não registra pagamento.'))return;await operation(async()=>{await persist('dda_charges',c,{reviewed:true,reviewed_date:D().today()});await HSN_FINANCE.load(view);notice('DDA conferido. Agora pode converter após revisar a conta.');});}
async function archiveDda(c){if(!confirm((c.archived?'Restaurar':'Arquivar')+' '+c.title+'? A conta vinculada não será alterada.'))return;await operation(async()=>{await persist('dda_charges',c,{archived:!c.archived});await HSN_FINANCE.load(view);});}
function convertForm(c){if(!data.suppliers.length||!data.types.length){notice('Cadastre fornecedor e tipo antes de converter.',true);return;}if(!openForm('Converter DDA em conta a pagar','convert',c))return;const box=$('phase4-fields');box.append(el('p',c.title+' · '+money(c.amount)+' · vence '+D().br(c.due_date),'hint'));const matched=ddaSupplierMatch(c.supplier_name,c.tax_id);select4(box,'supplier_id','Fornecedor da conta',[['','Selecione'],...data.suppliers.map(s=>[s.id,supplierLabel(s)])],c.supplier_id||matched?.id||'',true);select4(box,'type_id','Tipo',[['','Selecione'],...data.types.map(t=>[t.id,t.name])],'',true);field4(box,'competence','Competência',c.due_date.slice(0,7),'month',true);select4(box,'due_rule','Fim de semana / feriado',[['keep','Manter'],['before','Antecipar para dia útil'],['after','Adiar para dia útil']],'keep',true);box.append(el('p','Após confirmar, uma conta independente será criada com valor real, documentos obrigatórios e situação aberta. Não marca pagamento nem anexa documento automaticamente.','muted'));$('phase4-dialog').showModal();}
async function saveConvert(fd){const c=editing,supplierId=String(fd.get('supplier_id')),typeId=String(fd.get('type_id')),competence=R().competence(fd.get('competence')),rule=String(fd.get('due_rule'));const due=D().adjust(c.due_date,rule,data.holidays),candidate={...c,supplier_id:supplierId,original_due_date:c.due_date,actual_amount:c.amount};const hits=R().suspects(candidate,data.payables.map(p=>({...p,module:'Contas'})),data.suppliers);if(hits.length&&!confirm('Há conta semelhante:\n'+hits.map(h=>h.record.title+' · '+h.reasons.join(', ')).join('\n')+'\nConverter mesmo assim?'))return false;if(!confirm('Criar conta de '+money(c.amount)+' com vencimento '+D().br(due)+' na competência '+competence.slice(0,7)+'?'))return false;check(await db.rpc('convert_dda_to_payable',{p_id:c.id,p_expected_updated_at:c.updated_at,p_supplier_id:supplierId,p_type_id:typeId,p_competence:competence,p_due_rule:rule}));return true;}
async function saveForm(e){e.preventDefault();await operation(async()=>{const done=formMode==='convert'?await saveConvert(new FormData(e.target)):await saveDda(new FormData(e.target));if(!done)return;$('phase4-dialog').close();await HSN_FINANCE.load(view);notice(formMode==='convert'?'DDA convertido em conta a pagar, sem marcar pagamento.':'DDA salvo, aguardando conferência.');});}
const libs={xlsx:'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',pdf:'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',table:'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js'};const promises={};
async function library(name){if(name==='xlsx'&&root.XLSX)return;if(name==='pdf'&&root.jspdf)return;if(name==='table'&&root.jspdf?.jsPDF?.API?.autoTable)return;if(!promises[name])promises[name]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=libs[name];s.onload=resolve;s.onerror=()=>{delete promises[name];s.remove();reject(Error('Biblioteca de '+name+' não carregou. Confira conexão/CDN.'));};document.head.append(s);});await promises[name];}
function template(){return importModule==='dda'?['descricao','fornecedor','cnpj_cpf','valor','vencimento','numero_documento','codigo_barras','observacoes']:['descricao','fornecedor','cnpj_cpf','tipo','competencia','valor_estimado','valor_real','vencimento','numero_documento','codigo_barras','observacoes'];}
async function downloadTemplate(){try{await library('xlsx');const headers=template(),ws=XLSX.utils.aoa_to_sheet([headers]);ws['!cols']=headers.map(h=>({wch:h==='observacoes'?40:24}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,importModule==='dda'?'DDA':'Contas');XLSX.writeFile(wb,'Modelo-HSN-'+(importModule==='dda'?'DDA':'Contas')+'.xlsx');}catch(e){failure(e);}}
function renderImports(){const box=el('section',undefined,'card full-width');box.append(el('h2','Importar Excel / CSV com conferência'));
 box.append(el('p','Ao confirmar boletos DDA, os beneficiários serão cadastrados como fornecedores (nome e CNPJ), sem duplicar CNPJs já encontrados. Cadastros podem ser editados depois em Fornecedores.','hint'));const moduleSelect=select4(box,'import_module','Destino',[['payables','Contas a pagar'],['dda','DDA — não conferido']],importModule);moduleSelect.onchange=()=>{importModule=moduleSelect.value;render();};box.append(button('Baixar modelo Excel',downloadTemplate));const label=el('label','Planilha Excel ou CSV do banco');const input=el('input');input.id='import-file';input.type='file';input.accept='.xlsx,.xls,.csv';label.append(input);box.append(label,el('p','Relatórios de pagamentos do hotel e DDA Sicoob são reconhecidos automaticamente. A prévia vem antes de salvar. Contas já pagas na origem poderão ser importadas como pagas mediante confirmação explícita, mesmo sem comprovante.','hint'),button('Ler planilha',readWorkbook));const mapping=el('div');mapping.id='import-mapping';box.append(mapping);$('records').append(box);}
async function readWorkbook(){if(busy)return;await operation(async()=>{
 const file=$('import-file').files[0];if(!file)throw Error('Selecione a planilha.');
 if(file.size>10485760)throw Error('Use planilha de até 10 MB.');
 hotelImport=false;hotelMatrix=null;importFile=file.name;
 // O CSV de pagamentos sai com UTF-8 BOM, delimitador ; e campos entre aspas.
 // Ler diretamente evita problemas de separador e não exige editar o CSV.
 if(/\.csv$/i.test(file.name)){
  const text=await file.text();const parsed=parseHotelSemicolonCsv(text);
  if(isHotelPaymentsReport(parsed)){
   hotelMatrix=parsed;workbook=null;renderHotelPaymentsMapping(parsed);return;
  }
 }
 await library('xlsx');const bytes=await file.arrayBuffer();
 workbook=XLSX.read(bytes,{type:'array',cellDates:false,raw:true});
 if(!workbook.SheetNames.length)throw Error('Nenhuma aba encontrada.');renderMapping();
});}

const aliases={descricao:['descricao','historico','titulo'],fornecedor:['fornecedor','beneficiario','razaosocial','nomecedente','cedente'],cnpj_cpf:['cnpjcpf','cnpj','cpf','documentobeneficiario'],tipo:['tipo','tipodeconta','categoria'],competencia:['competencia','mes'],valor:['valor','valorboleto','valorcobranca'],valor_estimado:['valorestimado','estimativa'],valor_real:['valorreal','valor','valorboleto'],vencimento:['vencimento','datavencimento','datadevencimento'],numero_documento:['numerodocumento','numerodanota','nossonumero','documento'],codigo_barras:['codigobarras','codigodebarras','linhadigitavel'],observacoes:['observacoes','obs']};
/* Relatório DDA detalhado do Sicoob: títulos são blocos verticais, não linhas de tabela. */
function isSicoobDdaReport(matrix){
 const keys=matrix.map(row=>[R().normalize(row[0]),R().normalize(row[1])]);
 return keys.some(([a])=>a==='consultadda')&&
  keys.filter(([a])=>a==='linhadigitavel').length>0&&
  keys.some(([a])=>a==='datavencimento')&&
  keys.some(([a])=>a==='valorcobrado');
}
function parseSicoobDdaReport(matrix){
 if(!isSicoobDdaReport(matrix))throw Error('Esta aba não parece um relatório detalhado DDA do Sicoob.');
 const items=[];let current=null;
 function finish(){if(current&&Object.keys(current.fields).length)items.push(current);current=null;}
 for(let i=0;i<matrix.length;i++){
  const row=matrix[i]||[],key=R().normalize(row[0]);
  if(key==='resumo'||key.startsWith('quantidadederegistros')||key.startsWith('totaldetitulosselecionados')){finish();break;}
  if(key==='linhadigitavel'){
   finish();current={line:i+1,fields:{}};
  }
  if(!current)continue;
  const accepted=['linhadigitavel','numerodocumento','nossonumero','instituicaofinanceira','datavencimento',
   'nomerazaosocialdobeneficiario','nomefantasiadobeneficiario','cpfcnpjbeneficiario',
   'nomerazaosocialdopagador','cpfcnpjpagador','valordodocumento','valorcobrado'];
  if(accepted.includes(key))current.fields[key]=row[1]??'';
 }
 finish();
 if(!items.length)throw Error('Nenhuma cobrança encontrada no relatório do Sicoob.');
 if(items.length>1000)throw Error('Divida a importação em até 1.000 cobranças por arquivo.');
 return items.map(({fields:f,line})=>{
  const name=String(f.nomefantasiadobeneficiario||f.nomerazaosocialdobeneficiario||'').trim();
  const extras=[f.nossonumero?'Nosso número: '+f.nossonumero:'',f.instituicaofinanceira?'Instituição financeira: '+f.instituicaofinanceira:'',
   f.nomerazaosocialdopagador?'Pagador: '+f.nomerazaosocialdopagador:''].filter(Boolean);
  return {line,values:{descricao:name,fornecedor:name,cnpj_cpf:f.cpfcnpjbeneficiario||'',
   valor:f.valorcobrado!==''&&f.valorcobrado!=null?f.valorcobrado:f.valordodocumento||'',
   vencimento:f.datavencimento??'',numero_documento:f.numerodocumento||'',
   codigo_barras:f.linhadigitavel||'',observacoes:extras.join(' | ')}};
 });
}
/* HSN 8.7 — Importação nativa de "pagamentos-hotel.csv", sem editar a origem.
 * Pagamentos não são baixados automaticamente: usuário precisa autorizá-los na revisão.
 * "Agendada" = programação informada na origem, aguardando assinatura externa.
 */
const hotelHeaders=['vencimento','pagarate','descricao','categoria','fornecedor','parcela','valor','status','pagoem','comprovante','observacao'];
function parseHotelSemicolonCsv(text){
 const rows=[];let row=[],value='',quoted=false;const source=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='"'){
   if(quoted&&source[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
  }else if(!quoted&&c===';'){row.push(value);value='';}
  else if(!quoted&&(c==='\n'||c==='\r')){
   if(c==='\r'&&source[i+1]==='\n')i++;
   row.push(value);if(row.some(x=>String(x).trim()!==''))rows.push(row);
   row=[];value='';
  }else value+=c;
 }
 if(quoted)throw Error('O CSV possui aspas abertas ou foi exportado parcialmente.');
 row.push(value);if(row.some(x=>String(x).trim()!==''))rows.push(row);
 if(rows.length>1001)throw Error('Divida a importação em até 1.000 contas por arquivo.');
 return rows;
}
function hotelColumnIndexes(matrix){
 if(!matrix?.length)return null;
 const columns=(matrix[0]||[]).map(h=>R().normalize(h));
 if(!hotelHeaders.every(h=>columns.includes(h)))return null;
 return Object.fromEntries(hotelHeaders.map(h=>[h,columns.indexOf(h)]));
}
function isHotelPaymentsReport(matrix){return !!hotelColumnIndexes(matrix);}
function hotelStatus(raw){
 const value=R().normalize(raw);
 const result={agendada:'scheduled_signature',pendentedeassinatura:'awaiting_signature',pendente:'pending',atrasada:'pending',paga:'pending'}[value];
 if(!result)throw Error('Status desconhecido: '+String(raw||'(vazio)'));
 return {workflow:result,original:String(raw||'').trim(),wasPaid:value==='paga',wasScheduled:value==='agendada'};
}
function hotelFingerprint(parts){
 const joined=parts.map(x=>R().normalize(x)).join('|');
 let a=2166136261,b=2166136261^0x9e3779b9;
 for(let i=0;i<joined.length;i++){
  const c=joined.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);
 }
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function renderHotelPaymentsMapping(matrix){
 hotelImport=true;hotelMatrix=matrix;importModule='payables';
 const destination=document.querySelector('[name="import_module"]');if(destination)destination.value='payables';
 const box=$('import-mapping');box.replaceChildren();
 const idx=hotelColumnIndexes(matrix);if(!idx)throw Error('Cabeçalho do relatório de pagamentos não reconhecido.');
 const rows=matrix.slice(1).filter(row=>row.some(v=>String(v??'').trim()));
 const count=new Map();for(const row of rows){const state=String(row[idx.status]||'').trim()||'Sem status';count.set(state,(count.get(state)||0)+1);}
 box.append(el('h3','Relatório de pagamentos do hotel reconhecido'),
  el('p',rows.length+' contas encontradas · '+[...count].map(([name,n])=>name+': '+n).join(' · '),'hint'),
  el('p','Importação direta das colunas do arquivo: descrição, categoria, fornecedor, valor, vencimento, pagar até, parcela, status e observação. CNPJ não consta neste relatório; não será inventado.','muted'),
  el('p','Agendada será cadastrada como “Programado e pendente de assinatura”. “Pagar até” será a data planejada, sujeita à sua conferência. Registros “Paga” ficam desmarcados inicialmente. Você poderá selecioná-los e autorizar baixa com a data que consta no CSV, sem anexo obrigatório.','hint'));
 box.append(button('Conferir '+rows.length+' contas antes de importar',()=>prepareHotelPaymentsImport(matrix)));
}
function prepareHotelPaymentsImport(matrix){
 try{
  const idx=hotelColumnIndexes(matrix);if(!idx)throw Error('Cabeçalho não reconhecido.');
  const source=matrix.slice(1).filter(row=>row.some(v=>String(v??'').trim()));
  if(source.length>1000)throw Error('O máximo é de 1.000 contas.');
  importRows=[];const seen=new Set();
  for(let i=0;i<source.length;i++){
   const row=source[i],get=k=>String(row[idx[k]]??'').trim();
   const entry={id:crypto.randomUUID(),line:i+2,payload:null,error:'',suspects:[],selected:false,ack:false,ackPaid:false,importPaid:false,hotel:true};
   try{
    const title=get('descricao'),provider=(get('fornecedor')||title),category=get('categoria')||'Outros';
    if(!title||!provider)throw Error('Descrição/fornecedor obrigatórios');
    if(title.length>180||provider.length>180||category.length>80)throw Error('Descrição, fornecedor ou categoria muito longos.');
    const due=R().date(get('vencimento'),v=>XLSX.SSF.parse_date_code(v));
    const payUntil=get('pagarate')?R().date(get('pagarate'),v=>XLSX.SSF.parse_date_code(v)):due;
    const amount=R().currency(get('valor')),status=hotelStatus(get('status'));
    const paidOn=get('pagoem')?R().date(get('pagoem'),v=>XLSX.SSF.parse_date_code(v)):'';
    const parcel=get('parcela'),proof=get('comprovante'),memo=get('observacao');
    const fingerprint=hotelFingerprint([title,provider,category,due,amount.toFixed(2),parcel]);
    const marker='HSN-CSV:'+fingerprint;
    const notes=['Importação CSV de pagamentos do hotel',marker,'Status no arquivo: '+status.original,
     'Pagar até: '+D().br(payUntil),parcel?'Parcela: '+parcel:'',paidOn?'Pago em (declarado na origem): '+D().br(paidOn):'',
     proof?'Referência de comprovante no arquivo (não anexado): '+proof:'',memo?'Observação: '+memo:''].filter(Boolean).join(' | ');
    if(notes.length>2000)throw Error('Observações excedem 2.000 caracteres.');
    const already=data.payables.some(p=>String(p.notes||'').includes(marker));
    if(seen.has(marker))throw Error('Linha repetida neste arquivo; revise para evitar duplicar contas.');
    seen.add(marker);
    entry.fingerprint=fingerprint;entry.wasPaid=status.wasPaid;entry.paidOn=paidOn;entry.originalStatus=status.original;
    entry.category=category;entry.provider=provider;
    entry.payload={id:entry.id,title,supplier_name:provider,type_name:category,
     competence:due.slice(0,7)+'-01',original_due_date:due,due_date:due,due_rule:'keep',
     estimated_amount:amount,actual_amount:amount,document_number:'',barcode:'',notes,
     workflow_status:status.workflow,workflow_note:'Status informado na importação: '+status.original,
     bank_scheduled_date:status.wasScheduled?payUntil:null,required_documents:['boleto'],payment_status:'open',paid_date:null};
    entry.error=already?'Conta já importada anteriormente (identificador encontrado).':'';
    entry.suspects=R().suspects(entry.payload,existing(),data.suppliers);
    entry.selected=!entry.error&&!status.wasPaid&&!entry.suspects.length;
   }catch(e){entry.error=e.message;}
   importRows.push(entry);
  }
  $('import-info').textContent=importFile+' · '+importRows.length+' contas identificadas. Nenhuma foi salva. Selecione e confirme apenas os lançamentos desejados.';
  renderImportReview();$('import-dialog').showModal();
 }catch(e){failure(e);}
}
function renderHotelImportReview(){
 const container=$('import-review');container.replaceChildren();
 const toolbar=el('div',undefined,'hsn87-import-toolbar');
 const counter=el('strong','', 'hsn87-import-counter');
 function refreshCounter(){const rows=importRows.filter(r=>r.selected&&!r.error);counter.textContent=rows.length+' selecionada(s) · '+money(rows.reduce((n,r)=>n+Number(r.payload.actual_amount),0));}
 toolbar.append(el('p','As pagas na origem permanecem desmarcadas inicialmente. Se desejar, selecione-as e autorize a baixa usando as datas do CSV; anexo é opcional, mas a confirmação será registrada.','hint'));
 const actions=el('div',undefined,'hsn87-import-actions');
 actions.append(button('Selecionar não pagas válidas',()=>{for(const r of importRows)r.selected=!r.error&&!r.wasPaid&&!r.suspects.length;renderHotelImportReview();},'secondary'));
 actions.append(button('Selecionar pagas (sem baixa automática)',()=>{for(const r of importRows)r.selected=!r.error&&r.wasPaid&&!r.suspects.length;renderHotelImportReview();},'secondary'));
 actions.append(button('Autorizar baixa das pagas selecionadas',()=>{const paidRows=importRows.filter(r=>r.selected&&!r.error&&r.wasPaid&&r.paidOn);if(!paidRows.length){notice('Selecione contas pagas no CSV que tenham a data de pagamento.',true);return;}const total=paidRows.reduce((n,r)=>n+Number(r.payload.actual_amount),0);if(!confirm('AUTORIZAR BAIXAS DO CSV\n\n'+paidRows.length+' contas · '+money(total)+'\n\nConfirma que essas contas foram EFETIVAMENTE PAGAS e que as datas informadas no arquivo estão corretas? Nenhum pagamento bancário será executado.'))return;paidRows.forEach(r=>{r.importPaid=true;r.ackPaid=true;});renderHotelImportReview();},'secondary'));
 actions.append(button('Desmarcar todas',()=>{for(const r of importRows)r.selected=false;renderHotelImportReview();},'secondary'));
 actions.append(counter);toolbar.append(actions);container.append(toolbar);
 const wrap=el('div',undefined,'hsn87-import-table-wrap');
 const table=el('table',undefined,'account-table hsn87-import-table');const head=el('thead'),hr=el('tr');
 ['Importar','Linha / descrição','Fornecedor / tipo','Vencimento','Valor','Status no arquivo / destino'].forEach(v=>hr.append(el('th',v)));
 head.append(hr);table.append(head);const body=el('tbody');
 for(const r of importRows){
  const tr=el('tr');if(r.error)tr.classList.add('hsn87-import-error');if(r.wasPaid)tr.classList.add('hsn87-import-paid');
  const toggle=el('input');toggle.type='checkbox';toggle.checked=r.selected;toggle.disabled=!!r.error;toggle.setAttribute('aria-label','Selecionar linha '+r.line);toggle.onchange=()=>{r.selected=toggle.checked;refreshCounter();};
  const first=el('td');first.append(toggle);tr.append(first);
  const name=el('td');name.append(el('strong',r.payload?.title||'Linha inválida'));name.append(el('small','Linha '+r.line));if(r.error)name.append(el('small',r.error,'hsn87-error'));tr.append(name);
  const party=el('td');party.append(el('span',r.provider||'—'));party.append(el('small',r.category||''));tr.append(party);
  tr.append(el('td',r.payload?D().br(r.payload.due_date):'—'),el('td',r.payload?money(r.payload.actual_amount):'—'));
  const last=el('td');last.append(el('span',r.originalStatus||'—','hsn87-state'));
  const translation=r.wasPaid?(r.importPaid?'Será registrada como PAGA em '+(r.paidOn?D().br(r.paidOn):'data não informada'):'Será importada como aberta, salvo autorização abaixo'):
   r.payload?.workflow_status==='scheduled_signature'?'Programado · aguardando assinatura':
   r.payload?.workflow_status==='awaiting_signature'?'Pendente de assinatura':
   r.originalStatus==='Atrasada'?'Pendente · prazo vencido':'Pendente';
  last.append(el('small',translation));
  if(!r.error&&r.wasPaid){const ack=el('label','Registrar como PAGA na data do CSV (sem anexo)','hsn87-ack');const ck=el('input');ck.type='checkbox';ck.checked=r.importPaid;ck.disabled=!r.paidOn;ck.onchange=()=>{r.importPaid=ck.checked;r.ackPaid=ck.checked;if(ck.checked)r.selected=true;renderHotelImportReview();};ack.prepend(ck);last.append(ack);if(!r.paidOn)last.append(el('small','O CSV não trouxe data de pagamento. Importe como aberta e depois confira a baixa.','hsn87-error'));}
  if(!r.error&&r.suspects.length){const note=el('small','Possível duplicidade: '+r.suspects.map(h=>h.record.title).slice(0,2).join(', '),'hsn87-error');last.append(note);const ack=el('label','Conferi e autorizo possível duplicidade','hsn87-ack');const ck=el('input');ck.type='checkbox';ck.checked=r.ack;ck.onchange=()=>r.ack=ck.checked;ack.prepend(ck);last.append(ack);}
  tr.append(last);body.append(tr);
 }
 table.append(body);wrap.append(table);container.append(wrap);refreshCounter();
}
function catalogNameKey(name){return R().normalize(name);}
async function ensureHotelCatalog(chosen){
 const suppliers=check(await db.from('suppliers').select('*').eq('owner_id',user.id));
 const types=check(await db.from('account_types').select('*').eq('owner_id',user.id));
 const byName=(list,name)=>list.filter(x=>catalogNameKey(x.legal_name||x.name)===catalogNameKey(name)||catalogNameKey(x.trade_name)===catalogNameKey(name));
 const supplierIds=new Map(),typeIds=new Map();let newSuppliers=0,newTypes=0;
 for(const r of chosen){
  const name=r.provider,key=catalogNameKey(name);if(!supplierIds.has(key)){
   let matches=byName(suppliers,name);
   if(matches.length>1)throw Error('Fornecedor ambíguo: '+name+'. Confira em Cadastros → Fornecedores.');
   if(!matches.length){const found=check(await db.from('suppliers').select('*').eq('owner_id',user.id));matches=byName(found,name);}
   if(!matches.length){const added=check(await db.from('suppliers').insert({owner_id:user.id,legal_name:name,trade_name:'',tax_id:'',service_type:'',contacts:[]}).select('*'));if(added.length!==1)throw Error('Falha ao criar fornecedor '+name);matches=added;newSuppliers++;}
   supplierIds.set(key,matches[0].id);suppliers.push(matches[0]);
  }
  const tname=r.category,tkey=catalogNameKey(tname);if(!typeIds.has(tkey)){
   let matches=types.filter(t=>catalogNameKey(t.name)===tkey);
   if(matches.length>1)throw Error('Tipo ambíguo: '+tname);
   if(!matches.length){const found=check(await db.from('account_types').select('*').eq('owner_id',user.id));matches=found.filter(t=>catalogNameKey(t.name)===tkey);}
   if(!matches.length){const added=check(await db.from('account_types').insert({owner_id:user.id,name:tname,color:'#f97316'}).select('*'));if(added.length!==1)throw Error('Falha ao criar tipo '+tname);matches=added;newTypes++;}
   typeIds.set(tkey,matches[0].id);types.push(matches[0]);
  }
 }
 return {supplierIds,typeIds,newSuppliers,newTypes};
}
async function confirmHotelPaymentsImport(){
 await operation(async()=>{
  const chosen=importRows.filter(r=>r.selected&&!r.error);
  if(!chosen.length)throw Error('Selecione ao menos uma conta válida.');
  if(chosen.some(r=>r.importPaid&&(!r.ackPaid||!r.paidOn)))throw Error('Para importar como paga, confirme a data de pagamento da origem.');
  if(chosen.some(r=>r.suspects.length&&!r.ack))throw Error('Confirme possíveis duplicidades ou desmarque as linhas.');
  const unique=new Set(chosen.map(r=>r.fingerprint));if(unique.size!==chosen.length)throw Error('Existem linhas idênticas selecionadas.');
  const probe=await db.from('payables').select('workflow_status').limit(1);
  if(probe.error)throw Error('Não encontrei o campo de etapa bancária. Execute primeiro o SQL do HSN 8.6 no Supabase e tente novamente. Nenhuma conta foi importada.');
  const [freshPayables,freshDda]=await Promise.all([HSN_FINANCE.all('payables'),HSN_FINANCE.all('dda_charges')]);
  const current=[...freshPayables.map(p=>({...p,module:'Contas'})),...freshDda.map(p=>({...p,module:'DDA'}))];
  for(const r of chosen){
   if(freshPayables.some(p=>String(p.notes||'').includes('HSN-CSV:'+r.fingerprint))){r.error='Conta já importada anteriormente.';r.selected=false;renderImportReview();throw Error('O arquivo já foi importado parcialmente. As contas existentes foram desmarcadas; confira a seleção.');}
   const fresh=R().suspects(r.payload,current,data.suppliers);
   if(fresh.length&&!r.ack){r.suspects=fresh;renderImportReview();throw Error('Possíveis duplicidades detectadas. Confira e autorize individualmente.');}
  }
  const total=chosen.reduce((n,r)=>n+Number(r.payload.actual_amount),0),paid=chosen.filter(r=>r.importPaid).length;
  if(!confirm('CONFIRMAR IMPORTAÇÃO\n\n'+chosen.length+' contas · '+money(total)+'\n'+paid+' serão REGISTRADAS COMO PAGAS nas datas informadas no CSV, mesmo sem comprovante anexo.\n\nConfirma que esses '+paid+' pagamentos efetivamente ocorreram? Nenhuma transferência será executada no banco.'))return;
  const catalog=await ensureHotelCatalog(chosen);
  const payloads=chosen.map(r=>{
   const {id,supplier_name,type_name,...values}=r.payload;
   const paid=r.importPaid&&r.paidOn;
   const audit=paid?'[BAIXA CSV HSN 8.8 · '+new Date().toISOString()+' · operador '+user.id+' · confirmado na prévia · pagamento declarado em '+r.paidOn+' · SEM COMPROVANTE ANEXADO]':'';
   return {...values,id,owner_id:user.id,supplier_id:catalog.supplierIds.get(catalogNameKey(r.provider)),type_id:catalog.typeIds.get(catalogNameKey(r.category)),payment_status:paid?'paid':'open',paid_date:paid?r.paidOn:null,workflow_note:(values.workflow_note+(audit?'\n'+audit:'')).slice(0,2000)};
  });
  // Uma única inserção de contas evita lote parcialmente gravado. Catálogos criados
  // permanecem reutilizáveis mesmo que a inserção das contas falhe.
  const added=check(await db.from('payables').insert(payloads).select('id'));
  if(added.length!==payloads.length)throw Error('Resposta de importação incompleta. Atualize os registros antes de repetir o arquivo.');
  $('import-dialog').close();hotelImport=false;hotelMatrix=null;
  await HSN_FINANCE.load(view);
  notice(added.length+' conta(s) importada(s), '+paid+' com baixa confirmada · '+catalog.newSuppliers+' fornecedor(es) novo(s) · '+catalog.newTypes+' tipo(s) novo(s).');
 });
}
function renderMapping(sheetName=workbook.SheetNames[0]){const box=$('import-mapping');box.replaceChildren();const sheet=select4(box,'sheet','Aba',workbook.SheetNames.map(s=>[s,s]),sheetName);sheet.onchange=()=>renderMapping(sheet.value);const matrix=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:true});if(matrix.length<1){box.append(el('p','Aba vazia.'));return;}if(isHotelPaymentsReport(matrix)){renderHotelPaymentsMapping(matrix);return;}hotelImport=false;if(isSicoobDdaReport(matrix)){
 const items=parseSicoobDdaReport(matrix);
 if(importModule!=='dda'){
  importModule='dda';
  const destination=document.querySelector('[name="import_module"]');if(destination)destination.value='dda';
 }
 box.append(el('h3','Relatório DDA do Sicoob reconhecido'),
  el('p',items.length+' cobrança(s) encontradas. O destino foi definido como DDA não conferido.','hint'),
  el('p','Os valores são lidos individualmente no campo "Valor cobrado". O total de títulos selecionados do rodapé do banco pode não corresponder à soma de todos os títulos exibidos.','muted'));
 const table=el('table',undefined,'account-table'),head=el('thead'),tr=el('tr');
 for(const h of ['Linha','Beneficiário','Número documento','Valor','Vencimento'])tr.append(el('th',h));
 head.append(tr);table.append(head);const body=el('tbody');
 for(const item of items){const f=item.values,r=el('tr');let dateText=String(f.vencimento);
  try{dateText=D().br(R().date(f.vencimento,v=>XLSX.SSF.parse_date_code(v,{date1904:!!workbook.Workbook?.WBProps?.date1904})));}catch{}
  let valueText=String(f.valor);try{valueText=money(R().currency(f.valor));}catch{}
  for(const cell of [item.line,f.fornecedor,f.numero_documento,valueText,dateText])r.append(el('td',cell));body.append(r);
 }
 table.append(body);const wrap=el('div',undefined,'account-table-wrap full-width');wrap.append(table);box.append(wrap);
 box.append(button('Conferir '+items.length+' cobrança(s)',()=>prepareImport(sheetName,matrix,items)));
 return;
 }const header=matrix[0];const options=[['','Não usar'],...header.map((h,i)=>[String(i),String(h||'Coluna '+(i+1))])];const grid=el('div',undefined,'grid');box.append(grid);for(const key of template()){const matches=header.map((h,i)=>[R().normalize(h),i]).filter(([n])=>(aliases[key]||[R().normalize(key)]).includes(n));select4(grid,'map_'+key,key.replace(/_/g,' '),options,matches.length===1?String(matches[0][1]):'');}box.append(el('p','A primeira linha deve conter os títulos. Datas: DD/MM/AAAA, AAAA-MM-DD ou célula de data Excel. CNPJ e código devem ser texto para preservar zeros.','muted'),button('Preparar revisão',()=>prepareImport(sheetName,matrix)));}
function mapValue(row,key){const select=$('import-mapping').querySelector('[name="map_'+key+'"]');return !select||select.value===''?'':row[Number(select.value)]??'';}
function matchSupplier(name,taxId){const match=ddaSupplierMatch(name,taxId);if(match)return match.id;throw Error('Fornecedor não cadastrado ou ambíguo. Use Captar fornecedores do DDA e refaça a revisão.');}
function prepareImport(sheetName,matrix,sicoobItems=null){try{const source=sicoobItems||matrix.slice(1).filter(row=>row.some(v=>v!==''&&v!==null));if(source.length>1000)throw Error('Divida a importação em até 1.000 linhas por lote.');importRows=[];for(let i=0;i<source.length;i++){const raw=source[i],row=sicoobItems?raw.values:raw,entry={id:crypto.randomUUID(),line:sicoobItems?raw.line:i+2,payload:null,error:'',suspects:[],selected:false,ack:false};try{const get=k=>sicoobItems?(row[k]??''):mapValue(row,k);const supplierName=String(get('fornecedor')).trim(),taxId=R().tax(get('cnpj_cpf')),date=R().date(get('vencimento'),v=>XLSX.SSF.parse_date_code(v,{date1904:!!workbook.Workbook?.WBProps?.date1904})),barcode=String(get('codigo_barras')||'').replace(/[\s.\-]/g,'');if(barcode)HSN_BOLETOS.read(barcode);const description=String(get('descricao')||supplierName).trim();if(!supplierName||!description)throw Error('Fornecedor/descrição obrigatórios');if(taxId&&!/^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/.test(taxId))throw Error('CPF/CNPJ inválido ou perdeu zeros na planilha');if(String(get('observacoes')||'').length>2000)throw Error('Observações até 2.000 caracteres');const statusColumn=matrix[0].findIndex(h=>['status','situacao','pagamento'].includes(R().normalize(h)));if(importModule==='payables'&&statusColumn>=0&&['paga','pago','paid'].includes(R().normalize(row[statusColumn])))throw Error('Para importar contas já pagas com confirmação, use o importador CSV do hotel. Neste modelo genérico, importe como aberta para depois conferir a baixa');if(description.length>180||supplierName.length>180)throw Error('Descrição/nome até 180 caracteres');let payload;if(importModule==='dda'){payload={title:description,supplier_name:supplierName,tax_id:taxId,amount:R().currency(get('valor')),due_date:date,document_number:String(get('numero_documento')||''),barcode,notes:String(get('observacoes')||''),source_file:importFile};}else{const typeMatches=data.types.filter(t=>R().normalize(t.name)===R().normalize(get('tipo')));if(typeMatches.length!==1)throw Error('Tipo não cadastrado ou ambíguo');const estimated=get('valor_estimado'),actual=get('valor_real');payload={title:description,supplier_id:matchSupplier(supplierName,taxId),type_id:typeMatches[0].id,competence:R().competence(get('competencia')),original_due_date:date,due_date:date,due_rule:'keep',estimated_amount:estimated!==''?R().currency(estimated):actual!==''?R().currency(actual):0,actual_amount:actual!==''?R().currency(actual):null,document_number:String(get('numero_documento')||''),barcode,notes:String(get('observacoes')||'')};if(estimated===''&&actual==='')throw Error('Informe valor estimado ou real');}entry.payload={...payload,id:entry.id};entry.suspects=R().suspects(payload,[...existing(),...importRows.filter(r=>r.payload).map(r=>({...r.payload,module:'Este arquivo'}))],data.suppliers);}catch(e){entry.error=e.message;}importRows.push(entry);}$('import-info').textContent=importFile+' · '+sheetName+' · '+importRows.length+' linhas. Nenhuma foi salva. Marque as linhas que deseja importar; suspeitas exigem confirmação própria.';renderImportReview();$('import-dialog').showModal();}catch(e){failure(e);}}
function renderImportReview(){if(hotelImport)return renderHotelImportReview();const container=$('import-review');container.replaceChildren();for(const r of importRows){const box=el('section',undefined,'card');const label=el('label','Linha '+r.line+' · '+(r.payload?.title||'Erro de leitura')),select=el('input');select.type='checkbox';select.checked=r.selected;select.disabled=!!r.error;select.onchange=()=>{r.selected=select.checked;};label.prepend(select);label.className='read-note-choice';box.append(label);if(r.error)box.append(el('p',r.error,'hint'));else{box.append(el('p',(r.payload.supplier_name||supplierOf(r.payload)?.legal_name||'')+' · '+D().br(r.payload.due_date)+' · '+money(r.payload.actual_amount??r.payload.amount??r.payload.estimated_amount)));if(r.suspects.length){box.append(el('p','Possíveis duplicidades:\n'+r.suspects.map(h=>h.record.module+' · '+h.record.title+' · '+h.reasons.join(', ')).join('\n'),'hint'));const ackLabel=el('label','Conferi a suspeita e autorizo incluir esta linha mesmo assim'),ack=el('input');ack.type='checkbox';ack.checked=r.ack;ack.onchange=()=>{r.ack=ack.checked;};ackLabel.prepend(ack);ackLabel.className='read-note-choice';box.append(ackLabel);}}container.append(box);} }
async function confirmImport(){if(hotelImport)return confirmHotelPaymentsImport();await operation(async()=>{const chosen=importRows.filter(r=>r.selected&&!r.error);if(!chosen.length)throw Error('Marque ao menos uma linha válida.');if(chosen.some(r=>r.suspects.length&&!r.ack))throw Error('Confirme cada suspeita de duplicidade ou desmarque a linha.');const table=importModule==='dda'?'dda_charges':'payables';const [freshPayables,freshDda]=await Promise.all([HSN_FINANCE.all('payables'),HSN_FINANCE.all('dda_charges')]);const current=[...freshPayables.map(r=>({...r,module:'Contas'})),...freshDda.map(r=>({...r,module:'DDA'}))];const currentIds=new Set((importModule==='dda'?freshDda:freshPayables).map(r=>r.id));const pending=chosen.filter(r=>!currentIds.has(r.id));for(const r of pending){const fresh=R().suspects(r.payload,current,data.suppliers);const oldKeys=new Set(r.suspects.map(h=>h.record.id));if(fresh.some(h=>!oldKeys.has(h.record.id))){r.suspects=fresh;r.ack=false;renderImportReview();throw Error('Surgiram novas suspeitas desde a revisão. Confira e confirme novamente.');}}if(!pending.length){notice('As linhas selecionadas já estavam salvas. Nenhuma foi duplicada.');$('import-dialog').close();return;}if(!confirm('Importar '+pending.length+' linha(s) para '+(importModule==='dda'?'DDA não conferido':'contas abertas')+'? Não será registrado pagamento.'))return;const inserted=check(await db.from(table).insert(pending.map(r=>({...r.payload,owner_id:user.id}))).select('id'));if(inserted.length!==pending.length)throw Error('Resposta incompleta. Atualize antes de tentar novamente.');$('import-dialog').close();let vendorMessage='';let vendorError=false;
 if(importModule==='dda'){try{const summary=await captureSuppliersFromDda(pending.map(r=>r.payload));vendorMessage=' '+captureSummary(summary);vendorError=summary.problems.length>0;}catch(e){vendorMessage=' Os DDA foram salvos, mas a captura de fornecedores falhou: '+e.message;vendorError=true;}}
 await HSN_FINANCE.load(view);notice(inserted.length+' registro(s) importado(s).'+vendorMessage,vendorError);});}
function reportRows(){D().parse(reportStart);D().parse(reportEnd);if(reportEnd<reportStart)throw Error('Data final anterior à inicial.');if(reportModule==='payables')return R().report(data.payables,{start:reportStart,end:reportEnd,typeId:reportType,supplierId:reportSupplier,status:reportStatus});if(reportModule==='dda')return dda.filter(c=>!c.archived&&c.due_date>=reportStart&&c.due_date<=reportEnd&&(!reportStatus||state(c)===reportStatus)).sort((a,b)=>a.due_date.localeCompare(b.due_date));return HSN_PHASE3.commissionRecords().filter(c=>!c.archived&&c.due_date>=reportStart&&c.due_date<=reportEnd&&(!reportStatus||c.review_status===reportStatus)).sort((a,b)=>a.due_date.localeCompare(b.due_date));}
function exportData(list,module=reportModule){if(module==='payables')return list.map(p=>({id:p.id,descricao:p.title,fornecedor:supplierOf(p)?.legal_name||'',cnpj_cpf:supplierOf(p)?.tax_id||'',tipo:data.types.find(t=>t.id===p.type_id)?.name||'',competencia:p.competence.slice(0,7),vencimento:p.due_date,vencimento_original:p.original_due_date,valor_estimado:Number(p.estimated_amount),valor_real:p.actual_amount===null?'':Number(p.actual_amount),valor_utilizado:Number(p.actual_amount??p.estimated_amount),status:({paid:'Paga',overdue:'Vencida',today:'Vence hoje',upcoming:'A vencer'})[D().status(p)],data_pagamento:p.paid_date||'',numero_documento:p.document_number,codigo_barras:p.barcode,observacoes:p.notes}));if(module==='dda')return list.map(c=>({id:c.id,descricao:c.title,fornecedor:c.supplier_name,cnpj_cpf:c.tax_id,vencimento:c.due_date,valor:Number(c.amount),numero_documento:c.document_number,codigo_barras:c.barcode,conferencia:stateNames[state(c)],conta_vinculada:c.converted_payable_id||'',origem:c.source_file,observacoes:c.notes}));return list.map(c=>({id:c.id,descricao:c.title,agencia:c.agency_name,competencia:c.competence.slice(0,7),prazo_conferencia:c.due_date,valor:Number(c.amount),situacao:({pending:'Pendente',in_review:'Em conferência',confirmed:'Conferida'})[c.review_status],data_conferencia:c.confirmed_date||'',referencia:c.document_number,observacoes:c.notes}));}
function renderReports(){const controls=$('finance-controls');const moduleSelect=select4(controls,'report_module','Módulo',[['payables','Contas a pagar'],['dda','DDA — separado'],['commissions','Comissões — separado']],reportModule);moduleSelect.onchange=()=>{reportModule=moduleSelect.value;reportStatus='';reportType='';reportSupplier='';render();};const start=field4(controls,'report_start','Vencimentos de',reportStart,'date',true),end=field4(controls,'report_end','Até',reportEnd,'date',true);start.onchange=()=>{reportStart=start.value;render();};end.onchange=()=>{reportEnd=end.value;render();};if(reportModule==='payables'){const type=select4(controls,'report_type','Tipo',[['','Todos'],...data.types.map(t=>[t.id,t.name])],reportType);type.onchange=()=>{reportType=type.value;render();};const supplier=select4(controls,'report_supplier','Fornecedor',[['','Todos'],...data.suppliers.map(s=>[s.id,supplierLabel(s)])],reportSupplier);supplier.onchange=()=>{reportSupplier=supplier.value;render();};}
 const options=reportModule==='payables'?[['paid','Paga'],['overdue','Vencida'],['today','Vence hoje'],['upcoming','A vencer']]:reportModule==='dda'?Object.entries(stateNames):[['pending','Pendente'],['in_review','Em conferência'],['confirmed','Conferida']];const status=select4(controls,'report_status','Situação',[['','Todas'],...options],reportStatus);status.onchange=()=>{reportStatus=status.value;render();};controls.append(button('Exportar Excel',exportExcel),button('Gerar PDF',exportPdf));if(reportModule==='payables')controls.append(button('Fechamento mensal PDF',closingPdf));try{const list=reportRows(),box=el('section',undefined,'card full-width');box.append(el('h3',(reportModule==='payables'?'Contas a pagar':reportModule==='dda'?'DDA':'Comissões')+' · '+list.length+' registro(s)'));if(reportModule==='payables'){const totals=R().totals(list);box.append(el('p','Pago: '+money(totals.paid)+' · Pendente: '+money(totals.pending)),el('p','Valores reais quando informados; senão, estimados. Nenhuma comissão ou DDA entra nestes totais.','muted'));}else box.append(el('p','Relatório exclusivo deste módulo. Não representa o total de contas a pagar.','muted'));$('records').append(box);const table=el('table',undefined,'account-table'),thead=el('thead'),tr=el('tr');for(const label of ['Descrição','Fornecedor / agência','Data','Valor','Situação'])tr.append(el('th',label));thead.append(tr);table.append(thead);const tbody=el('tbody');for(const r of list){const row=el('tr');const cells=[r.title,reportModule==='payables'?(supplierOf(r)?.legal_name||''):reportModule==='dda'?r.supplier_name:r.agency_name,D().br(r.due_date),money(reportModule==='payables'?(r.actual_amount??r.estimated_amount):r.amount),reportModule==='payables'?D().status(r):reportModule==='dda'?stateNames[state(r)]:({pending:'Pendente',in_review:'Em conferência',confirmed:'Conferida'})[r.review_status]];cells.forEach((v,i)=>{const td=el('td',v);td.dataset.label=['Descrição','Fornecedor','Data','Valor','Situação'][i];row.append(td);});tbody.append(row);}table.append(tbody);const wrap=el('div',undefined,'account-table-wrap full-width');wrap.append(table);$('records').append(wrap);}catch(e){$('records').append(el('p',e.message));}}
async function exportExcel(){try{const list=reportRows();await library('xlsx');const ws=XLSX.utils.json_to_sheet(exportData(list));ws['!cols']=Array.from({length:20},()=>({wch:24}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,reportModule==='payables'?'Contas':reportModule==='dda'?'DDA':'Comissoes');XLSX.writeFile(wb,'HSN-'+reportModule+'-'+reportStart+'-'+reportEnd+'.xlsx');}catch(e){failure(e);}}
async function createPdf(title,subtitle,sections,filename){await library('pdf');await library('table');const doc=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});if(typeof doc.autoTable!=='function')throw Error('Plugin de tabela PDF não carregou.');doc.setFillColor(28,35,45);doc.rect(0,0,297,23,'F');doc.setTextColor(255);doc.setFontSize(17);doc.text('Financeiro HSN',14,12);doc.setFontSize(9);doc.text('Hotel Serra Negra',14,18);doc.setTextColor(40);doc.setFontSize(13);doc.text(title,14,32);doc.setFontSize(9);let y=40;for(const line of doc.splitTextToSize(subtitle,268)){doc.text(line,14,y);y+=5;}for(const section of sections){if(y>175){doc.addPage();y=18;}doc.setFontSize(11);doc.text(section.title,14,y);doc.autoTable({startY:y+4,head:[section.head],body:section.body,theme:'striped',styles:{font:'helvetica',fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[229,119,34],textColor:255},alternateRowStyles:{fillColor:[248,249,251]},margin:{left:14,right:14,bottom:15}});y=(doc.lastAutoTable?.finalY||y+10)+14;}const pages=doc.getNumberOfPages();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setFontSize(8);doc.setTextColor(120);doc.text('Gerado em '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date()),14,202);doc.text(n+'/'+pages,280,202);}doc.save(filename);}
function pdfBody(list,module=reportModule){return list.map(r=>[r.title,module==='payables'?supplierOf(r)?.legal_name||'':module==='dda'?r.supplier_name:r.agency_name,D().br(r.due_date),money(module==='payables'?(r.actual_amount??r.estimated_amount):r.amount),module==='payables'?({paid:'Paga',overdue:'Vencida',today:'Vence hoje',upcoming:'A vencer'})[D().status(r)]:module==='dda'?stateNames[state(r)]:({pending:'Pendente',in_review:'Em conferência',confirmed:'Conferida'})[r.review_status],module==='payables'?(r.actual_amount===null?'Estimado':'Real'):module==='dda'?(r.converted_payable_id?'Conta vinculada':'Origem DDA'):'Conferência']);}
async function exportPdf(){try{const list=reportRows(),label=reportModule==='payables'?'Contas a pagar':reportModule==='dda'?'DDA — cobranças':'Comissões — conferência',totals=reportModule==='payables'?R().totals(list):null;const subtitle='Período de vencimento/conferência: '+D().br(reportStart)+' a '+D().br(reportEnd)+'. '+(totals?'Pago '+money(totals.paid)+' · Pendente '+money(totals.pending)+'. Valores estimados identificados.':'Relatório exclusivo do módulo, sem soma com contas a pagar.');await createPdf(label,subtitle,[{title:'Registros nos filtros selecionados',head:['Descrição','Fornecedor / agência','Data','Valor','Situação','Origem do valor'],body:pdfBody(list)}],'HSN-'+reportModule+'-'+reportStart+'-'+reportEnd+'.pdf');}catch(e){failure(e);}}
async function closingPdf(){const month=prompt('Competência do fechamento (AAAA-MM):',reportStart.slice(0,7));if(month===null)return;try{const competence=R().competence(month),previous=D().add(competence,-1).slice(0,7)+'-01',current=data.payables.filter(p=>!p.archived&&p.competence===competence),old=data.payables.filter(p=>!p.archived&&p.competence===previous),a=R().totals(current),b=R().totals(old),change=b.total===0?'Base anterior zero; sem percentual':((a.total-b.total)/b.total*100).toFixed(1).replace('.',',')+'%';await createPdf('Fechamento de contas · '+month,'Por competência, incluindo todas as contas ativas do mês. Filtros da tela de relatórios não se aplicam ao fechamento. Comissões e DDA não entram. Comparação com '+previous.slice(0,7)+': '+change,[{title:'Comparação mensal',head:['Indicador',month,previous.slice(0,7)],body:[['Pago',money(a.paid),money(b.paid)],['Pendente',money(a.pending),money(b.pending)],['Total',money(a.total),money(b.total)]]},{title:'Contas pagas',head:['Descrição','Fornecedor','Vencimento','Valor','Situação','Valor'],body:pdfBody(current.filter(p=>p.payment_status==='paid'),'payables')},{title:'Contas pendentes',head:['Descrição','Fornecedor','Vencimento','Valor','Situação','Valor'],body:pdfBody(current.filter(p=>p.payment_status!=='paid'),'payables')}],'HSN-Fechamento-'+month+'.pdf');}catch(e){failure(e);}}
function addAlerts(){const pending=dda.filter(c=>!c.archived&&!c.reviewed&&!c.converted_payable_id);if(!pending.length)return;const section=el('section',undefined,'card full-width dda-card');section.append(el('h3','DDA · '+pending.length+' cobrança(s) não conferida(s)'),el('p','Aviso separado de contas e comissões. Confira antes de converter.'),button('Abrir DDA',()=>{view='dda';render();},'dda-button'));$('records').append(section);}
function calendarEvents(month){return dda.filter(c=>!c.archived&&!c.converted_payable_id&&c.due_date.slice(0,7)===month&&[c.title,c.supplier_name].join(' ').toLocaleLowerCase('pt-BR').includes($('search').value.toLocaleLowerCase('pt-BR')));}
function calendar(month,mode){const module=HSN_PHASE3.getCalendarModule();if(!['all','dda'].includes(module))return;const events=calendarEvents(month);const section=el('section',undefined,'card full-width dda-card');section.append(el('h3','◆ DDA · '+events.length+' cobrança(s) sem conversão'),el('p','Convertidas não aparecem como novo compromisso DDA; a conta vinculada aparece no calendário de contas. Nenhum total é somado.','muted'));if(mode==='month'){for(const c of events){const cell=document.querySelector('.day[data-date="'+c.due_date+'"]');if(cell)cell.append(button('◆ '+c.title+' · '+money(c.amount),()=>openDda(c),'calendar-event dda-event'));}$('commission-calendar-summary').append(section);}else{$('records').append(section);events.forEach(c=>$('records').append(ddaCard(c)));}}
function wire(){$('phase4-form').onsubmit=saveForm;$('phase4-close').onclick=()=>{if(!busy)$('phase4-dialog').close();};$('import-close').onclick=()=>{if(!busy)$('import-dialog').close();};$('import-confirm').onclick=confirmImport;for(const id of ['phase4-dialog','import-dialog'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault();});}
document.addEventListener('DOMContentLoaded',wire);
root.HSN_PHASE4={handles,requests,receive,reset,render,editor,addAlerts,calendar};
})(window);
