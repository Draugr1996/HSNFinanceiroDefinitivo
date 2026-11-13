/* Regras financeiras compartilhadas. Valores calculados em centavos. */
(function(root){'use strict';
 const cents=value=>{const n=Number(value);if(value===null||value===''||!Number.isFinite(n)||Math.abs(n)>999999999999.99)throw Error('Valor financeiro inválido.');return Math.round(n*100);};
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 function balance(p,kind='payable'){
  const value=kind==='receivable'?p.amount:p.actual_amount??p.estimated_amount??0;
  const total=cents(value),paid=p.paid_amount!=null?cents(p.paid_amount):((p.payment_status||p.status)==='paid'?total:0);
  const cancelled=!!p.cancelled_at||p.workflow_status==='cancelled';
  return {total:total/100,paid:paid/100,pending:cancelled?0:Math.max(0,total-paid)/100,cancelled,estimated:kind==='payable'&&p.actual_amount==null};
 }
 function status(p,kind='payable',day=today()){
  const b=balance(p,kind);if(b.cancelled)return 'cancelled';if(b.total>0&&b.pending===0)return 'paid';if(b.paid>0)return 'partial';return p.due_date<day?'overdue':p.due_date===day?'today':'open';
 }
 function missingBilling(p){const required=p.required_billing_docs||['extrato','voucher','nota_fiscal','boleto'];const docs=p.billing_documents||{};return required.filter(k=>!String(docs[k]||'').trim());}
 function billingState(p,day=today()){
  if(p.cancelled_at)return {key:'cancelled',label:'Cancelado'};
  if(p.billing_sent_at)return {key:'sent',label:'Faturamento enviado'};
  if(!p.stay_reference||!p.guest_name||!p.check_in||!p.check_out)return {key:'stay',label:'Completar hospedagem'};
  const missing=missingBilling(p);if(missing.length)return {key:'documents',label:'Faltam: '+missing.join(', ')};
  return {key:p.check_out<=day?'pending':'ready',label:p.check_out<day?'Envio atrasado desde o check-out':p.check_out===day?'Enviar hoje · check-out':'Pronto para envio'};
 }
 function summary(payables,receivables,events,{start='0001-01-01',end='9999-12-31',company='',day=today()}={}){
  if(start>end)throw Error('Data inicial posterior à final.');
  const party=(p,k)=>!company||(k==='receivable'?norm(p.company):norm(p.company_name||p.supplier_name))===norm(company);
  const inPeriod=d=>!!d&&d>=start&&d<=end;
  // Arquivamento é organização visual; não extingue uma obrigação financeira.
  const ps=payables.filter(p=>party(p,'payable')),rs=receivables.filter(p=>party(p,'receivable'));
  const total=(rows,k,fn)=>rows.reduce((n,p)=>n+cents(fn(balance(p,k),p)),0)/100;
  const ids={payable:new Set(ps.map(p=>p.id)),receivable:new Set(rs.map(p=>p.id))};
  const cash=events.filter(e=>ids[e.kind]?.has(e.target_id)&&inPeriod(e.payment_date));
  const paidCash=k=>cash.filter(e=>e.kind===k).reduce((n,e)=>n+cents(e.amount)*(e.reverses_id?-1:1),0)/100;
  return {receivable:total(rs.filter(p=>inPeriod(p.due_date)),'receivable',b=>b.pending),overdue:total(rs.filter(p=>p.due_date<day&&inPeriod(p.due_date)),'receivable',b=>b.pending),payable:total(ps.filter(p=>inPeriod(p.due_date)),'payable',b=>b.pending),received:paidCash('receivable'),paid:paidCash('payable'),cancelled:total(rs.filter(p=>inPeriod(p.due_date)),'receivable',b=>b.cancelled?b.total:0),undated:rs.filter(p=>balance(p,'receivable').paid>0&&!events.some(e=>e.kind==='receivable'&&e.target_id===p.id&&!!e.payment_date)).length};
 }
 function parseCSV(text){
  const source=String(text).replace(/^\uFEFF/,''),first=source.split(/\r?\n/)[0];
  const delimiter=[';',',','\t'].map(d=>[d,first.split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(value.trim());value='';}else if(/[\r\n]/.test(c)&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}
  if(quoted)throw Error('CSV contém aspas sem fechamento.');row.push(value.trim());if(row.some(Boolean))rows.push(row);return rows;
 }
 function sicoobPreview(matrix,existing=[]){
  let cols=null;const result=[],seen=new Set();
  for(let i=0;i<matrix.length;i++){
   const r=matrix[i],h=r.map(norm);if(h.includes('sacado')&&h.some(x=>x.includes('vencimento'))){const ix=s=>h.findIndex(x=>x.includes(s));cols={company:ix('sacado'),reference:ix('nosso numero'),document:h.findIndex(x=>/numero do documento|numero documento|seu numero/.test(x)),due:ix('vencimento'),amount:ix('valor')};if(Object.entries(cols).some(([k,v])=>k!=='document'&&v<0))throw Error('Cabeçalho Sicoob incompleto.');continue;}
   if(!cols)continue;if(!r.some(x=>String(x).trim()))continue;
   const entry={line:i+1,selected:false,outcome:'error',message:'',payload:null};
   try{const company=String(r[cols.company]||'').trim(),reference=String(r[cols.reference]||'').trim();if(!company||!reference)throw Error('Sacado e nosso número são obrigatórios.');const due=root.HSN_IMPORT_RULES.date(r[cols.due]);const amount=root.HSN_IMPORT_RULES.currency(r[cols.amount]);if(amount<=0)throw Error('Valor deve ser maior que zero.');entry.payload={company,reference,external_reference:cols.document>=0?String(r[cols.document]||'').trim():'',due_date:due,amount};
    const key=norm(reference),old=existing.filter(x=>norm(x.reference)===key);
    if(seen.has(key)){entry.outcome='ignored';entry.message='Nosso número repetido neste arquivo.';}
    else if(old.length){const match=old.length===1&&old[0];entry.outcome=match&&cents(match.amount)===cents(amount)&&match.due_date===due&&norm(match.company)===norm(company)&&String(match.external_reference||'')===entry.payload.external_reference?'ignored':'error';entry.message=entry.outcome==='ignored'?'Título já cadastrado; saldo e histórico preservados.':'Nosso número existente com dados diferentes. Corrija o título existente.';}
    else{entry.outcome='ready';entry.message='Novo título · conferir antes de importar.';entry.selected=true;}seen.add(key);
   }catch(e){entry.message=e.message;}
   result.push(entry);
  }
  if(!cols)throw Error('Cabeçalho Sicoob não encontrado.');return result;
 }
 const api={cents,norm,today,balance,status,summary,missingBilling,billingState,parseCSV,sicoobPreview};
 root.HSN_MONEY=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
