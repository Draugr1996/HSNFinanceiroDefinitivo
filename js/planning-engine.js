/* Cálculos sem efeitos no banco. Datas civis e valores em centavos. */
(function(root){'use strict';
const D=()=>root.HSN_DATES;
const cents=n=>{const v=Number(n);if(!Number.isFinite(v)||v<0)throw Error('Valor inválido na previsão.');return Math.round(v*100);};
const amount=p=>cents(p.actual_amount??p.estimated_amount??0);
function shiftMonth(month,n){D().parse(month+'-01');const d=D().parse(month+'-01');d.setUTCMonth(d.getUTCMonth()+n);return D().format(d).slice(0,7);}
function meanHistory(records,modelId,competence){const history=records.filter(p=>!p.archived&&p.model_id===modelId&&p.payment_status==='paid'&&p.actual_amount!==null&&p.competence<competence).sort((a,b)=>b.competence.localeCompare(a.competence)).slice(0,3);return {history,mean:history.length?Math.round(history.reduce((s,p)=>s+cents(p.actual_amount),0)/history.length):null};}
function projections(snapshot,start,end){D().parse(start);D().parse(end);if(start>end)throw Error('Período inválido.');const output=[];
 // Inclui mês vizinho para vencimentos ajustados que atravessam a virada do mês.
 const first=shiftMonth(start.slice(0,7),-1),last=shiftMonth(end.slice(0,7),1);
 for(let month=first;month<=last;month=shiftMonth(month,1))for(const m of snapshot.models){const competence=month+'-01';if(!m.active||competence<m.first_month||(m.last_month&&competence>m.last_month)||snapshot.payables.some(p=>p.model_id===m.id&&p.competence===competence))continue;
 const due=D().adjust(D().monthDay(month,m.due_day),m.due_rule,snapshot.holidays);if(due<start||due>end)continue;
 const h=meanHistory(snapshot.payables,m.id,competence);output.push({id:'projection:'+m.id+':'+month,model_id:m.id,supplier_id:m.supplier_id,type_id:m.type_id,title:m.title,competence,due_date:due,estimated_amount:(h.mean??cents(m.estimated_amount))/100,actual_amount:null,payment_status:'open',projection:true,archived:false});}
 return output;
}
function forecast(snapshot,start,end,{type='',supplier=''}={}){D().parse(start);D().parse(end);if(start>end)throw Error('Período inválido.');const matches=p=>(!type||p.type_id===type)&&(!supplier||p.supplier_id===supplier);const source=snapshot.payables.filter(p=>!p.archived&&matches(p));const due=source.filter(p=>p.due_date>=start&&p.due_date<=end);const projected=projections(snapshot,start,end).filter(matches);const realized=source.filter(p=>p.payment_status==='paid'&&p.paid_date>=start&&p.paid_date<=end);
 const sum=rows=>rows.reduce((s,p)=>s+amount(p),0);const pending=due.filter(p=>p.payment_status!=='paid');return {due,projected,realized,total:sum(due)+sum(projected),registered:sum(due),pending:sum(pending),paidDue:sum(due.filter(p=>p.payment_status==='paid')),paid:sum(realized),projectionTotal:sum(projected),estimated:sum(due.filter(p=>p.actual_amount===null))+sum(projected)};
}
function weeks(start,end){const result=[];let date=start;while(date<=end){const day=D().parse(date).getUTCDay(),finish=D().add(date,(7-day)%7),stop=finish>end?end:finish;result.push({start:date,end:stop});date=D().add(stop,1);}return result;}
function difference(current,previous){return {amount:current-previous,percent:previous===0?null:(current-previous)/previous*100};}
function adjustments(models,today=D().today()){return models.filter(m=>m.active&&m.contract_adjustment_date&&D().add(today,Number(m.contract_notice_days??30))>=m.contract_adjustment_date).sort((a,b)=>a.contract_adjustment_date.localeCompare(b.contract_adjustment_date));}
function changes(entry){if(entry.action==='INSERT')return Object.keys(entry.new_data||{}).map(key=>({key,before:undefined,after:entry.new_data[key]}));if(entry.action==='DELETE')return Object.keys(entry.old_data||{}).map(key=>({key,before:entry.old_data[key],after:undefined}));return (entry.changed_fields||[]).map(key=>({key,before:entry.old_data?.[key],after:entry.new_data?.[key]}));}
function documentParts(objects,limit=64*1024*1024){const parts=[];let part=[],size=0;for(const o of objects){if(!o.path||o.path.split('/').some(s=>s==='..'||s==='.')||o.path.startsWith('/')||o.path.includes('\\'))throw Error('Caminho de documento inválido.');const bytes=Number(o.size_bytes);if(!Number.isSafeInteger(bytes)||bytes<=0)throw Error('Tamanho de documento desconhecido. Confira o inventário antes de exportar.');if(part.length&&size+bytes>limit){parts.push(part);part=[];size=0;}part.push(o);size+=bytes;}if(part.length)parts.push(part);return parts;}
root.HSN_PLANNING={cents,amount,shiftMonth,meanHistory,projections,forecast,weeks,difference,adjustments,changes,documentParts};
})(typeof window!=='undefined'?window:globalThis);
