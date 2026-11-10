/* HSN 9.6 — classificação de DDA com procedência explícita.
 * DDA é cobrança; NÃO é comprovante de liquidação ou autorização bancária.
 * Sem criação de vínculo ou baixa por semelhança. Funções puras/testáveis.
 */
(function(root){'use strict';
 const digits=x=>String(x||'').replace(/\D/g,'');
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const cents=x=>Math.round(Number(x||0)*100);
 const amount=p=>Number(p?.actual_amount??p?.estimated_amount??0);
 function sourceStatus(raw){
  const s=norm(raw);
  if(!s)return '';
  if(/^(pago|paga|pagamento efetuado|pagamento realizado|efetivado|efetivada|quitado|quitada|liquidado|liquidada|paid)$/.test(s))return 'paid';
  if(/^(agendado|agendada|programado|programada|pagamento agendado|pagamento programado|scheduled)$/.test(s))return 'scheduled';
  if(/^(em aberto|aberto|aberta|pendente|a pagar|nao pago|nao paga|em cobranca|open)$/.test(s))return 'open';
  return '';
 }
 function sameSupplier(c,p,suppliers){
  const s=(suppliers||[]).find(x=>x.id===p.supplier_id)||{};
  const ct=digits(c.tax_id),pt=digits(s.tax_id);
  if(ct&&pt)return ct===pt;
  const n=norm(c.supplier_name);
  return !!(n&&(n===norm(s.legal_name)||n===norm(s.trade_name)));
 }
 function uniqueProposedMatch(c,snapshot,matches){
  if(c.converted_payable_id||c.linked_payable_id)return null;
  const good=(matches||[]).filter(m=>{
   const p=m.p;if(!p||p.archived||cents(c.amount)!==cents(amount(p)))return false;
   const cb=digits(c.barcode),pb=digits(p.barcode);
   const barcode=cb.length>=30&&cb===pb;
   const cd=norm(c.document_number).replace(/\s/g,''),pd=norm(p.document_number).replace(/\s/g,'');
   const doc=cd.length>=6&&cd===pd&&sameSupplier(c,p,snapshot?.suppliers);
   return barcode||doc;
  });
  return good.length===1?good[0].p:null;
 }
 function classify(c,snapshot,matches=[]){
  const linkId=c.converted_payable_id||c.linked_payable_id;
  const linked=linkId?(snapshot?.payables||[]).find(p=>p.id===linkId):null;
  const reported=sourceStatus(c.source_status);
  if(linked){
   const schedule=['scheduled','scheduled_signature'].includes(linked.workflow_status||'');
   const key=linked.payment_status==='paid'?'paid':schedule?'scheduled':'open';
   const labels={paid:'Pago registrado no HSN',scheduled:linked.workflow_status==='scheduled_signature'?'Programado · assinatura pendente':'Agendado no HSN',open:'Em aberto no HSN'};
   return {key,label:labels[key],basis:'Conta vinculada',note:key==='paid'?'Baixa registrada na conta vinculada.':key==='scheduled'?'Programação registrada no HSN; confirme assinatura e execução no banco.':'Conta ainda sem baixa confirmada.',account:linked,source:reported,
    conflict:!!reported&&((key==='paid'&&reported!=='paid')||(key==='open'&&reported==='paid'))};
  }
  if(linkId&&!linked)return {key:'review',label:'Vínculo não localizado',note:'A conta vinculada não está disponível. Atualize a lista e confira.',source:reported};
  const proposed=uniqueProposedMatch(c,snapshot,matches);
  if(proposed){
   const key=proposed.payment_status==='paid'?'paid':(['scheduled','scheduled_signature'].includes(proposed.workflow_status)?'scheduled':'open');
   return {key:'review',label:key==='paid'?'Possível pagamento':key==='scheduled'?'Possível agendamento':'Conta provável',note:'Documento/código compatível com conta não vinculada. Confirme o vínculo antes de concluir.',basis:'Correspondência sugerida',account:proposed,source:reported};
  }
  if(reported==='paid')return {key:'review',label:'Pago informado no arquivo',note:'O arquivo informa pagamento, mas não há baixa vinculada confirmada no HSN.',basis:'Somente arquivo DDA',source:reported};
  if(reported==='scheduled')return {key:'review',label:'Agendado no arquivo',note:'Agendamento indicado no arquivo; ainda não é baixa confirmada.',basis:'Somente arquivo DDA',source:reported};
  if(reported==='open')return {key:'open',label:'Em aberto',note:'Situação aberta indicada na planilha DDA; verifique o vencimento.',basis:'Arquivo DDA',source:reported};
  return {key:'open',label:'Sem baixa identificada',note:'O DDA não contém prova de pagamento ou agendamento. Cruze com a conta e o extrato.',basis:'Sem status bancário',source:''};
 }
 root.HSN_DDA96={sourceStatus,classify,uniqueProposedMatch};
})(window);
