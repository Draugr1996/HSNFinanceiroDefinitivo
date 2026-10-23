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
function parseOfx(text){const matches=[...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)];return matches.map((m,i)=>({date:parseDate(ofxTag(m[1],'DTPOSTED')),amount:numberBR(ofxTag(m[1],'TRNAMT')),description:ofxTag(m[1],'MEMO')||ofxTag(m[1],'NAME')||'Movimentação bancária',reference:ofxTag(m[1],'FITID')||String(i+1),kind:ofxTag(m[1],'TRNTYPE')}));}
function parseStatementCsv(text){const rows=parseCsv(text);if(rows.length<2)throw Error('O CSV não contém linhas suficientes.');
 const signatures={date:['data','data lancamento','data movimento','dt lancamento','date'],amount:['valor','valor r','amount','valor lancamento'],debit:['debito','valor debito','saida','saidas','valor saida'],credit:['credito','valor credito','entrada','entradas'],description:['historico','descricao','detalhes','descricao lancamento','estabelecimento','favorecido','nome','memo'],reference:['documento','numero documento','identificador','id transacao','autenticacao','referencia']};
 let headerIndex=-1,mapping=null;
 for(let i=0;i<Math.min(rows.length,16);i++){const cols=rows[i].map(norm),map={};for(const [kind,words]of Object.entries(signatures))map[kind]=cols.findIndex(c=>words.includes(c));if(map.date>=0&&(map.amount>=0||map.debit>=0)){headerIndex=i;mapping=map;break;}}
 if(headerIndex<0)throw Error('Não identifiquei colunas de data e valor/débito. Confira o layout do extrato antes de tentar novamente.');
 return rows.slice(headerIndex+1).map((r,i)=>{let amount=mapping.debit>=0?-Math.abs(numberBR(r[mapping.debit])):numberBR(r[mapping.amount]);const debit= mapping.debit>=0&&r[mapping.debit]!==''&&!Number.isNaN(amount);if(mapping.debit>=0&&!debit&&mapping.amount<0)amount=NaN;
 return {date:parseDate(r[mapping.date]),amount,description:r[mapping.description]||'Movimentação bancária',reference:r[mapping.reference]||'Linha '+(headerIndex+i+2),kind:debit?'DEBIT':''};});
}
function parseBankFile(name,text){const rows=/\.ofx$/i.test(name)?parseOfx(text):parseStatementCsv(text);const parsed=rows.filter(x=>x.date&&Number.isFinite(x.amount)&&x.amount!==0).map((x,i)=>({...x,id:'tx'+i}));if(!parsed.length)throw Error('Nenhuma movimentação bancária com data e valor válido foi encontrada.');return parsed.slice(0,2000);}
function dateDiff(a,b){try{return Math.abs((root.HSN_DATES.parse(a)-root.HSN_DATES.parse(b))/86400000);}catch{return 9999;}}
function candidates(tx){
 if(tx.amount>=0&&!bankPositiveAllowed)return [];
 const amount=Math.abs(tx.amount),options=[];
 for(const p of snap().payables){if(!canPay(p))continue;if(Math.abs(cents(val(p))-cents(amount))>1)continue;
 const distance=dateDiff(tx.date,p.due_date);if(distance>30)continue;
 const supp=snap().suppliers.find(s=>s.id===p.supplier_id);const tokens=norm([supp?.legal_name,supp?.trade_name,p.title].join(' ')).split(' ').filter(s=>s.length>3);
 const description=norm(tx.description);const common=tokens.filter(t=>description.includes(t));let score=40+Math.max(0,25-distance*2)+Math.min(30,common.length*12);
 if(p.bank_scheduled_date&&dateDiff(tx.date,p.bank_scheduled_date)<=2)score+=12;
 options.push({p,score,distance,nameMatch:common.length>0});
 }
 return options.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.p.due_date.localeCompare(b.p.due_date));
}
async function readStatement(file){
 if(!file)return;if(file.size>5*1024*1024){bankError='O arquivo deve ter até 5 MB.';reconciliation();return;}
 if(!/\.(ofx|csv)$/i.test(file.name)){bankError='Selecione um extrato .OFX ou .CSV.';reconciliation();return;}
 try{let text=await file.text();if(text.includes('\uFFFD')&&/\.csv$/i.test(file.name)){try{const buffer=await file.arrayBuffer();text=new TextDecoder('windows-1252').decode(buffer);}catch{}}
  bankRows=parseBankFile(file.name,text);bankSelection.clear();bankChecked.clear();bankFileInfo=file.name+' · '+bankRows.length+' movimento(s) reconhecido(s)';bankError='';
  bankFileWarning=bankRows.filter(x=>x.amount>=0).length+' crédito(s)/valor(es) positivos foram excluídos das sugestões por padrão.';
 }catch(e){bankError=e.message||'Falha ao ler o arquivo.';bankRows=[];bankSelection.clear();bankChecked.clear();}reconciliation();
}
function reconciliation(){
 setupPage('Conciliação bancária','Importe um extrato OFX ou CSV. O sistema sugere vínculos; a baixa só ocorre após conferência e confirmação.','reconciliation');
 const controls=document.getElementById('finance-controls');const input=el('input');input.type='file';input.accept='.ofx,.csv,text/csv,application/x-ofx';input.setAttribute('aria-label','Extrato bancário OFX ou CSV');input.onchange=()=>readStatement(input.files[0]);controls.append(label('Selecionar extrato do banco',input));
 const choose=el('label',undefined,'hsn90-check');const ck=el('input');ck.type='checkbox';ck.checked=bankPositiveAllowed;ck.onchange=()=>{bankPositiveAllowed=ck.checked;bankSelection.clear();bankChecked.clear();reconciliation();};choose.append(ck,el('span','O CSV contém apenas pagamentos: considerar também valores positivos (requer conferência manual).'));controls.append(choose);
 const main=document.getElementById('records');const hint=area(main,'hsn90-note');hint.append(el('strong','Conciliação assistida: não movimenta dinheiro.'),el('p','Pagamentos já baixados, contas canceladas ou sem assinatura confirmada não recebem sugestões para baixa. O arquivo fica somente na memória desta aba. Extratos bancários variam de formato; revise valores, datas e beneficiários.'));
 if(bankError)main.append(el('p',bankError,'hsn90-error'));if(!bankRows.length){empty(main,'Selecione um arquivo OFX ou CSV do Sicoob para começar. Nenhum registro será criado no banco.');return;}
 main.append(el('h3',bankFileInfo));if(bankFileWarning)main.append(el('p',bankFileWarning,'hsn90-hint'));
 const relevant=bankRows.filter(tx=>tx.amount<0||bankPositiveAllowed);
 const stat=area(main,'hsn90-reconcile-summary');const definite=relevant.filter(tx=>{const c=candidates(tx);return c.length&&c[0].score>=65&&c[0].nameMatch&&(c.length===1||c[0].score-c[1].score>=20);});stat.append(el('strong',relevant.length+' movimento(s) elegível(is) · '+definite.length+' correspondência(s) fortes'),el('span','Sugestões não são confirmação de pagamento.'));
 const toolbar=area(main,'hsn90-toolbar');const controlsRow=area(toolbar,'hsn90-toolbar-actions');
 controlsRow.append(btn('Conferir baixas selecionadas (mesma data)',()=>{
  const txs=relevant.filter(tx=>bankChecked.has(tx.id));if(!txs.length){window.alert('Marque os movimentos que deseja conferir.');return;}
  const differentDates=new Set(txs.map(tx=>tx.date));if(differentDates.size!==1){window.alert('Escolha movimentos do mesmo dia para a baixa em lote. Repita para outra data.');return;}
  const choices=txs.map(tx=>({tx,p:snap().payables.find(p=>p.id===bankSelection.get(tx.id))}));
  if(choices.some(x=>!x.p||!canPay(x.p))){window.alert('Há movimentos sem conta válida ou ainda aguardando assinatura. Revise a seleção.');return;}
  const ids=new Set(choices.map(x=>x.p.id));if(ids.size!==choices.length){window.alert('Uma conta foi selecionada para mais de um movimento. Revise para evitar baixa duplicada.');return;}
  const total=choices.reduce((sum,x)=>sum+Math.abs(x.tx.amount),0);
  if(!confirm('Abrir conferência de '+choices.length+' pagamentos de '+dateBR(txs[0].date)+' no valor de '+money(total)+'? A baixa ainda exigirá confirmação dos dados.'))return;
  root.HSN_FINANCE.bulkPaid(choices.map(x=>x.p),{date:txs[0].date,reference:'Conciliação de '+choices.length+' lançamentos'});
 },'primary'));
 controlsRow.append(btn('Limpar seleção',()=>{bankChecked.clear();reconciliation();}));
 const wrap=area(main,'hsn90-table-wrap');const table=el('table',undefined,'hsn90-table');const h=el('thead'),hr=el('tr');for(const title of ['Marcar','Data','Histórico bancário','Saída','Conta sugerida','Ação'])hr.append(el('th',title));h.append(hr);table.append(h);const body=el('tbody');
 relevant.slice(0,300).forEach(tx=>{const list=candidates(tx),c=list[0],strong=c&&c.score>=65&&c.nameMatch&&(list.length===1||c.score-list[1].score>=20);const row=el('tr');const selectCell=el('td'),mark=el('input');mark.type='checkbox';mark.className='hsn86-checkbox';mark.checked=bankChecked.has(tx.id);mark.setAttribute('aria-label','Selecionar transação de '+dateBR(tx.date)+' '+tx.description);mark.onchange=()=>{mark.checked?bankChecked.add(tx.id):bankChecked.delete(tx.id);};selectCell.append(mark);row.append(selectCell);
 row.append(el('td',dateBR(tx.date)),el('td',tx.description),el('td',money(Math.abs(tx.amount)),'hsn90-money'));
 const choose=el('td'),sel=select([['','Não vincular / revisar'],...list.slice(0,12).map(a=>[a.p.id,a.p.title+' · '+dateBR(a.p.due_date)+' · '+money(val(a.p))])],bankSelection.get(tx.id)||(strong?c.p.id:''));if(strong&&!bankSelection.has(tx.id))bankSelection.set(tx.id,c.p.id);
 sel.setAttribute('aria-label','Selecionar conta para o movimento '+tx.description);sel.onchange=()=>{if(sel.value)bankSelection.set(tx.id,sel.value);else bankSelection.delete(tx.id);};choose.append(sel);
 choose.append(el('small',list.length?strong?'Sugestão forte; confirme fornecedor, valor e data.':'Correspondência não conclusiva: revise manualmente.':'Nenhuma conta aberta com valor e data próximos.','hsn90-micro'));row.append(choose);
 const actions=el('td');const act=btn('Conferir baixa',()=>{const id=sel.value;const payable=snap().payables.find(p=>p.id===id);if(!payable){window.alert('Escolha uma conta válida antes de conferir.');return;}if(!canPay(payable)){window.alert('A conta ainda não está apta à baixa. Confirme a assinatura no banco e atualize a etapa primeiro.');return;}if(!confirm('Conferir a baixa da conta '+payable.title+' com base neste lançamento de '+dateBR(tx.date)+'? Você ainda revisará data, valor e confirmação no formulário.'))return;root.HSN_FINANCE.bulkPaid([payable],{date:tx.date,reference:tx.reference});},'primary');act.disabled=!list.length;actions.append(act);row.append(actions);body.append(row);
 });table.append(body);wrap.append(table);
 if(relevant.length>300)main.append(el('p','Exibindo os primeiros 300 movimentos. Use extratos menores para conferir o restante.','hsn90-hint'));
}
function ddaSuggestions(c,bankPayables=snap().payables){
 if(c.converted_payable_id)return [];
 const doc=norm(c.document_number).replace(/\s/g,''),bar=String(c.barcode||'').replace(/\D/g,''),amt=cents(c.amount);
 const tax=String(c.tax_id||'').replace(/\D/g,'');const supplierIds=new Set(snap().suppliers.filter(s=>tax&&String(s.tax_id||'').replace(/\D/g,'')===tax).map(s=>s.id));
 const items=[];for(const p of bankPayables){if(p.archived)continue;const pDoc=norm(p.document_number).replace(/\s/g,'');const pBar=String(p.barcode||'').replace(/\D/g,'');const sameDoc=doc.length>=4&&pDoc===doc;const sameBar=bar.length>=30&&bar===pBar;
 const sameSupplier=supplierIds.has(p.supplier_id);const sameDate=p.due_date===c.due_date;const sameAmount=amt===cents(val(p));
 const similar=(sameDoc||sameBar)?'Correspondência de documento/código':sameSupplier&&sameDate&&sameAmount?'Mesmo fornecedor, valor e vencimento':null;
 if(similar)items.push({p,reason:similar,strong:sameDoc||sameBar});
 }return items.sort((a,b)=>Number(b.strong)-Number(a.strong)).slice(0,3);
}
function appendDdaReview(card,c){const matches=ddaSuggestions(c);if(!matches.length)return;
 const region=el('div',undefined,'hsn90-dda-existing');region.append(el('strong','Possível conta já cadastrada'),el('p','Confira antes de converter: '+matches[0].reason+'. A correspondência não cria vínculo automaticamente.'));
 for(const entry of matches){region.append(btn('Abrir '+entry.p.title+' · '+money(val(entry.p)),()=>openAccount(entry.p)));}card.append(region);
}
function reset(){bankRows=[];bankSelection.clear();bankChecked.clear();bankFileInfo='';bankError='';approvalSelected.clear();agendaSelected.clear();}
root.HSN90={handles:v=>['approvals','reconciliation','payments_agenda'].includes(v),render:v=>v==='approvals'?approval():v==='reconciliation'?reconciliation():agenda(),ddaSuggestions,appendDdaReview,parseCsv,parseOfx,parseStatementCsv,parseBankFile,candidates,reset};
})(window);
