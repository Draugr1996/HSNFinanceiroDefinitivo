/* Financeiro HSN 9.1 — comparação conservadora antes de CADASTRAR.
 * Não altera pagamentos, anexos, vínculos DDA ou o banco de dados.
 * Compara registros ATIVOS e impede coincidências fortes. Coincidências
 * fracas permanecem como avisos para revisão humana.
 */
(function(root){'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tax=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
function currency(v){if(typeof v==='number'){if(!Number.isFinite(v)||v<0||v>999999999999.99)throw Error('Valor inválido');return Math.round(v*100)/100;}let s=String(v??'').trim().replace(/R\$\s*/gi,'').replace(/\s/g,'');if(!s)throw Error('Valor obrigatório');if(!/^\d[\d.,]*$/.test(s))throw Error('Valor inválido');if(s.includes(',')){if(!/^\d{1,3}(?:\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s))throw Error('Formato de valor inválido');s=s.replace(/\./g,'').replace(',','.');}else if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('Use número ou valor com vírgula decimal');const n=Number(s);if(!Number.isFinite(n)||n>999999999999.99)throw Error('Valor fora do limite');return Math.round(n*100)/100;}
function date(v,serialParser){if(typeof v==='number'){if(!serialParser)throw Error('Data Excel sem decodificador');const d=serialParser(v);if(!d)throw Error('Data Excel inválida');const s=String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0');HSN_DATES.parse(s);return s;}const s=String(v||'').trim();let iso=s;if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))iso=s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);HSN_DATES.parse(iso);return iso;}
function competence(v){const s=String(v||'').trim();if(/^\d{4}-(0[1-9]|1[0-2])$/.test(s))return s+'-01';if(/^(0[1-9]|1[0-2])\/\d{4}$/.test(s))return s.slice(3)+'-'+s.slice(0,2)+'-01';throw Error('Competência deve ser AAAA-MM ou MM/AAAA');}
// Palavras societárias frequentes não identificam uma empresa. Apelidos são
// normalizados APENAS para levantar suspeitas, nunca para fusão automática.
const ignore=new Set(['de','da','das','do','dos','e','a','o','sa','s','ltda','me','eireli','epp','ind','industria','com','comercio','comercial','empresa','co','cia','sociedade','servicos','servico','brasil','industrias']);
const alias={'lat':'laticinios','laticinio':'laticinios','laticinios':'laticinios','distribuidora':'distrib','distribuidor':'distrib','distrib':'distrib','certificacao':'certificacao','certificadora':'certificacao'};
function tokens(v){return [...new Set(String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(t=>alias[t]||t).filter(t=>t.length>=2&&!ignore.has(t)))];}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.length||!B.length)return 0;const common=A.filter(t=>B.includes(t));if(!common.length)return 0;const coverage=common.length/Math.min(A.length,B.length);const span=common.length/Math.max(A.length,B.length);
 if(A.length===1||B.length===1)return A[0]===B[0]&&A[0].length>=4?1:0;
 return common.length>=2&&coverage>=.67&&span>=.4?(coverage+span)/2:0;
}
function canonical(record,suppliers=[]){const s=suppliers.find(r=>r.id===record.supplier_id);let barcode=String(record.barcode||'').replace(/\D/g,'');if(barcode&&typeof HSN_BOLETOS!=='undefined'){try{barcode=HSN_BOLETOS.read(barcode).barcode||barcode;}catch{}}
 const person=record.supplier_name||s?.legal_name||s?.trade_name||'';
 return {id:record.id||'',title:record.title||'',supplier:normalize(person),supplierText:person,trade:s?.trade_name||'',supplierId:record.supplier_id||'',tax:tax(record.tax_id||s?.tax_id||''),value:Number(record.actual_amount??record.amount??record.estimated_amount),date:record.original_due_date||record.due_date,number:normalize(record.document_number),barcode,archived:record.archived===true,module:record.module||''};}
function match(a,b){const sameValue=Number.isFinite(a.value)&&Number.isFinite(b.value)&&a.value>0&&b.value>0&&Math.round(a.value*100)===Math.round(b.value*100);
 const sameDate=!!a.date&&a.date===b.date;
 const partyById=!!a.supplierId&&a.supplierId===b.supplierId;
 const partyByTax=!!a.tax&&a.tax===b.tax;
 const partyByName=!!a.supplier&&a.supplier===b.supplier;
 const similar=Math.max(similarity(a.supplierText,b.supplierText),similarity(a.supplierText,b.title),similarity(a.title,b.supplierText),similarity(a.title,b.title));
 const sameParty=partyById||partyByTax||partyByName||similar>=.75;
 const docConflict=!!a.number&&!!b.number&&a.number!==b.number;
 const evidence=[];let risk='review';
 if(a.barcode&&b.barcode&&a.barcode===b.barcode){evidence.push('Linha digitável/código de barras idêntico');risk='block';}
 if(a.number&&a.number===b.number&&sameDate&&(sameParty||sameValue)){evidence.push('Mesmo documento e fornecedor ou valor no mesmo vencimento');risk='block';}
 if(sameValue&&sameDate&&sameParty&&!docConflict){evidence.push('Mesmo fornecedor (incluindo nome abreviado), valor e vencimento');risk='block';}
 if(!evidence.length&&sameValue&&sameDate&&!docConflict&&similar>=.5){evidence.push('Fornecedor possivelmente equivalente, mesmo valor e vencimento');risk='review';}
 if(!evidence.length&&sameValue&&sameDate&&sameParty&&docConflict){evidence.push('Mesma empresa, valor e vencimento; documentos distintos — conferir');risk='review';}
 return evidence.length?{risk,reasons:evidence}:null;
}
function suspects(candidate,existing,suppliers=[]){const a=canonical(candidate,suppliers);const hits=[];for(const row of existing){if(candidate.id&&row.id===candidate.id)continue;const b=canonical(row,suppliers),m=match(a,b);if(m)hits.push({record:row,reasons:m.reasons,risk:b.archived?'archived':m.risk});}return hits;}
function blocking(candidate,existing,suppliers=[]){return suspects(candidate,existing,suppliers).filter(x=>x.risk==='block');}
function describe(hits,limit=3){return hits.slice(0,limit).map(h=>{const p=h.record;return (p.title||p.supplier_name||'Conta existente')+' · '+(p.due_date||'')+' · R$ '+Number(p.actual_amount??p.estimated_amount??p.amount??0).toFixed(2)+' ('+h.reasons.join(', ')+')';}).join(' | ');}
function report(records,{start,end,typeId='',supplierId='',status=''}={}){return records.filter(p=>!p.archived&&p.due_date>=start&&p.due_date<=end&&(!typeId||p.type_id===typeId)&&(!supplierId||p.supplier_id===supplierId)&&(!status||HSN_DATES.status(p)===status)).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.title.localeCompare(b.title));}
function totals(records){return records.filter(p=>!p.archived).reduce((r,p)=>{const n=Number(p.actual_amount??p.estimated_amount??0);r.total+=n;if(p.payment_status==='paid')r.paid+=n;else r.pending+=n;return r;},{total:0,paid:0,pending:0});}
root.HSN_IMPORT_RULES={normalize,tax,currency,date,competence,canonical,suspects,blocking,describe,tokens,similarity,report,totals};
})(typeof window!=='undefined'?window:globalThis);
