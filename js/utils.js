(function(root){
'use strict';
function whatsappNumber(raw){
 let n=String(raw||'').replace(/\D/g,'');
 if(n.startsWith('00')) n=n.slice(2);
 if((n.length===12||n.length===13)&&n.startsWith('55')) n=n.slice(2);
 const ddds=new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
 if(!ddds.has(n.slice(0,2))) return {valid:false,warning:'Informe um DDD brasileiro válido.'};
 const mobile=n.length===11&&n[2]==='9';
 const fixed=n.length===10&&/^[2-5]/.test(n.slice(2));
 if(!mobile&&!fixed) return {valid:false,warning:'Use 10 dígitos para fixo ou 11 para celular, incluindo DDD.'};
 return {valid:true,number:'55'+n,warning:fixed?'Este número parece telefone fixo. Confirme se possui WhatsApp.':''};
}
function fillTemplate(body,{supplier,month,value}){
 const valid=/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'');
 const competence=valid?month.slice(5)+'/'+month.slice(0,4):'[informar competência]';
 const amount=value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)):'[informar valor]';
 return body.replace(/\{(fornecedor|mês|mes|competência|competencia|valor)\}/g,(_,key)=>key==='fornecedor'?supplier:key==='valor'?amount:competence);
}
root.HSN_UTILS={whatsappNumber,fillTemplate};
})(typeof window!=='undefined'?window:globalThis);
