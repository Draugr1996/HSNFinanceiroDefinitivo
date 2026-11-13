/* Financeiro HSN 9.0 — aprovação, conciliação local, agenda de pagamentos e
   correspondências DDA. Não cria tabelas, não efetua pagamentos no banco e
   não altera dados sem o fluxo de confirmação já existente no HSN. */
(function(root){'use strict';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const dateBR=s=>root.HSN_DATES.br(s);
const today=()=>root.HSN_DATES.today();
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const cents=v=>Math.round(Number(v||0)*100);
const val=p=>p.actual_amount==null?Number(p.estimated_amount||0):Number(p.actual_amount||0);
const stage=p=>p.payment_status==='paid'?'paid':p.workflow_status||'pending';
const stageName={pending:'Pendente',awaiting_signature:'Pendente de assinatura',scheduled_signature:'Programado · aguardando assinatura',scheduled:'Programado no banco',approved:'Assinado / autorizado',cancelled:'Cancelado',paid:'Pago'};
const inBank=p=>!p.archived&&p.payment_status!=='paid'&&p.workflow_status!=='cancelled';
const canPay=p=>inBank(p)&&!['awaiting_signature','scheduled_signature'].includes(stage(p))&&p.approval_status!=='waiting';
let approvalSelected=new Set(),agendaSelected=new Set(),approvalFilter='signature',agendaDays='30';
let bankRows=[],bankSelection=new Map(),bankChecked=new Set(),bankFileInfo='',bankError='',bankFileWarning='',bankPositiveAllowed=false;
const snap=()=>root.HSN_FINANCE?.snapshot?.()||{payables:[],suppliers:[],types:[]};
const charges=()=>root.HSN_PHASE4?.charges?.()||[];
function amountTotal(rows){return rows.reduce((sum,p)=>sum+val(p),0);}
function el(tag,content,cls){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined&&content!==null)e.textContent=String(content);return e;}
function btn(text,onclick,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',onclick);return b;}
function area(parent,cls){const e=el('div',undefined,cls);parent.append(e);return e;}
function empty(parent,message){parent.append(el('p',message,'hsn90-empty'));}
function label(text,node){const l=el('label');l.append(el('span',text));l.append(node);return l;}
function select(options,value){const s=el('select');for(const [key,title]of options)s.add(new Option(title,key));s.value=value||'';return s;}
function setupPage(title,subtitle,currentView){
 document.getElementById('view-title').textContent=title;
 const desc=document.getElementById('view-description');if(desc)desc.textContent=subtitle;
 const n=document.getElementById('new');n.hidden=true;
 for(const id of ['records','summary','finance-controls','calendar-board','commission-calendar-summary'])document.getElementById(id)?.replaceChildren();
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
 const search=document.getElementById('search');search.closest('.search-wrap').hidden=false;
}
function workflowChip(p){return el('span',stageName[stage(p)]||'Pendente','hsn90-chip hsn90-chip-'+stage(p));}
function stats(items){const root= document.getElementById('summary');const groups=[
 ['Aguardando assinatura',items.filter(p=>['awaiting_signature','scheduled_signature'].includes(stage(p)))],
 ['Programado no banco',items.filter(p=>stage(p)==='scheduled')],
 ['Assinado / autorizado',items.filter(p=>stage(p)==='approved')],
 ['A pagar',items.filter(p=>inBank(p))]
 ];for(const [name,list]of groups){const c=el('div',undefined,'stat hsn90-stat');c.append(el('small',name),el('strong',money(amountTotal(list))),el('span',list.length+' conta(s)','muted'));root.append(c);}}
function smallRow(p){const tr=el('tr');const cell=(text,cls)=>{const td=el('td',text,cls);tr.append(td);return td;};return {tr,cell};}
function openAccount(p){root.HSN_FINANCE.openRecord(p.id);}
function filterSearch(p){const s=norm(document.getElementById('search').value);if(!s)return true;const supp=snap().suppliers.find(x=>x.id===p.supplier_id);return norm([p.title,p.document_number,supp?.legal_name,supp?.trade_name].join(' ')).includes(s);}
function clearSelection(ids,valid){for(const id of [...ids])if(!valid.has(id))ids.delete(id);}
function tableCheck(ids,rows,onChange){const check=el('input');check.type='checkbox';check.className='hsn86-checkbox';const selected=rows.filter(p=>ids.has(p.id)).length;check.checked=rows.length>0&&selected===rows.length;check.indeterminate=selected>0&&selected<rows.length;check.setAttribute('aria-label','Selecionar todas as contas exibidas');check.addEventListener('change',()=>{rows.forEach(p=>check.checked?ids.add(p.id):ids.delete(p.id));onChange();});return check;}
function renderRows(holder,items,ids,rerender,extra){
 const wrap=area(holder,'hsn90-table-wrap');const table=el('table',undefined,'hsn90-table');const head=el('thead'),headRow=el('tr');
 const top=el('th');top.append(tableCheck(ids,items,rerender));headRow.append(top);
 for(const x of ['Conta / fornecedor','Vencimento','Valor','Etapa bancária','Programado','Ações'])headRow.append(el('th',x));head.append(headRow);table.append(head);
 const body=el('tbody');for(const p of items){const {tr,cell}=smallRow(p);if(ids.has(p.id))tr.classList.add('hsn90-selected');
 const chk=el('input');chk.type='checkbox';chk.checked=ids.has(p.id);chk.className='hsn86-checkbox';chk.setAttribute('aria-label','Selecionar '+p.title);chk.onchange=()=>{chk.checked?ids.add(p.id):ids.delete(p.id);rerender();};const first=cell('');first.append(chk);
 const company=snap().suppliers.find(s=>s.id===p.supplier_id);const desc=cell('');desc.append(el('strong',p.title),el('small',company?.trade_name||company?.legal_name||'Fornecedor não informado'));
 cell(dateBR(p.due_date));cell(money(val(p)),'hsn90-money');const st=cell('');st.append(workflowChip(p));cell(p.bank_scheduled_date?dateBR(p.bank_scheduled_date):'—');
 const actions=cell('');actions.append(btn('Abrir',()=>openAccount(p)));if(extra)extra(p,actions);body.append(tr);
 }table.append(body);wrap.append(table);if(!items.length)empty(holder,'Nenhuma conta corresponde aos filtros.');
}
function selectedBox(holder,ids,items,rerender,help){
 const bar=area(holder,'hsn90-toolbar');const pick=items.filter(p=>ids.has(p.id));
 const labelNode=el('div');labelNode.append(el('strong',pick.length+' selecionada(s) · '+money(amountTotal(pick))),el('small',help));bar.append(labelNode);
 const controls=area(bar,'hsn90-toolbar-actions');controls.append(btn('Selecionar exibidas ('+items.length+')',()=>{items.forEach(p=>ids.add(p.id));rerender();}));controls.append(btn('Limpar seleção',()=>{ids.clear();rerender();}));
 return {bar,controls,pick};
}
function approval(){
 setupPage('Central de aprovação','Acompanhe a assinatura do diretor e a programação bancária. Status registrado no HSN não é autorização no banco.','approvals');
 const all=snap().payables.filter(p=>!p.archived);stats(all);
 const filters=[['signature','Aguardando assinatura'],['scheduled','Programadas'],['approved','Assinadas / autorizadas'],['open','Todas não pagas'],['all','Todas, inclusive pagas']];
 const controls=document.getElementById('finance-controls');const status=select(filters,approvalFilter);controls.append(label('Filtrar etapa',status));status.onchange=()=>{approvalFilter=status.value;approvalSelected.clear();approval();};
 const list=all.filter(p=>approvalFilter==='signature'?['awaiting_signature','scheduled_signature'].includes(stage(p)):approvalFilter==='scheduled'?stage(p)==='scheduled':approvalFilter==='approved'?stage(p)==='approved':approvalFilter==='open'?inBank(p):true).filter(filterSearch).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.title.localeCompare(b.title));
 clearSelection(approvalSelected,new Set(list.map(x=>x.id)));
 const holder=document.getElementById('records');const {controls:actions,pick}=selectedBox(holder,approvalSelected,list,approval,'Altere a etapa de várias contas sem registrar pagamento.');
 const change=btn('Alterar etapa das selecionadas',()=>root.HSN_FINANCE.workflowBulk(pick),'primary');change.disabled=!pick.some(p=>inBank(p));actions.append(change);
 const open=btn('Abrir Contas a pagar',()=>root.HSN_FINANCE.navigate('payables'));actions.append(open);
 const info=area(holder,'hsn90-note');info.append(el('strong','A assinatura é feita no banco pelo diretor.'),el('p','Aqui você registra o andamento após conferir no Sicoob. Não há integração com a autorização bancária, nem execução automática de pagamentos.'));
 renderRows(holder,list,approvalSelected,approval,(p,td)=>{if(canPay(p)){const b=btn('Revisar baixa',()=>root.HSN_FINANCE.bulkPaid([p]));td.append(b);}});
}
function agenda(){
 setupPage('Agenda de pagamentos','Vencimentos por dia com total previsto e situação bancária, incluindo contas vencidas.','payments_agenda');
 const opts=[['7','Próximos 7 dias'],['15','Próximos 15 dias'],['30','Próximos 30 dias'],['60','Próximos 60 dias'],['all','Todas as datas']];const controls=document.getElementById('finance-controls'),period=select(opts,agendaDays);period.onchange=()=>{agendaDays=period.value;agendaSelected.clear();agenda();};controls.append(label('Período',period));
 const end=agendaDays==='all'?'9999-12-31':root.HSN_DATES.add(today(),Number(agendaDays));
 const list=snap().payables.filter(p=>inBank(p)&&p.due_date<=end&&filterSearch(p)).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.title.localeCompare(b.title));
 const over=list.filter(p=>p.due_date<today());const upcoming=list.filter(p=>p.due_date>=today());
 const statsNode=document.getElementById('summary');for(const [name,arr]of [['Vencidas',over],['No prazo',upcoming],['Aguardando assinatura',list.filter(p=>['awaiting_signature','scheduled_signature'].includes(stage(p)))],['Total de compromissos',list]]){const s=el('div',undefined,'stat hsn90-stat');s.append(el('small',name),el('strong',money(amountTotal(arr))),el('span',arr.length+' conta(s)','muted'));statsNode.append(s);}
 clearSelection(agendaSelected,new Set(list.map(x=>x.id)));const main=document.getElementById('records');const {controls:actions,pick}=selectedBox(main,agendaSelected,list,agenda,'Selecione contas de dias diferentes para atualizar a etapa em lote.');
 const batch=btn('Alterar etapa bancária',()=>root.HSN_FINANCE.workflowBulk(pick),'primary');batch.disabled=!pick.length;actions.append(batch);
 const groups=new Map();for(const p of list){if(!groups.has(p.due_date))groups.set(p.due_date,[]);groups.get(p.due_date).push(p);}
 if(!groups.size)empty(main,'Nenhum vencimento neste período.');
 for(const [date,rows]of groups){const section=el('section',undefined,'hsn90-agenda-group');const header=el('div',undefined,'hsn90-agenda-header');header.append(el('h3',dateBR(date)+(date<today()?' · VENCIDO':'')),el('strong',money(amountTotal(rows))),el('span',rows.length+' conta(s)'));const groupSelect=btn('Selecionar dia',()=>{rows.forEach(p=>agendaSelected.add(p.id));agenda();});header.append(groupSelect);section.append(header);renderRows(section,rows,agendaSelected,agenda);main.append(section);}
}
// Arquivo bancário permanece em memória apenas nesta aba. Nada é enviado automaticamente.
function parseCsv(text){
 const content=String(text||'').replace(/^\uFEFF/,'');const first=content.split(/\r?\n/).find(s=>s.trim())||'';
 const counts=[';',',','\t'].map(x=>[x,(first.match(new RegExp(x==='\t'?'\\t':x===';'?';':',','g'))||[]).length]);const delim=counts.sort((a,b)=>b[1]-a[1])[0][0];
 const rows=[];let row=[],cur='',inside=false;
 for(let i=0;i<content.length;i++){const ch=content[i];if(ch==='"'){if(inside&&content[i+1]==='"'){cur+='"';i++;}else inside=!inside;}else if(ch===delim&&!inside){row.push(cur.trim());cur='';}else if((ch==='\n'||ch==='\r')&&!inside){if(ch==='\r'&&content[i+1]==='\n')i++;row.push(cur.trim());cur='';if(row.some(x=>x!==''))rows.push(row);row=[];}else cur+=ch;}
 if(cur||row.length){row.push(cur.trim());rows.push(row);}return rows;
}
function numberBR(s){let raw=String(s??'').replace(/[\sR$]/g,'').replace(/[−–]/g,'-').replace(/[()]/g,'');const parens=/\(.*\)/.test(String(s));if(!raw)return NaN;
 if(raw.includes(',')&&raw.includes('.'))raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
 else if(raw.includes(','))raw=raw.replace(',','.');else if(/^-?\d{1,3}(\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'');
 const n=Number(raw);return Number.isFinite(n)?parens?-Math.abs(n):n:NaN;
}
function parseDate(s){const val=String(s||'').trim();let y,m,d;if(/^\d{8}/.test(val)){y=+val.slice(0,4);m=+val.slice(4,6);d=+val.slice(6,8);}else if(/^\d{4}-\d{2}-\d{2}/.test(val)){y=+val.slice(0,4);m=+val.slice(5,7);d=+val.slice(8,10);}else{const a=val.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);if(!a)return '';d=+a[1];m=+a[2];y=+a[3];if(y<100)y+=2000;}
 const iso=[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');try{root.HSN_DATES.parse(iso);return iso;}catch{return '';}}
function ofxTag(txt,name){const regex=new RegExp('<'+name+'>([^<\\r\\n]*)','i');return(txt.match(regex)?.[1]||'').trim();}
function parseOfx(text){const matches=[...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)];const account=ofxTag(text,'ACCTID');return matches.map((m,i)=>{const fitid=ofxTag(m[1],'FITID');return {date:parseDate(ofxTag(m[1],'DTPOSTED')),amount:numberBR(ofxTag(m[1],'TRNAMT')),description:[ofxTag(m[1],'MEMO'),ofxTag(m[1],'NAME'),ofxTag(m[1],'CHECKNUM')].filter((x,i,a)=>x&&a.indexOf(x)===i).join(' · ')||'Movimentação bancária',reference:fitid||String(i+1),bankReference:fitid,stableReference:!!fitid&&fitid.length>=6,bankAccount:account,sourceType:'ofx',settledProof:true,proofType:'posted_ofx',kind:ofxTag(m[1],'TRNTYPE')};});}
function parseStatementCsv(text){const rows=parseCsv(text);if(rows.length<2)throw Error('O CSV não contém linhas suficientes.');
 const signatures={date:['data','data lancamento','data movimento','dt lancamento','date'],amount:['valor','valor r','amount','valor lancamento'],debit:['debito','valor debito','saida','saidas','valor saida'],credit:['credito','valor credito','entrada','entradas'],description:['historico','descricao','detalhes','descricao lancamento','estabelecimento','favorecido','nome','memo'],reference:['documento','numero documento','identificador','id transacao','autenticacao','referencia','codigo transacao','fitid','id movimento','identificador movimento'],extra:['complemento','descricao adicional','historico complementar','info complementar'],tax:['cnpj','cpf cnpj','cnpj cpf','cnpj beneficiario','documento beneficiario'],balance:['saldo','saldo r','saldo apos lancamento','saldo disponivel','saldo atual'],situation:['situacao','status','situacao lancamento','estado lancamento','status pagamento']};
 let headerIndex=-1,mapping=null;
 for(let i=0;i<Math.min(rows.length,16);i++){const cols=rows[i].map(norm),map={};for(const [kind,words]of Object.entries(signatures))map[kind]=cols.findIndex(c=>words.includes(c));if(map.date>=0&&(map.amount>=0||map.debit>=0||map.credit>=0)){headerIndex=i;mapping=map;break;}}
 if(headerIndex<0)throw Error('Não identifiquei colunas de data e valor/débito. Confira o layout do extrato antes de tentar novamente.');
 return rows.slice(headerIndex+1).map((r,i)=>{const debitValue=mapping.debit>=0?numberBR(r[mapping.debit]):NaN,creditValue=mapping.credit>=0?numberBR(r[mapping.credit]):NaN;const debit=Number.isFinite(debitValue)&&debitValue!==0,credit=Number.isFinite(creditValue)&&creditValue!==0;let amount=debit&&credit?NaN:debit?-Math.abs(debitValue):credit?Math.abs(creditValue):mapping.amount>=0?numberBR(r[mapping.amount]):NaN;
 const bankRef=mapping.reference>=0?String(r[mapping.reference]||'').trim():'';const situation=mapping.situation>=0?norm(r[mapping.situation]):'';const cleared=/^(efetivado|efetivada|pago|paga|liquidado|liquidada|compensado|compensada|executado|executada|concluido|concluida)$/.test(situation);const scheduled=/(agendad|programad|pendente|autorizad|processando)/.test(situation);const validBalance=mapping.balance>=0&&Number.isFinite(numberBR(r[mapping.balance]));const refHeader=mapping.reference>=0?norm(rows[headerIndex][mapping.reference]):'';const transactionalRef=['id transacao','identificador','autenticacao','codigo transacao','fitid','id movimento','identificador movimento'].includes(refHeader);const verifiedStatus=cleared&&transactionalRef;const settledProof=!scheduled&&(validBalance||verifiedStatus);return {date:parseDate(r[mapping.date]),amount,description:[r[mapping.description],r[mapping.extra],r[mapping.tax]].filter(Boolean).join(' · ')||'Movimentação bancária',reference:bankRef||'Linha '+(headerIndex+i+2),bankReference:bankRef,stableReference:transactionalRef&&bankRef.length>=6,sourceType:'csv',bankAccount:'',settledProof,proofType:verifiedStatus?'confirmed_csv_status':validBalance?'posted_csv_balance':'',kind:debit?'DEBIT':''};});
}
function parseBankFile(name,text){const rows=/\.ofx$/i.test(name)?parseOfx(text):parseStatementCsv(text);const parsed=rows.filter(x=>x.date&&Number.isFinite(x.amount)&&x.amount!==0).map((x,i)=>({...x,id:'tx'+i}));if(!parsed.length)throw Error('Nenhuma movimentação bancária com data e valor válido foi encontrada.');if(parsed.length>2000)throw Error('O extrato possui mais de 2.000 movimentos. Divida por período para não deixar lançamentos fora da conferência.');return parsed;}
function dateDiff(a,b){try{return Math.abs((root.HSN_DATES.parse(a)-root.HSN_DATES.parse(b))/86400000);}catch{return 9999;}}
// Índices em memória: vincula o DDA importado às contas já cadastradas, sem criar baixas.
let bankLookupCache=null;
const bankGenericWords=new Set(['boleto','boletos','pagamento','pagamentos','titulo','titulos','cobranca','banco','bancaria','bancario','sicoob','debito','credito','transferencia','pix','conta','contas','ltda','eireli','epp','mei','comercio','comercial','servicos','servico','brasil','agencia','fatura','documento','de','da','do','dos','das','para','pelo']);
function bankTokens(v){return [...new Set(norm(v).split(' ').filter(t=>t.length>=4&&!bankGenericWords.has(t)))];}
function bankLookup(){
 const snapshot=snap(),chargesList=charges();
 if(bankLookupCache?.payables===snapshot.payables&&bankLookupCache.payableCount===snapshot.payables.length&&bankLookupCache.suppliers===snapshot.suppliers&&bankLookupCache.charges===chargesList&&bankLookupCache.ddaCount===chargesList.length)return bankLookupCache;
 const byAmount=new Map(),blockedByAmount=new Map(),paidByAmount=new Map(),supplierById=new Map(snapshot.suppliers.map(s=>[s.id,s])),ddaByAccount=new Map(),unconvertedDda=new Map();
 const add=(index,key,item)=>{if(!Number.isFinite(key)||key<=0)return;const list=index.get(key)||[];list.push(item);index.set(key,list);};
 for(const d of chargesList){if(d.archived)continue;
  if(d.converted_payable_id||d.linked_payable_id){const accountId=d.converted_payable_id||d.linked_payable_id;const list=ddaByAccount.get(accountId)||[];list.push(d);ddaByAccount.set(accountId,list);}
  else add(unconvertedDda,cents(d.amount),d);
 }
 for(const p of snapshot.payables){if(p.archived||p.workflow_status==='cancelled')continue;
  const entry={p,supplier:supplierById.get(p.supplier_id),dda:ddaByAccount.get(p.id)||[]},amount=cents(val(p));
  if(p.payment_status==='paid')add(paidByAmount,amount,entry);
  else if(canPay(p))add(byAmount,amount,entry);
  else add(blockedByAmount,amount,entry);
 }
 bankLookupCache={payables:snapshot.payables,payableCount:snapshot.payables.length,suppliers:snapshot.suppliers,charges:chargesList,ddaCount:chargesList.length,byAmount,blockedByAmount,paidByAmount,unconvertedDda};
 return bankLookupCache;
}
function bankTextMatch(tx,name,doc){
 const description=norm(tx.description),reference=norm(tx.reference),combined=description+' '+reference;
 const digits=String(doc||'').replace(/\D/g,'');
 const docMatch=digits.length>=6&&digits.length<=30&&((description.replace(/ /g,'').includes(digits))||(reference.replace(/ /g,'').includes(digits)));
 const words=bankTokens(name),found=words.filter(t=>description.split(' ').includes(t));
 return {docMatch:!!docMatch,supplierMatch:found.length>0,matchedWords:found.length};
}
function candidates(tx){
 if(tx.amount>=0&&!bankPositiveAllowed)return [];
 const index=bankLookup(),target=cents(Math.abs(tx.amount)),options=[];
 // Os históricos de pagamentos do Sicoob frequentemente omitem fornecedor e documento.
 // Sem eliminar títulos por um limite fixo de 30 dias, exibir coincidências de valor
 // classificadas para revisão. Diferença de um centavo nunca pode ser baixada.
 const entries=[...(index.byAmount.get(target)||[]),...(index.byAmount.get(target-1)||[]),...(index.byAmount.get(target+1)||[])];
 for(const {p,supplier,dda} of entries){
  if(!canPay(p))continue;
  const distance=dateDiff(tx.date,p.due_date),scheduled=p.bank_scheduled_date?dateDiff(tx.date,p.bank_scheduled_date):9999;
  const dateDistance=Math.min(distance,scheduled),sameCent=cents(val(p))===target;
  const party=[supplier?.legal_name,supplier?.trade_name].filter(Boolean).join(' ');
  const primary=bankTextMatch(tx,party,p.document_number);
  let supplierMatch=primary.supplierMatch,docMatch=primary.docMatch,relatedDda=null;
  for(const item of dda){
   const matched=bankTextMatch(tx,item.supplier_name,item.document_number);
   if(matched.docMatch||matched.supplierMatch){relatedDda=item;supplierMatch=supplierMatch||matched.supplierMatch;docMatch=docMatch||matched.docMatch;}
  }
  const titleMatch=bankTokens(p.title).some(t=>norm(tx.description).split(' ').includes(t));
  const textScore=docMatch?42:supplierMatch?32:titleMatch?12:0;
  let score=30+Math.max(0,22-dateDistance*2)+textScore+(scheduled<=2?10:0);
  if(!sameCent)score=Math.min(score,52);
  if(dateDistance>30)score=Math.min(score,64);
  const nameMatch=tx.amount<0&&sameCent&&(docMatch||supplierMatch);
  // A identidade do fornecedor ou documento E uma data próxima são indispensáveis
  // para sugestão forte. Igualdade de valor, sozinha, exige escolha manual.
  const confident=nameMatch&&dateDistance<=30&&score>=65;
  options.push({p,score,distance:dateDistance,nameMatch,confident,documentMatch:docMatch,ddaMatch:!!relatedDda,ddaLinked:dda.length>0,exactValue:sameCent});
 }
 return options.sort((a,b)=>Number(b.confident)-Number(a.confident)||Number(b.exactValue)-Number(a.exactValue)||b.score-a.score||a.distance-b.distance||a.p.due_date.localeCompare(b.p.due_date));
}
function unconvertedDdaMatch(tx){
 const list=bankLookup().unconvertedDda.get(cents(Math.abs(tx.amount)))||[];
 return list.map(d=>{
  const matched=bankTextMatch(tx,d.supplier_name,d.document_number);
  const distance=dateDiff(tx.date,d.due_date);
  return {d,distance,identified:matched.docMatch||matched.supplierMatch};
 }).filter(x=>x.identified||x.distance<=180)
  .sort((a,b)=>Number(b.identified)-Number(a.identified)||a.distance-b.distance)
  .slice(0,8).map(x=>({...x.d,_bankDistance:x.distance,_bankIdentified:x.identified}));
}
function relatedAccountStatus(tx){
 const index=bankLookup(),value=cents(Math.abs(tx.amount));
 const sort=list=>(list||[]).map(x=>x.p).sort((a,b)=>dateDiff(tx.date,a.due_date)-dateDiff(tx.date,b.due_date));
 return {blocked:sort(index.blockedByAmount.get(value)),paid:sort(index.paidByAmount.get(value))};
}
function uniqueStrongChoice(list){
 return !!(list.length&&list[0].confident&&(list.length===1||list[0].score-list[1].score>=20));
}
function duplicateBankMovements(items){
 const counts=new Map();
 for(const tx of items){
  const ref=String(tx.reference||'').trim();const identity=ref&&!/^linha \d+$/i.test(ref)?'ref:'+ref+'|'+tx.date+'|'+cents(tx.amount):'finger:'+tx.date+'|'+cents(tx.amount)+'|'+norm(tx.description);
  counts.set(identity,(counts.get(identity)||0)+1);
 }
 const duplicate=new Set();
 for(const tx of items){const ref=String(tx.reference||'').trim();const identity=ref&&!/^linha \d+$/i.test(ref)?'ref:'+ref+'|'+tx.date+'|'+cents(tx.amount):'finger:'+tx.date+'|'+cents(tx.amount)+'|'+norm(tx.description);if(counts.get(identity)>1)duplicate.add(tx.id);}
 return duplicate;
}
async function decodeBankText(file){
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
 const probe=new TextDecoder('latin1').decode(bytes.slice(0,700));
 const declaredLegacy=/(?:CHARSET\s*:\s*(?:1252|8859-1|ANSI)|ENCODING\s*:\s*(?:USASCII|ASCII)|encoding\s*=\s*["'](?:ISO-8859-1|windows-1252)["'])/i.test(probe);
 if(declaredLegacy)return new TextDecoder('windows-1252').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{return new TextDecoder('windows-1252').decode(bytes);}
}
async function readStatement(file){
 if(!file)return;if(file.size>5*1024*1024){bankError='O arquivo deve ter até 5 MB.';reconciliation();return;}
 if(!/\.(ofx|csv)$/i.test(file.name)){bankError='Selecione um extrato .OFX ou .CSV.';reconciliation();return;}
 try{
  const text=await decodeBankText(file);
  bankRows=parseBankFile(file.name,text);bankSelection.clear();bankChecked.clear();bankFileInfo=file.name+' · '+bankRows.length+' movimento(s) reconhecido(s)';bankError='';
  bankFileWarning=bankRows.filter(x=>x.amount>=0).length+' crédito(s)/valor(es) positivos foram excluídos das sugestões por padrão.';
 }catch(e){bankError=e.message||'Falha ao ler o arquivo.';bankRows=[];bankSelection.clear();bankChecked.clear();}
 reconciliation();
}
async function hashTransaction(identity){
 if(!globalThis.crypto?.subtle)throw Error('Conexão segura HTTPS obrigatória para identificar transações.');
 const bytes=new TextEncoder().encode(identity),digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function reconcileAutomatically(eligible){
 if(!eligible.length){window.alert('Nenhum débito possui prova documental suficiente para baixa automática. Revise os lançamentos pendentes.');return;}
 const chosen=eligible.slice(0,100),total=chosen.reduce((sum,r)=>sum+Number(r.payable.actual_amount),0);
 const f=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 if(!window.confirm('CONCILIAÇÃO AUTOMÁTICA · EXTRATO + DDA\n\n'+chosen.length+' baixa(s) identificada(s) · '+f.format(total)+'\n'+
  'O HSN registrará somente débitos com documento/CPF-CNPJ ou código de barras no EXTRATO, conta vinculada e valor exato.\n\n'+
  'Isso NÃO executa pagamento no banco. Confirma o registro destes pagamentos já efetivados?'))return;
 await operation(async()=>{
  const refreshed=root.HSN97.reconcile(bankRows,charges(),snap().payables,snap().suppliers,{today:today()});
  const approved=new Set(chosen.map(x=>x.tx.id+'|'+x.payable.id+'|'+x.dda.id));
  const current=refreshed.filter(x=>x.status==='auto'&&approved.has(x.tx.id+'|'+x.payable.id+'|'+x.dda.id));
  if(current.length!==chosen.length)throw Error('As sugestões mudaram. Importe o extrato novamente e confira antes de dar baixa.');
  const records=[];
  for(const r of current){records.push({payable_id:r.payable.id,dda_id:r.dda.id,amount:Number(r.payable.actual_amount),date:r.tx.date,
   reference:r.tx.bankReference,history:r.tx.description,source_type:r.tx.sourceType,proof_type:r.tx.proofType,file:bankFileInfo.split(' · ')[0],transaction_key:await hashTransaction(r.transactionIdentity)});}
  const reply=await db.rpc('hsn_apply_reconciled_bank_payments',{p_items:records});
  if(reply.error){if(reply.error.code==='PGRST202'||/hsn_apply_reconciled_bank_payments.*does not exist/i.test(reply.error.message||'')){
    throw Error('Antes da baixa automática, execute sql/HSN-9-7-conciliacao-automatica.sql no Supabase. Nenhuma baixa foi gravada.');}
   throw reply.error;}
  if(Number(reply.data?.applied)!==records.length)throw Error('O servidor retornou uma quantidade diferente. Verifique o histórico bancário antes de repetir.');
  bankChecked.clear();bankSelection.clear();bankLookupCache=null;
  await root.HSN_FINANCE.load('reconciliation');
  notice(reply.data.applied+' pagamento(s) registrado(s) automaticamente mediante confirmação, com DDA, extrato e histórico auditável.');
 });
}
async function showAutoReconciliationHistory(){
 await operation(async()=>{
  const host=document.getElementById('hsn97-history');if(!host)return;
  const response=await db.from('hsn_bank_reconciliation_log').select('transaction_date,amount,bank_reference,bank_history,source_file,dda_charge_id,payable_id,created_at').order('created_at',{ascending:false}).limit(100);
  if(response.error){if(response.error.code==='42P01'||response.error.code==='PGRST205')throw Error('Instale sql/HSN-9-7-conciliacao-automatica.sql no Supabase para consultar o histórico.');throw response.error;}
  host.replaceChildren();host.hidden=false;
  host.append(el('h4','Últimas '+response.data.length+' baixa(s) automáticas registradas'));
  if(!response.data.length){host.append(el('p','Ainda não há baixas automáticas registradas.'));return;}
  const table=el('table',undefined,'hsn90-table');const thead=el('thead'),header=el('tr');
  for(const name of ['Data','Valor','Referência bancária','Conta','Origem'])header.append(el('th',name));thead.append(header);table.append(thead);
  const tbody=el('tbody');for(const r of response.data){const tr=el('tr');const linked=snap().payables.find(p=>p.id===r.payable_id);
   for(const value of [dateBR(r.transaction_date),money(r.amount),r.bank_reference,linked?.title||r.payable_id.slice(0,8),r.source_file||'Extrato'])tr.append(el('td',value));tbody.append(tr);}
  table.append(tbody);const wrap=area(host,'hsn90-table-wrap');wrap.append(table);
 });
}
function reconciliation(){
 setupPage('Conciliação bancária','Importe um extrato OFX ou CSV. O sistema sugere vínculos; a baixa só ocorre após conferência e confirmação.','reconciliation');
 const controls=document.getElementById('finance-controls');const input=el('input');input.type='file';input.accept='.ofx,.csv,text/csv,application/x-ofx';input.setAttribute('aria-label','Extrato bancário OFX ou CSV');input.onchange=()=>readStatement(input.files[0]);controls.append(label('Selecionar extrato do banco',input));
 const choose=el('label',undefined,'hsn90-check');const ck=el('input');ck.type='checkbox';ck.checked=bankPositiveAllowed;ck.onchange=()=>{bankPositiveAllowed=ck.checked;bankSelection.clear();bankChecked.clear();reconciliation();};choose.append(ck,el('span','O CSV contém apenas pagamentos: considerar também valores positivos (requer conferência manual).'));controls.append(choose);
 const main=document.getElementById('records');const hint=area(main,'hsn90-note');hint.append(el('strong','Conciliação assistida: não movimenta dinheiro.'),el('p','Pagamentos já baixados, contas canceladas ou sem assinatura confirmada não recebem sugestões para baixa. O arquivo fica somente na memória desta aba. Extratos bancários variam de formato; revise valores, datas e beneficiários.'));
 if(bankError)main.append(el('p',bankError,'hsn90-error'));if(!bankRows.length){empty(main,'Selecione um arquivo OFX ou CSV do Sicoob para começar. Nenhum registro será criado no banco.');return;}
 main.append(el('h3',bankFileInfo));if(bankFileWarning)main.append(el('p',bankFileWarning,'hsn90-hint'));
 const relevant=bankRows.filter(tx=>tx.amount<0||bankPositiveAllowed),duplicateIds=duplicateBankMovements(relevant);
 // Cache de sugestões por extrato evita uma segunda pesquisa de cada movimento.
 const prepared=relevant.map(tx=>({tx,list:candidates(tx),dda:unconvertedDdaMatch(tx),status:relatedAccountStatus(tx)}));
 const automatic=root.HSN97.reconcile(relevant,charges(),snap().payables,snap().suppliers,{today:today()});
 const autoEligible=automatic.filter(x=>x.status==='auto'),toReview=automatic.filter(x=>['review','blocked','duplicate','no_account','no_dda'].includes(x.status));
 const paidCount=automatic.filter(x=>x.status==='paid').length,scheduledCount=automatic.filter(x=>x.status==='scheduled').length;
 const autoPanel=area(main,'hsn97-auto-panel');
 const panelTop=el('div',undefined,'hsn97-panel-top');
 const panelInfo=el('div');panelInfo.append(el('span','CONCILIAÇÃO DDA + EXTRATO · HSN 9.7','hsn97-eyebrow'),el('h3','Baixa automática com evidência bancária'),
   el('p','Reconhece contas e títulos do DDA. Apenas débitos liquidados e identificados por documento/CPF-CNPJ ou código de barras entram na baixa automática; o restante precisa de conferência.'));
 panelTop.append(panelInfo);
 const automaticButton=btn('Registrar '+Math.min(autoEligible.length,100)+' baixa(s) segura(s)',()=>reconcileAutomatically(autoEligible),'primary');
 automaticButton.disabled=!autoEligible.length;panelTop.append(automaticButton);panelTop.append(btn('Histórico de baixas',showAutoReconciliationHistory,'secondary'));autoPanel.append(panelTop);const history=area(autoPanel,'hsn97-history');history.id='hsn97-history';history.hidden=true;
 const metricRow=area(autoPanel,'hsn97-metrics');
 for(const [value,name,cls]of [[autoEligible.length,'Prontas para baixa','hsn97-ok'],[toReview.length,'Precisam revisão','hsn97-warn'],[paidCount,'Já pagas no HSN','hsn97-ok'],[scheduledCount,'Agendadas no HSN','hsn97-scheduled']]){
  const box=el('div',undefined,'hsn97-metric '+cls);box.append(el('strong',value),el('span',name));metricRow.append(box);
 }
 if(autoEligible.length){const details=el('details',undefined,'hsn97-eligible');details.append(el('summary','Ver '+autoEligible.length+' pagamento(s) com evidência forte'));for(const r of autoEligible.slice(0,35))details.append(el('p',r.dda.supplier_name+' · '+money(r.payable.actual_amount)+' · '+dateBR(r.tx.date)+' · '+r.evidence));if(autoEligible.length>35)details.append(el('p','Exibidos 35 registros; a operação está limitada a lotes de 100.'));autoPanel.append(details);}
 else autoPanel.append(el('p','Nenhuma baixa 100% identificada neste extrato. Históricos genéricos do Sicoob exigem revisão, mesmo quando valor e data coincidirem.','hsn97-warning'));
 const strongEntries=prepared.filter(({tx,list})=>!duplicateIds.has(tx.id)&&uniqueStrongChoice(list));
 const strongCounts=new Map();for(const row of strongEntries){const id=row.list[0].p.id;strongCounts.set(id,(strongCounts.get(id)||0)+1);}
 const definite=strongEntries.filter(({list})=>strongCounts.get(list[0].p.id)===1);
 const definiteIds=new Set(definite.map(({tx})=>tx.id));
 const matched=prepared.filter(x=>x.list.length),pendingDda=prepared.filter(x=>x.dda.length);
 const stat=area(main,'hsn90-reconcile-summary');stat.append(el('strong',relevant.length+' movimento(s) elegível(is) · '+definite.length+' sugestão(ões) fortes'),el('span',matched.length+' com possível conta · '+pendingDda.length+' com DDA ainda não convertido · as demais exigem revisão.'));
 const toolbar=area(main,'hsn90-toolbar');const controlsRow=area(toolbar,'hsn90-toolbar-actions');
 controlsRow.append(btn('Conferir baixas selecionadas (mesma data)',()=>{
  const txs=relevant.filter(tx=>bankChecked.has(tx.id));if(!txs.length){window.alert('Marque os movimentos que deseja conferir.');return;}
  if(txs.some(tx=>duplicateIds.has(tx.id))){window.alert('O extrato contém lançamentos repetidos. Confira a origem antes de baixar.');return;}
  const differentDates=new Set(txs.map(tx=>tx.date));if(differentDates.size!==1){window.alert('Escolha movimentos do mesmo dia para a baixa em lote. Repita para outra data.');return;}
  const choices=txs.map(tx=>({tx,p:snap().payables.find(p=>p.id===bankSelection.get(tx.id))}));
  if(choices.some(x=>!x.p||!canPay(x.p)||cents(val(x.p))!==cents(Math.abs(x.tx.amount))||!candidates(x.tx).some(c=>c.p.id===x.p.id))){window.alert('Há contas inválidas ou valores incompatíveis. Revise o extrato e o DDA antes de baixar.');return;}
  if(choices.some(x=>!definiteIds.has(x.tx.id)||prepared.find(r=>r.tx.id===x.tx.id)?.list[0]?.p.id!==x.p.id)){
   window.alert('Conferência em lote permitida somente para correspondências fortes e sem conflitos. Movimentos sugeridos apenas por valor/data devem ser conferidos individualmente.');return;
  }
  const ids=new Set(choices.map(x=>x.p.id));if(ids.size!==choices.length){window.alert('Uma conta foi selecionada para mais de um movimento. Revise para evitar baixa duplicada.');return;}
  const total=choices.reduce((sum,x)=>sum+Math.abs(x.tx.amount),0);
  if(!confirm('Abrir conferência de '+choices.length+' pagamentos de '+dateBR(txs[0].date)+' no valor de '+money(total)+'? A baixa ainda exigirá confirmação dos dados.'))return;
  root.HSN_FINANCE.bulkPaid(choices.map(x=>x.p),{date:txs[0].date,reference:'Conciliação de '+choices.length+' lançamentos'});
 },'primary'));
 controlsRow.append(btn('Limpar seleção',()=>{bankChecked.clear();reconciliation();}));
 const wrap=area(main,'hsn90-table-wrap');const table=el('table',undefined,'hsn90-table');const h=el('thead'),hr=el('tr');for(const title of ['Marcar','Data','Histórico bancário','Saída','Conta sugerida','Ação'])hr.append(el('th',title));h.append(hr);table.append(h);const body=el('tbody');
 prepared.slice(0,300).forEach(({tx,list,dda,status})=>{
  const c=list[0],strong=definiteIds.has(tx.id),row=el('tr'),selectCell=el('td'),mark=el('input');
  mark.type='checkbox';mark.className='hsn86-checkbox';mark.checked=bankChecked.has(tx.id);mark.setAttribute('aria-label','Selecionar transação de '+dateBR(tx.date)+' '+tx.description);mark.onchange=()=>{mark.checked?bankChecked.add(tx.id):bankChecked.delete(tx.id);};selectCell.append(mark);row.append(selectCell);
  row.append(el('td',dateBR(tx.date)),el('td',tx.description),el('td',money(Math.abs(tx.amount)),'hsn90-money'));
  const choose=el('td');
  if(bankSelection.has(tx.id)&&!list.some(x=>x.p.id===bankSelection.get(tx.id)))bankSelection.delete(tx.id);
  if(strong&&!bankSelection.has(tx.id))bankSelection.set(tx.id,c.p.id);
  const sel=select([['','Não vincular / revisar'],...list.slice(0,12).map(a=>[a.p.id,a.p.title+' · '+dateBR(a.p.due_date)+' · '+money(val(a.p))+(a.distance>30?' · data distante':'')])],bankSelection.get(tx.id)||'');
  sel.setAttribute('aria-label','Selecionar conta para o movimento '+tx.description);sel.onchange=()=>{if(sel.value)bankSelection.set(tx.id,sel.value);else bankSelection.delete(tx.id);};choose.append(sel);
  const text=duplicateIds.has(tx.id)?'ALERTA: possível lançamento duplicado no extrato. Não efetue a baixa.':
   list.length?(strong?(c.ddaLinked?'Sugestão forte; conta originada do DDA. Confira o documento.':'Sugestão forte; confira fornecedor, valor e data.'):
    'Possível conta pelo valor'+(list[0].distance>30?' (vencimento distante)':' e data')+'. Confirme manualmente: o histórico bancário não identifica o beneficiário.'):
   dda.length?'Possível DDA pelo mesmo valor, ainda não convertido em conta. Confira antes de baixar.':
   status.blocked.length?'Existe conta com o mesmo valor, mas não liberada para baixa (assinatura/aprovação pendente).':
   status.paid.length?'Existe conta já marcada como paga com o mesmo valor. Confira para não duplicar a baixa.':
   'Nenhuma conta nem DDA compatível pelo valor foi encontrada. Confira se a despesa foi cadastrada.';
  choose.append(el('small',text,'hsn90-micro'));
  const evaluation=automatic.find(x=>x.tx.id===tx.id);
  if(evaluation?.status==='auto')choose.append(el('small','BAIXA AUTOMÁTICA ELEGÍVEL: '+evaluation.evidence,'hsn97-bank-status hsn97-success'));
  else if(evaluation?.status==='scheduled')choose.append(el('small','AGENDADA: não baixada. '+evaluation.reason,'hsn97-bank-status'));
  else if(evaluation?.status==='paid')choose.append(el('small','JÁ PAGA no HSN: sem nova baixa.','hsn97-bank-status hsn97-success'));
  else if(evaluation?.status==='review')choose.append(el('small','REVISÃO: '+evaluation.reason,'hsn97-bank-status'));

  if(dda.length){const best=dda[0],line=el('small','DDA: '+best.supplier_name+' · vence '+dateBR(best.due_date)+' · '+money(best.amount)+(dda.length>1?' (+'+(dda.length-1)+' outro(s))':''),'hsn90-micro');
   const action=btn('Abrir DDA',()=>root.HSN_FINANCE.navigate('dda'));action.classList.add('hsn90-dda-open');choose.append(line,action);
  }
  if(status.blocked.length&&!list.length&&!dda.length)choose.append(el('small','Conta pendente: '+status.blocked[0].title+' · '+dateBR(status.blocked[0].due_date),'hsn90-micro'));
  if(status.paid.length&&!list.length&&!dda.length)choose.append(el('small','Conta paga: '+status.paid[0].title+' · '+dateBR(status.paid[0].due_date),'hsn90-micro'));
  row.append(choose);
  const actions=el('td');const act=btn('Conferir baixa',()=>{
   const id=sel.value,payable=snap().payables.find(p=>p.id===id);
   if(!payable){window.alert('Escolha uma conta válida antes de conferir.');return;}
   if(!canPay(payable)){window.alert('A conta ainda não está apta à baixa. Confirme a assinatura no banco e atualize a etapa primeiro.');return;}
   if(duplicateIds.has(tx.id)){window.alert('Lançamento repetido no extrato. Confira a origem antes da baixa.');return;}
   if(cents(val(payable))!==cents(Math.abs(tx.amount))){window.alert('Valor da conta diferente do extrato. Baixa bloqueada até a conferência.');return;}
   const choice=candidates(tx).find(c=>c.p.id===payable.id);
   if(!choice){window.alert('A conta não é uma correspondência válida deste movimento.');return;}
   if([...bankSelection.values()].filter(x=>x===id).length>1){window.alert('Esta conta foi relacionada a mais de um movimento do extrato. Revise para evitar baixa duplicada.');return;}
   const weak=!strong||c?.p.id!==payable.id;
   const confirmMessage=(weak?'ATENÇÃO: correspondência não confirmada pelo histórico bancário. Mesmo valor não comprova o mesmo pagamento. Confira fornecedor, documento e comprovante no banco.\n\n':'')+
    'Abrir conferência da conta '+payable.title+' para o movimento de '+dateBR(tx.date)+' de '+money(Math.abs(tx.amount))+'? A baixa ainda exigirá confirmação no formulário.';
   if(!confirm(confirmMessage))return;
   root.HSN_FINANCE.bulkPaid([payable],{date:tx.date,reference:tx.reference});
  },'primary');act.disabled=!list.length;actions.append(act);row.append(actions);body.append(row);
 });table.append(body);wrap.append(table);
 if(relevant.length>300)main.append(el('p','Exibindo os primeiros 300 movimentos. Use extratos menores para conferir o restante.','hsn90-hint'));

}
// Busca indexada de títulos já cadastrados: evita percorrer todas as contas para cada boleto DDA.
let ddaLookupCache=null;
function ddaLookup(bankPayables){
 const snapshot=snap();
 if(ddaLookupCache?.records===bankPayables&&ddaLookupCache.suppliers===snapshot.suppliers)return ddaLookupCache;
 const byAmount=new Map(),byDoc=new Map(),byBarcode=new Map(),supplierById=new Map(snapshot.suppliers.map(s=>[s.id,s]));
 const add=(index,key,p)=>{if(!key)return;const list=index.get(key)||[];list.push(p);index.set(key,list);};
 for(const p of bankPayables){if(p.archived)continue;
  add(byAmount,cents(val(p)),p);
  const doc=norm(p.document_number).replace(/\s/g,''),bar=String(p.barcode||'').replace(/\D/g,'');
  if(doc.length>=6)add(byDoc,doc,p);if(bar.length>=30)add(byBarcode,bar,p);
 }
 const result={records:bankPayables,suppliers:snapshot.suppliers,byAmount,byDoc,byBarcode,supplierById};
 if(bankPayables===snapshot.payables)ddaLookupCache=result;
 return result;
}
function ddaSuggestions(c,bankPayables=snap().payables){
 if(c.converted_payable_id||c.linked_payable_id)return [];
 const index=ddaLookup(bankPayables),doc=norm(c.document_number).replace(/\s/g,''),bar=String(c.barcode||'').replace(/\D/g,''),amt=cents(c.amount),tax=String(c.tax_id||'').replace(/\D/g,'');
 const possible=new Map();
 for(const p of index.byAmount.get(amt)||[])possible.set(p.id,p);
 if(doc.length>=6)for(const p of index.byDoc.get(doc)||[])possible.set(p.id,p);
 if(bar.length>=30)for(const p of index.byBarcode.get(bar)||[])possible.set(p.id,p);
 const hits=[];
 for(const p of possible.values()){
  const sameDoc=doc.length>=6&&norm(p.document_number).replace(/\s/g,'')===doc;
  const sameBar=bar.length>=30&&String(p.barcode||'').replace(/\D/g,'')===bar;
  const supp=index.supplierById.get(p.supplier_id);
  const pTax=String(supp?.tax_id||'').replace(/\D/g,'');
  const sameSupplier=(!!tax&&tax===pTax)||!!(norm(c.supplier_name)&&(norm(c.supplier_name)===norm(supp?.legal_name)||norm(c.supplier_name)===norm(supp?.trade_name)));
  const sameDate=p.due_date===c.due_date,sameAmount=amt===cents(val(p));
  if(!(sameDoc||sameBar||(sameSupplier&&sameDate&&sameAmount)))continue;
  const reason=sameBar?'Mesmo código de barras':sameDoc?'Mesmo número de documento':'Mesmo fornecedor, valor e vencimento';
  const discrepancy=(sameDoc||sameBar)&&(!sameDate||!sameAmount)?' (atenção: data/valor divergente)':'';
  hits.push({p,reason:reason+discrepancy,strong:sameDoc||sameBar});
 }
 return hits.sort((a,b)=>Number(b.strong)-Number(a.strong)).slice(0,3);
}
function appendDdaReview(card,c){const matches=ddaSuggestions(c);if(!matches.length)return;
 const region=el('div',undefined,'hsn90-dda-existing');region.append(el('strong','Possível conta já cadastrada'),el('p','Confira antes de converter: '+matches[0].reason+'. A correspondência não cria vínculo automaticamente.'));
 for(const entry of matches){region.append(btn('Abrir '+entry.p.title+' · '+money(val(entry.p)),()=>openAccount(entry.p)));}card.append(region);
}
function reset(){bankRows=[];bankSelection.clear();bankChecked.clear();bankLookupCache=null;bankFileInfo='';bankError='';approvalSelected.clear();agendaSelected.clear();}
root.HSN90={handles:v=>['approvals','reconciliation','payments_agenda'].includes(v),render:v=>v==='approvals'?approval():v==='reconciliation'?reconciliation():agenda(),ddaSuggestions,appendDdaReview,parseCsv,parseOfx,parseStatementCsv,parseBankFile,candidates,reset};
})(window);
