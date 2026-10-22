(function(root){'use strict';
function mod10(s){let sum=0,w=2;for(let i=s.length-1;i>=0;i--){let n=Number(s[i])*w;sum+=Math.floor(n/10)+n%10;w=w===2?1:2;}return (10-sum%10)%10;}
function sum11(s){let sum=0,w=2;for(let i=s.length-1;i>=0;i--){sum+=Number(s[i])*w;w=w===9?2:w+1;}return sum%11;}
function bank11(s){const d=11-sum11(s);return [0,10,11].includes(d)?1:d;}
function collection11(s){const r=sum11(s);return r===0||r===1?0:r===10?1:11-r;}
const banks={'001':'Banco do Brasil','033':'Santander','104':'Caixa Econômica Federal','237':'Bradesco','341':'Itaú','756':'Sicoob','748':'Sicredi','077':'Inter','260':'Nubank','422':'Safra','041':'Banrisul'};
function read(raw){
 const n=String(raw||'').replace(/[\s.\-]/g,'');
 if(!/^\d+$/.test(n)||![44,47,48].includes(n.length))throw Error('Cole um código numérico de 44, 47 ou 48 dígitos.');
 let bar=n;
 if(n.length===47){
 if(n[0]==='8')throw Error('Cobrança de arrecadação deve ter 44 ou 48 dígitos.');
 for(const [start,end,dv]of [[0,9,9],[10,20,20],[21,31,31]])if(mod10(n.slice(start,end))!==Number(n[dv]))throw Error('Linha digitável inválida: dígito verificador de campo incorreto.');
 bar=n.slice(0,4)+n[32]+n.slice(33)+n.slice(4,9)+n.slice(10,20)+n.slice(21,31);
 }
 if(n.length===48){
 if(n[0]!=='8'||!['6','7','8','9'].includes(n[2]))throw Error('Arrecadação inválida.');
 const fn=['6','7'].includes(n[2])?mod10:collection11;
 bar='';for(let i=0;i<48;i+=12){const block=n.slice(i,i+11);if(fn(block)!==Number(n[i+11]))throw Error('Arrecadação inválida: dígito verificador de bloco incorreto.');bar+=block;}
 }
 if(bar[0]==='8'){
 if(!['6','7','8','9'].includes(bar[2]))throw Error('Tipo de arrecadação inválido.');
 const fn=['6','7'].includes(bar[2])?mod10:collection11;
 if(fn(bar.slice(0,3)+bar.slice(4))!==Number(bar[3]))throw Error('Código inválido: dígito geral incorreto.');
 return {digits:n,barcode:bar,amount:['6','8'].includes(bar[2])?Number(bar.slice(4,15))/100:null,bank:'Arrecadação / concessionária',dates:[],warning:'A data de vencimento não é padronizada neste código. Confira e informe a data do documento. Referência 7/9 não contém valor monetário padronizado.'};
 }
 if(n.length===48)throw Error('Linha bancária deve ter 47 dígitos.');
 if(bar[3]!=='9')throw Error('Código bancário não identificado como moeda Real.');
 if(bank11(bar.slice(0,4)+bar.slice(5))!==Number(bar[4]))throw Error('Boleto inválido: dígito verificador geral incorreto.');
 const factor=Number(bar.slice(5,9));const dates=[];
 if(factor){dates.push({label:'Ciclo antigo',date:HSN_DATES.add('1997-10-07',factor)});if(factor>=1000)dates.unshift({label:'Ciclo iniciado em 2025',date:HSN_DATES.add('2025-02-22',factor-1000)});}
 return {digits:n,barcode:bar,amount:Number(bar.slice(9,19))===0?null:Number(bar.slice(9,19))/100,bank:banks[bar.slice(0,3)]||'Banco código '+bar.slice(0,3),dates,warning:factor?'O fator de vencimento foi reiniciado em 2025. Confira o ciclo e a data no boleto antes de aplicar.':'Sem vencimento codificado. Informe a data do documento.'};
}
root.HSN_BOLETOS={read,mod10,bank11,collection11};
})(typeof window!=='undefined'?window:globalThis);
