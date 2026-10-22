/* Regras puras, testáveis. Alertas de contas e comissões nunca se somam. */
(function(root){'use strict';
const payableDefaults={lead_days:[7,3,1,0],variation_percent:30,daily_summary:true,missing_documents:true,missing_bill:true,waiting_approval:true,variation_alert:true};
const commissionDefaults={lead_days:[7,3,1,0],daily_summary:true,monthly_reminder:true,review_day:5,checklist_template:['Conferir reservas e competências','Conferir percentuais e bases de cálculo','Conferir cancelamentos e no-shows','Conferir divergências com a agência','Registrar conclusão da conferência']};
const delta=(from,to)=>Math.round((HSN_DATES.parse(to)-HSN_DATES.parse(from))/86400000);
function history(accounts,p){if(!p.model_id)return [];return accounts.filter(r=>r.id!==p.id&&r.model_id===p.model_id&&r.payment_status==='paid'&&!r.archived&&r.competence<p.competence&&r.actual_amount!==null).sort((a,b)=>b.competence.localeCompare(a.competence)).slice(0,3);}
function variation(accounts,p,percent=30){if(p.actual_amount===null||p.actual_amount===undefined)return null;const h=history(accounts,p);if(!h.length)return null;const mean=h.reduce((n,r)=>n+Number(r.actual_amount),0)/h.length;const current=Number(p.actual_amount),increase=mean===0?(current>0?Infinity:0):(current-mean)/mean*100;if(!(current>mean*(1+Number(percent)/100)+0.000001))return null;return {history:h,mean,current,increase,threshold:Number(percent)};}
function payables(accounts,documents,config={},today=HSN_DATES.today()){
 const s={...payableDefaults,...config},out=[];
 const push=(p,category,detail,severity='info')=>out.push({id:p.id+':'+category,module:'payables',record_id:p.id,title:p.title,date:p.due_date,category,detail,severity});
 for(const p of accounts){if(p.archived)continue;const unpaid=p.payment_status!=='paid',diff=delta(today,p.due_date),files=documents.filter(d=>d.payable_id===p.id),month=p.competence.slice(0,7);
 if(unpaid){if(diff<0)push(p,'overdue',Math.abs(diff)+' dia(s) de atraso','danger');else if(diff===0)push(p,'today','Vence hoje','warning');else if(s.lead_days.includes(diff))push(p,'upcoming','Vence em '+diff+' dia(s)','info');
 if(s.missing_bill&&p.arrival_day){const arrival=HSN_DATES.monthDay(month,p.arrival_day);if(today>arrival&&!files.some(d=>d.document_type==='boleto'))push(p,'missing_bill','Boleto esperado desde '+HSN_DATES.br(arrival),'warning');}
 if(s.waiting_approval&&p.approval_status==='waiting')push(p,'approval','Aguardando aprovação externa','warning');}
 if(s.missing_documents){const missing=(p.required_documents||[]).filter(k=>!files.some(d=>d.document_type===k));if(missing.length)push(p,'documents','Faltam: '+missing.map(k=>({boleto:'boleto',nota_fiscal:'nota fiscal',comprovante:'comprovante',outros:'outros'}[k]||k)).join(', '),'warning');}
 if(s.variation_alert){const v=variation(accounts,p,s.variation_percent);if(v){const change=Number.isFinite(v.increase)?v.increase.toFixed(1).replace('.',',')+'%':'média anterior zero';push(p,'variation','Valor acima da média: '+change+' (limite '+s.variation_percent+'%)','warning');out[out.length-1].variation=v;}}
 }
 const weight={danger:0,warning:1,info:2};return out.sort((a,b)=>weight[a.severity]-weight[b.severity]||a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
function commissions(records,reviews,config={},today=HSN_DATES.today()){
 const s={...commissionDefaults,...config},out=[];
 for(const c of records){if(c.archived||c.review_status==='confirmed')continue;const diff=delta(today,c.due_date);let category='',detail='';if(diff<0){category='overdue';detail='Conferência atrasada há '+Math.abs(diff)+' dia(s)';}else if(diff===0){category='today';detail='Conferir hoje';}else if(s.lead_days.includes(diff)){category='upcoming';detail='Conferir em '+diff+' dia(s)';}if(category)out.push({id:c.id+':'+category,module:'commissions',record_id:c.id,title:c.title,date:c.due_date,category,detail,severity:category==='overdue'?'danger':category==='today'?'warning':'info'});}
 const month=today.slice(0,7),date=HSN_DATES.monthDay(month,s.review_day),review=reviews.find(r=>r.competence===month+'-01');
 if(s.monthly_reminder&&review?.review_status!=='completed'){const diff=delta(today,date);if(diff<=0||s.lead_days.includes(diff))out.unshift({id:'monthly:'+month,module:'commissions',record_id:review?.id||null,title:'Conferência mensal de comissões',date,category:'monthly',detail:diff<0?'Checklist mensal ainda não concluído':diff===0?'Dia da conferência mensal':'Checklist mensal em '+diff+' dia(s)',severity:diff<0?'danger':'warning',month});}
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
function summary(records,module,today=HSN_DATES.today()){const active=records.filter(r=>!r.archived&&(module==='payables'?r.payment_status!=='paid':r.review_status!=='confirmed'));const weekEnd=HSN_DATES.add(today,7);const dueToday=active.filter(r=>r.due_date===today),week=active.filter(r=>r.due_date>today&&r.due_date<=weekEnd),late=active.filter(r=>r.due_date<today);return {module,today:dueToday,week,late};}
root.HSN_ALERT_ENGINE={payableDefaults,commissionDefaults,delta,history,variation,payables,commissions,summary};
})(typeof window!=='undefined'?window:globalThis);
