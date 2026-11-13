/* HSN 10 — dados existentes + livro de baixas, sem um segundo cadastro de dívidas. */
window.HSN_WORKSPACE=(()=>{'use strict';
 const M=()=>HSN_MONEY,$=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const names={open:'Em aberto',overdue:'Vencido',today:'Vence hoje',partial:'Parcial',paid:'Quitado',cancelled:'Cancelado'};
 const docsNames={extrato:'Extrato da hospedagem',voucher:'Voucher',nota_fiscal:'Nota fiscal',boleto:'Boleto'};
 let state={receivables:[],payables:[],events:[],bank:[],imports:[],audit:[]},ready=false,loading=0;
 let start='',end='',company='',filter='',search='',active='dashboard',mutation=false;
 function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function btn(text,fn,cls='secondary'){const n=el('button',text,cls);n.type='button';n.onclick=()=>Promise.resolve().then(fn).catch(failure);return n;}
 function check(r){if(r.error)throw r.error;return r.data;}
 async function all(table){let rows=[];for(let i=0;;i+=1000){const batch=check(await db.from(table).select('*').eq('owner_id',user.id).order('id').range(i,i+999));rows.push(...batch);if(batch.length<1000)break;}return rows;}
 function reset(){loading++;ready=false;mutation=false;state={receivables:[],payables:[],events:[],bank:[],imports:[],audit:[]};start=end=company=filter=search='';document.querySelectorAll('.hsn10-dialog').forEach(d=>d.remove());}
 const handles=v=>['dashboard','receivables','hotel_billing','receipts_reconciliation','reconciliation','financial_history'].includes(v);
 async function load(v){
  active=v==='reconciliation'?'receipts_reconciliation':v;const token=++loading;ready=false;setup('Carregando…');
  try{
   const [receivables,payables,events,bank,imports,audit,suppliers]=await Promise.all(['sicoob_collections','payables','hsn10_events','hsn10_bank_transactions','hsn10_import_batches','hsn10_audit','suppliers'].map(all));
   if(token!==loading||!user||view!==v)return;
   state={receivables,payables:payables.map(p=>({...p,company_name:suppliers.find(s=>s.id===p.supplier_id)?.trade_name||suppliers.find(s=>s.id===p.supplier_id)?.legal_name||''})),events,bank,imports,audit};ready=true;
   start ||= M().today().slice(0,7)+'-01';end ||= HSN_DATES.monthDay(start.slice(0,7),31);render();
  }catch(e){if(token!==loading)return;setup('Ativar controle financeiro');$('records').append(el('div','Para usar o painel integrado, execute sql/HSN-10-integridade-financeira.sql no Supabase após o backup. Os módulos anteriores continuam disponíveis. Detalhe: '+e.message,'hsn10-warning'));}
 }
 function setup(title){
  $('view-title').textContent=title;$('view-description').textContent='Dívida, envio e dinheiro confirmado em etapas separadas.';$('new').hidden=true;$('search').closest('.search-wrap').hidden=true;
  for(const id of ['summary','finance-controls','records','calendar-board','commission-calendar-summary'])$(id).replaceChildren();
  $('records').className='records hsn10-workspace';$('summary').classList.remove('sicoob-summary');
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===active));
 }
 function field(parent,name,label,value='',type='text',required=false){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');i.name=name;if(type!=='textarea')i.type=type;i.value=value??'';i.required=required;i.maxLength=type==='textarea'?2000:180;if(type==='number'){i.step='.01';i.min='.01';}l.append(i);parent.append(l);return i;}
 function select(parent,label,opts,value,onchange){const l=el('label',label),s=el('select');for(const [v,t]of opts)s.append(new Option(t,v));s.value=value;s.onchange=()=>onchange(s.value);l.append(s);parent.append(l);return s;}
 function controls(){const c=$('finance-controls');c.className='finance-controls hsn10-filters';
  const a=field(c,'start','Vencimento de / caixa de',start,'date'),b=field(c,'end','Até',end,'date');
  a.onchange=()=>{start=a.value||'0001-01-01';render();};b.onchange=()=>{end=b.value||'9999-12-31';render();};
  const parties=[...new Set([...state.receivables.map(r=>r.company),...state.payables.map(r=>r.company_name)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  select(c,'Empresa / fornecedor',[['','Todas'],...parties.map(p=>[p,p])],company,v=>{company=v;render();});
  if(active==='receivables')select(c,'Situação',[['','Todas'],...Object.entries(names)],filter,v=>{filter=v;render();});
  const q=field(c,'query','Buscar hóspede, empresa ou referência',search);q.type='search';q.oninput=()=>{search=q.value;drawContent();};
  c.append(btn('Todos os períodos',()=>{start='0001-01-01';end='9999-12-31';render();}));
 }
 function list(){return state.receivables.filter(r=>(!company||M().norm(r.company)===M().norm(company))&&r.due_date>=start&&r.due_date<=end&&(!filter||M().status(r,'receivable')===filter)&&M().norm([r.company,r.guest_name,r.reference,r.external_reference,r.stay_reference,r.nf_number].join(' ')).includes(M().norm(search)));}
 function stat(label,value,help,cls=''){const c=el('article',null,'stat '+cls);c.append(el('small',label),el('strong',money(value)),el('span',help,'muted'));$('summary').append(c);}
 function render(){if(!ready)return;setup(({dashboard:'Painel financeiro',receivables:'Contas a receber',hotel_billing:'Faturamento do hotel',receipts_reconciliation:'Conferência de recebimentos',financial_history:'Histórico financeiro'})[active]);controls();drawContent();}
 function drawContent(){
  $('records').replaceChildren();$('summary').replaceChildren();
  if(start>end){$('records').append(el('p','A data inicial deve ser anterior à final.','hsn10-warning'));return;}
  const totals=M().summary(state.payables,state.receivables,state.events,{start,end,company});
  stat('A receber',totals.receivable,'Saldo por vencimento');stat('Vencido a receber',totals.overdue,'Saldo vencido dentro do filtro','red');stat('Recebido no período',totals.received,'Baixas menos estornos pela data efetiva','green');stat('A pagar',totals.payable,'Saldo por vencimento, incluindo estimativas');
  const note=el('p','Os saldos usam o vencimento; recebido e pago usam a data da baixa. Emitir ou enviar cobrança não confirma pagamento. Contas arquivadas continuam compondo o saldo.','hsn10-explainer');$('records').append(note);
  if(totals.undated)$('records').append(el('p',totals.undated+' título(s) antigo(s) têm saldo recebido sem data registrada; não entram no caixa por período. Confira o histórico original.','hsn10-warning'));
  if(active==='dashboard')return dashboard(totals);
  if(active==='receipts_reconciliation')return reconciliation();
  if(active==='financial_history')return history();
  const actions=el('div',null,'actions');actions.append(btn('Nova conta a receber',()=>editReceivable()),btn('Cobranças e reenvios Sicoob',()=>navigate('sicoob_collections')),btn('Exportar conferência CSV',()=>exportRows(list())));$('records').append(actions);
  if(active==='hotel_billing')$('records').append(el('p','Confira hospedagem → extrato e voucher → nota fiscal e boleto → envie no check-out → registre a confirmação do envio. O registro de envio não altera o saldo.','hsn10-explainer'));
  const rows=list();if(!rows.length)$('records').append(el('p','Nenhum título para este filtro.'));
  const t=table(['Empresa / hóspede','Hospedagem / documento','Vencimento','Original / recebido / saldo','Situação / faturamento','Ações']);
  for(const r of rows){const tr=el('tr'),b=M().balance(r,'receivable'),st=M().status(r,'receivable');
   const a=el('td');a.append(el('strong',r.company),el('small',r.guest_name||'Hóspede não vinculado'));const stay=el('td');stay.append(el('span',r.stay_reference||'Vincular hospedagem'),el('small',(r.check_in||'—')+' a '+(r.check_out||'—')),el('small','Doc. '+(r.external_reference||'—')+' · Ref. '+r.reference));
   const values=el('td');values.append(el('strong',money(b.total)),el('small','Recebido: '+money(b.paid)),el('strong','Saldo: '+money(b.pending)));
   const situation=el('td');situation.append(el('span',names[st],'hsn10-status '+st),el('small',r.cancelled_at?'Cancelamento: '+r.cancellation_reason:(r.status==='sent'||r.sent_at?'Cobrança enviada':'Cobrança emitida')),el('small',M().billingState(r).label));
   const act=el('td');act.append(btn('Conferir / editar',()=>editReceivable(r)),btn('Histórico e baixas',()=>paymentHistory('receivable',r)));
   if(b.pending>0&&!r.cancelled_at)act.append(btn('Registrar recebimento',()=>payment('receivable',r)));
   if(active==='hotel_billing'&&!r.cancelled_at){act.append(btn('Enviar documentos',()=>{editReceivableForSend(r);}),btn('Registrar envio confirmado',()=>markBilling(r)));}
   if(!b.paid)act.append(btn(r.cancelled_at?'Restaurar título':'Cancelar título',()=>cancel(r)));
   tr.append(a,stay,el('td',HSN_DATES.br(r.due_date)),values,situation,act);t.body.append(tr);
  }$('records').append(t.wrap);
 }
 function table(headings){const wrap=el('div',null,'hsn10-table-wrap'),table=el('table',null,'account-table hsn10-table'),head=el('thead'),tr=el('tr'),body=el('tbody');for(const h of headings)tr.append(el('th',h));head.append(tr);table.append(head,body);wrap.append(table);return {wrap,body};}
 function dashboard(t){
  const panel=el('section',null,'hsn10-panel');panel.append(el('h2','Próximas ações da equipe'));
  const rs=list().filter(r=>!r.cancelled_at),missing=rs.filter(r=>M().billingState(r).key==='stay'||M().missingBilling(r).length),pending=rs.filter(r=>!r.billing_sent_at&&r.check_out&&r.check_out<=M().today());
  const actions=[['Contas a receber',rs.length+' títulos · conferir saldos e pagamentos parciais','receivables'],['Faturamento',missing.length+' com cadastro/documentos faltantes · '+pending.length+' com check-out e envio pendente','hotel_billing'],['Conferir banco',state.bank.filter(b=>!b.payment_id&&b.amount>0).length+' créditos aguardando conciliação','receipts_reconciliation'],['Contas a pagar','Saldo por vencimento: '+money(t.payable),'payables'],['Histórico financeiro','Pagamentos, estornos, alterações e importações','financial_history']];
  for(const [label,help,v]of actions){const b=btn(label+' →',()=>navigate(v),'hsn10-action');b.append(el('small',help));panel.append(b);}panel.append(btn('Baixar cópia dos dados financeiros (JSON)',exportBackup));panel.append(el('p','Pago no período: '+money(t.paid)+' · Cancelado a receber no filtro: '+money(t.cancelled)));$('records').append(panel);
 }
 function navigate(v){if(mutation)return;view=v;active=v;$('search').value='';loadGlobal();}
 function loadGlobal(){return window.HSN_WORKSPACE.handles(view)?load(view):window.HSN_FINANCE.navigate(view);}
 function dialog(title){const d=el('dialog',null,'hsn10-dialog'),f=el('form'),head=el('div',null,'topline'),msg=el('p',null,'hsn10-form-message');msg.setAttribute('role','status');head.append(el('h2',title),btn('Fechar',()=>{if(!mutation)d.remove();}));f.append(head);d.append(f);d.addEventListener('cancel',e=>{if(mutation)e.preventDefault();else d.remove();});document.body.append(d);const content=el('div',null,'grid');f.append(content,msg);return {d,f,content,msg};}
 async function saveDialog(ctx,fn){if(mutation)return;mutation=true;ctx.f.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();ctx.d.remove();if(handles(view))await load(view);}catch(e){ctx.msg.textContent=e.message;}finally{mutation=false;ctx.f.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 function submit(ctx,label,fn){const s=el('button',label);s.type='submit';ctx.f.append(s);ctx.f.onsubmit=e=>{e.preventDefault();saveDialog(ctx,fn);};ctx.d.showModal();}
 function editReceivable(r=null){
  const ctx=dialog(r?'Conferir título e hospedagem':'Nova conta a receber'),c=ctx.content;
  for(const [key,label,type,req]of [['company','Empresa / responsável','text',true],['guest_name','Hóspede(s)','text',false],['reference','Nosso número / referência única','text',true],['external_reference','Número do documento','text',false],['amount','Valor original da dívida (R$)','number',true],['due_date','Vencimento','date',true],['stay_reference','Reserva / hospedagem','text',false],['check_in','Check-in','date',false],['check_out','Check-out','date',false],['nf_number','Número da NF','text',false]])field(c,key,label,r?.[key]??'',type,req);
  c.append(el('p','Documentos: informe número, protocolo ou caminho no arquivo compartilhado. A marcação confirma a conferência pela equipe; não anexa o arquivo.','hsn10-explainer'));
  for(const [key,label]of Object.entries(docsNames))field(c,'doc_'+key,label+' · referência conferida',r?.billing_documents?.[key]||'');
  submit(ctx,'Salvar título e conferência',async()=>{const fd=new FormData(ctx.f),data=Object.fromEntries([...fd].filter(([k])=>!k.startsWith('doc_')));data.amount=Number(data.amount);data.billing_documents=Object.fromEntries(Object.keys(docsNames).map(k=>[k,String(fd.get('doc_'+k)||'').trim()]));check(await db.rpc('hsn10_save_receivable',{p_id:r?.id||null,p_expected_updated_at:r?.updated_at||null,p_data:data}));});
 }
 function payment(kind,r,bank=null){
  const ctx=dialog(kind==='receivable'?'Registrar recebimento confirmado':'Registrar pagamento confirmado'),b=M().balance(r,kind),request=crypto.randomUUID();
  ctx.content.append(el('p',(r.company||r.title)+' · Original '+money(b.total)+' · Já baixado '+money(b.paid)+' · Saldo '+money(b.pending),'hsn10-explainer'));
  const amount=field(ctx.content,'amount','Valor desta baixa (R$)',bank?Math.abs(bank.amount):b.pending,'number',true);amount.max=b.pending;
  const date=field(ctx.content,'date','Data efetiva',bank?.transaction_date||M().today(),'date',true);date.max=M().today();
  const ref=field(ctx.content,'ref','Referência do banco ou comprovante',bank?.bank_reference||'','text',true),reason=field(ctx.content,'reason','Como confirmou este pagamento?',bank?'Conferido no extrato: '+bank.description:'','textarea',true);reason.minLength=8;
  if(bank){amount.readOnly=date.readOnly=ref.readOnly=true;ctx.content.append(el('p','Confirme a empresa/hóspede e a hospedagem com o extrato. Coincidência de valor não prova o pagamento.','hsn10-warning'));}
  const label=el('label','Confirmo que o dinheiro efetivamente foi pago/recebido e conferi a origem.');const ok=el('input');ok.type='checkbox';ok.required=true;label.prepend(ok);ctx.content.append(label);
  submit(ctx,'Confirmar baixa',async()=>{check(await db.rpc('hsn10_post_payment',{p_kind:kind,p_target_id:r.id,p_amount:Number(amount.value),p_date:date.value,p_reference:ref.value,p_request_id:request,p_reason:reason.value,p_bank_id:bank?.id||null}));});
 }
 function paymentHistory(kind,r){
  const ctx=dialog('Histórico · '+(r.company||r.title));ctx.content.className='hsn10-history';
  const events=state.events.filter(e=>e.kind===kind&&e.target_id===r.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  if(!events.length)ctx.content.append(el('p','Nenhuma baixa registrada.'));
  for(const e of events){const row=el('article');row.append(el('strong',(e.reverses_id?'Estorno − ':'Baixa + ')+money(e.amount)),el('p',(e.payment_date||'Data antiga não informada')+' · '+e.reference),el('p',e.reason),el('small','Registro '+e.id+' · '+e.created_at));
   if(!e.reverses_id&&!events.some(x=>x.reverses_id===e.id))row.append(btn('Estornar com motivo',()=>{ctx.d.remove();reverse(e);}));ctx.content.append(row);
  }ctx.d.showModal();
 }
 function reverse(e){const ctx=dialog('Estornar baixa preservando o histórico'),request=crypto.randomUUID();ctx.content.append(el('p','Estorno de '+money(e.amount)+' · '+e.reference+'. Corrige o controle; não realiza transferência bancária.'));const date=field(ctx.content,'date','Data do estorno',M().today(),'date',true);date.max=M().today();const reason=field(ctx.content,'reason','Motivo do estorno','','textarea',true);reason.minLength=8;submit(ctx,'Registrar estorno',async()=>check(await db.rpc('hsn10_reverse_payment',{p_event_id:e.id,p_date:date.value,p_reason:reason.value,p_request_id:request})));}
 function cancel(r){const ctx=dialog(r.cancelled_at?'Restaurar título':'Cancelar título');const reason=field(ctx.content,'reason','Motivo obrigatório','','textarea',true);reason.minLength=8;submit(ctx,'Confirmar',async()=>check(await db.rpc('hsn10_cancel_receivable',{p_id:r.id,p_expected_updated_at:r.updated_at,p_reason:reason.value,p_restore:!!r.cancelled_at})));}
 function markBilling(r){const ctx=dialog('Registrar envio de faturamento');ctx.content.append(el('p','Registre somente depois de confirmar o envio no Zoho ou no canal utilizado. Esta ação não envia mensagens nem confirma recebimento financeiro.'));const ref=field(ctx.content,'reference','Protocolo do envio / data, canal e destinatário','','textarea',true);ref.minLength=8;submit(ctx,'Registrar envio confirmado',async()=>check(await db.rpc('hsn10_mark_billing_sent',{p_id:r.id,p_expected_updated_at:r.updated_at,p_reference:ref.value})));}
 function editReceivableForSend(r){
  const missing=M().missingBilling(r);if(missing.length||M().billingState(r).key==='stay'){notice('Complete a hospedagem e os documentos antes do envio: '+missing.join(', '),true);editReceivable(r);return;}
  window.HSN_BILLING_CONTEXT={id:r.id,company:r.company,nf:r.nf_number};navigate('billing_send');
 }
 function reconciliation(){
  const controls=el('div',null,'actions'),input=el('input');input.type='file';input.accept='.csv,.ofx';input.setAttribute('aria-label','Importar extrato bancário');input.onchange=async()=>{try{await importBank(input.files?.[0]);}catch(e){failure(e);}input.value='';};controls.append(el('strong','Extrato bancário CSV / OFX'),input);$('records').append(controls,el('p','Importe e confira créditos e débitos. A conciliação exige conta, referência, data e liquidação identificadas. Não faz baixa por semelhança.','hsn10-explainer'));
  const t=table(['Data / conta','Histórico / referência','Banco','Conferência']);
  for(const tx of state.bank.filter(t=>t.transaction_date>=start&&t.transaction_date<=end).sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date))){
   const tr=el('tr'),desc=el('td');desc.append(el('strong',tx.description),el('small',tx.bank_reference));const act=el('td');
   if(tx.payment_id){const e=state.events.find(e=>e.id===tx.payment_id);const p=e&&(e.kind==='receivable'?state.receivables:state.payables).find(p=>p.id===e.target_id);if(company&&M().norm(e?.kind==='receivable'?p?.company:p?.company_name)!==M().norm(company))continue;act.append(el('strong','Conciliado · '+(p?.company||p?.title||'')),btn('Ver baixa',()=>paymentHistory(e.kind,p)));}
   else if(!tx.settled||tx.transaction_date>M().today())act.append(el('span','Sem liquidação comprovada · conferir origem','hsn10-warning'));
   else{
    const kind=tx.amount>0?'receivable':'payable',targets=(kind==='receivable'?state.receivables.filter(p=>(!company||M().norm(p.company)===M().norm(company))):state.payables.filter(p=>(!company||M().norm(p.company_name)===M().norm(company))&&!p.archived)).filter(p=>{const b=M().balance(p,kind);return !b.cancelled&&b.pending>0&&!b.estimated;});
    const options=[['','Selecione o título após conferir'],...targets.map(p=>[p.id,(p.company||p.title)+' · '+(p.stay_reference||p.document_number||p.reference||'')+' · Saldo '+money(M().balance(p,kind).pending)])];let picked='';select(act,'Vincular ao lançamento',options,'',v=>{picked=v;});
    act.append(btn('Conferir e conciliar',()=>{const p=targets.find(p=>p.id===picked);if(!p)throw Error('Selecione a obrigação correspondente.');if(M().cents(Math.abs(tx.amount))>M().cents(M().balance(p,kind).pending))throw Error('Divergência: valor bancário maior que o saldo. Confira juros, descontos ou título selecionado.');payment(kind,p,tx);}));
    const exact=targets.filter(p=>M().cents(M().balance(p,kind).pending)===M().cents(Math.abs(tx.amount)));act.append(el('small',exact.length+' saldo(s) de mesmo valor · vínculo exige conferência de identidade'));
   }tr.append(el('td',tx.transaction_date+' · '+tx.account),desc,el('td',money(tx.amount)),act);t.body.append(tr);
  }$('records').append(t.wrap);
 }
 async function importBank(file){
  if(!file)return;if(file.size>10*1024*1024)throw Error('Extrato acima de 10 MB. Divida por período.');
  const text=await file.text(),parsed=/\.ofx$/i.test(file.name)?HSN90.parseOfx(text):HSN90.parseStatementCsv(text);if(!parsed.length||parsed.length>2000)throw Error('Extrato vazio ou acima de 2000 linhas.');const ctx=dialog('Conferir extrato · '+file.name);ctx.content.className='hsn10-preview';
  const account=field(ctx.content,'account','Banco + agência + conta (confira antes de importar)',parsed[0]?.bankAccount||'','text',true);account.minLength=3;
  const rows=parsed.map((t,i)=>({line:i+1,selected:!!t.stableReference&&!!t.date&&Number.isFinite(t.amount)&&t.amount!==0,outcome:t.stableReference&&t.date&&Number.isFinite(t.amount)&&t.amount!==0?'ready':'error',message:!t.date?'Data inválida':!Number.isFinite(t.amount)||t.amount===0?'Valor inválido ou débito e crédito simultâneos':!t.stableReference?'Sem referência estável; ignorada':'Sem baixa automática',payload:{account:'',bank_reference:t.bankReference,transaction_date:t.date,amount:t.amount,description:t.description,settled:t.settledProof===true}}));
  ctx.content.append(el('p','Movimentos sem identificador estável não podem ser conciliados. Créditos e débitos são apresentados com o sinal original.','hsn10-explainer'));
  previewTable(ctx.content,rows);const request=crypto.randomUUID(),hash=await hashFile(file);
  submit(ctx,'Confirmar importação do extrato',async()=>{rows.forEach(r=>r.payload.account=account.value.trim());const result=check(await db.rpc('hsn10_commit_import',{p_batch_id:request,p_kind:'bank',p_filename:file.name,p_file_hash:hash,p_rows:rows}));showImportResult(result,file.name);});
 }
 async function hashFile(file){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
 function previewTable(parent,rows){const t=table(['Importar','Linha','Dados','Valor','Resultado / conferência']);for(const r of rows){const tr=el('tr'),td=el('td'),ck=el('input');ck.type='checkbox';ck.checked=r.selected;ck.disabled=r.outcome==='error'||r.outcome==='ignored';ck.setAttribute('aria-label','Importar linha '+r.line);ck.onchange=()=>r.selected=ck.checked;td.append(ck);tr.append(td,el('td',String(r.line)),el('td',[r.payload?.company||r.payload?.description,r.payload?.reference||r.payload?.bank_reference,r.payload?.due_date||r.payload?.transaction_date].filter(Boolean).join(' · ')),el('td',r.payload?money(r.payload.amount):'—'),el('td',r.message));t.body.append(tr);}parent.append(t.wrap);}
 function showImportResult(results,filename){const ctx=dialog('Resultado da importação · '+filename);ctx.content.className='hsn10-preview';const n=s=>results.filter(r=>r.status===s).length;ctx.content.append(el('p',n('imported')+' importadas · '+n('ignored')+' ignoradas · '+n('error')+' com erro. Resultado salvo no histórico.'));const t=table(['Linha','Resultado','Detalhe']);for(const r of results){const tr=el('tr');tr.append(el('td',String(r.line)),el('td',r.status),el('td',r.message));t.body.append(tr);}ctx.content.append(t.wrap);ctx.d.showModal();}
 async function importSicoob(file,items,refresh){
  if(!file)return;if(file.size>10*1024*1024)throw Error('Arquivo acima de 10 MB.');const rows=M().sicoobPreview(M().parseCSV(await file.text()),items);if(rows.length>2000)throw Error('Divida em até 2000 linhas.');const ctx=dialog('Conferir importação Sicoob · '+file.name);ctx.content.className='hsn10-preview';previewTable(ctx.content,rows);const request=crypto.randomUUID(),hash=await hashFile(file);
  submit(ctx,'Confirmar linhas selecionadas',async()=>{const result=check(await db.rpc('hsn10_commit_import',{p_batch_id:request,p_kind:'receivable',p_filename:file.name,p_file_hash:hash,p_rows:rows}));showImportResult(result,file.name);await refresh();});
 }
 function history(){
  const events=state.events.filter(e=>!company||(e.kind==='receivable'?state.receivables:state.payables).some(p=>p.id===e.target_id&&M().norm(p.company||p.company_name)===M().norm(company))).filter(e=>e.payment_date>=start&&e.payment_date<=end||!e.payment_date);
  const t=table(['Data','Tipo / título','Valor','Referência e motivo']);
  for(const e of events.sort((a,b)=>b.created_at.localeCompare(a.created_at))){const tr=el('tr'),p=(e.kind==='receivable'?state.receivables:state.payables).find(r=>r.id===e.target_id);tr.append(el('td',e.payment_date||'Sem data (legado)'),el('td',(e.reverses_id?'Estorno · ':'')+(e.kind==='receivable'?'Recebimento':'Pagamento')+' · '+(p?.company||p?.title||e.target_id)),el('td',money(e.amount)),el('td',e.reference+' · '+e.reason));t.body.append(tr);} $('records').append(t.wrap);
  const batches=el('details');batches.append(el('summary','Resultados de importações ('+state.imports.length+')'));for(const b of [...state.imports].sort((a,b)=>b.created_at.localeCompare(a.created_at)))batches.append(btn(b.filename+' · '+b.created_at,()=>showImportResult(b.results,b.filename)));$('records').append(batches);
  const audit=el('details');audit.append(el('summary','Alterações de títulos ('+state.audit.length+')'));for(const a of [...state.audit].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,200)){const row=el('details');row.append(el('summary',a.created_at+' · '+a.action+' · '+a.table_name+' · '+a.record_id),el('pre',JSON.stringify({antes:a.before_data,depois:a.after_data,operador:a.actor_id},null,2)));audit.append(row);} $('records').append(audit);
 }
 async function exportBackup(){const data=check(await db.rpc('hsn10_export_backup',{}));const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='HSN-backup-financeiro-'+M().today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Cópia dos dados preparada. Os PDFs/imagens devem ser exportados também pelo módulo Backups.');}
 function exportRows(rows){const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const csv=[['Empresa','Hóspede','Hospedagem','Vencimento','Valor original','Recebido','Saldo','Situação','Faturamento'],...rows.map(r=>{const b=M().balance(r,'receivable');return [r.company,r.guest_name,r.stay_reference,r.due_date,b.total,b.paid,b.pending,names[M().status(r,'receivable')],M().billingState(r).label];})].map(r=>r.map(quote).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='HSN-contas-a-receber.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function openPaymentHistory(kind,r){state.events=await all('hsn10_events');paymentHistory(kind,r);}
 return {handles,load,render,reset,openPaymentHistory,importSicoob,payment,paymentHistory,navigate,hashFile,showImportResult,ready:()=>ready};
})();
