/* Extração por rótulos. Nunca infere competência ou pagamento. */
(function(root){'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function amount(s){let raw=String(s).replace(/[^\d.,]/g,'');if(!raw)return null;const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.');if(comma>dot)raw=raw.replace(/\./g,'').replace(',','.');else raw=raw.replace(/,/g,'');const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=999999999999.99?Math.round(n*100)/100:null;}
function civil(s){const m=String(s).match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);if(!m)return null;const d=m[3]+'-'+m[2]+'-'+m[1];try{HSN_DATES.parse(d);return d;}catch{return null;}}
function parse(text,kind='boleto'){
 const raw=String(text||'').replace(/\r/g,'').slice(0,200000),lines=raw.split('\n').map(s=>s.trim()).filter(Boolean),out={amounts:[],dueDates:[],issueDates:[],numbers:[],supplierNames:[],taxIds:[],barcodes:[],warnings:[],text:raw};
 const push=(key,value,label,evidence)=>{if(value===null||value===undefined||value==='')return;if(!out[key].some(r=>r.value===value))out[key].push({value,label,evidence:String(evidence||'').slice(0,220)});};
 const monetary=/(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2})/gi;
 lines.forEach((line,i)=>{const norm=normalize(line),near=line+' '+(lines[i+1]||'');
 const valueLabel=kind==='nota_fiscal'?/(valor\s+(?:total\s+(?:da\s+)?(?:nota|nfs|nf|servicos?)|da\s+nota|dos\s+servicos)|total\s+(?:da\s+)?nota)/:/(valor\s+(?:do\s+)?(?:documento|boleto|cobrado|a\s+pagar)|total\s+a\s+pagar)/;
 const label=norm.match(valueLabel);if(label){const after=near.slice(label.index+label[0].length);const found=after.match(monetary);if(found?.length)push('amounts',amount(found[0]),line,near);}
 if(/vencimento|venc\s*[:.]|data limite de pagamento/.test(norm)){for(const token of (line.match(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/g)||(lines[i+1]||'').match(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/g)||[]))push('dueDates',civil(token),'Vencimento impresso',near);}
 if(/data de emissao|emissao\s*[:.]|emitida em/.test(norm)){for(const token of (line.match(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/g)||(lines[i+1]||'').match(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/g)||[]))push('issueDates',civil(token),'Emissão impressa',near);}
 if(/razao social|emitente|beneficiario|prestador/.test(norm)&&!/tomador|destinatario/.test(norm)){const m=line.match(/(?:raz[aã]o social|emitente|benefici[aá]rio|prestador(?: de servi[cç]os)?)\s*[:\-]\s*(.+)/i);if(m&&!/cnpj|cpf|endereco|endere[cç]o/i.test(m[1]))push('supplierNames',m[1].trim(),'Nome rotulado',line);}
 if(/cnpj|cpf/.test(norm)){for(const m of near.matchAll(/\b(?:\d{2}\.\d{3}\.\d{3}\/[0-9A-Za-z]{4}-\d{2}|[A-Za-z0-9]{12}\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b/g))push('taxIds',m[0].replace(/[^0-9A-Z]/gi,'').toUpperCase(),'CNPJ/CPF impresso — confira emitente',near);}
 });
 // Só rótulos de documento, sem usar série, inscrição ou chave de acesso como número.
 const normalized=normalize(raw);
 const numberPatterns=kind==='nota_fiscal'?[/\bnumero\s+(?:da\s+)?(?:nota|nfs[- ]?e|nf[- ]?e)\s*[:#\-]?\s*(\d[\d.\/-]{0,20})(?!\d)/g,/\b(?:nfs[- ]?e|nf[- ]?e|nota fiscal)\s*(?:numero|n[º°o.]|n\.)\s*[:#\-]?\s*(\d[\d.\/-]{0,20})(?!\d)/g]:[/\b(?:numero\s+(?:do\s+)?documento|n[º°o.]\s*documento)\s*[:#\-]?\s*([a-z0-9][a-z0-9.\/-]{0,25})/g];
 for(const pattern of numberPatterns)for(const m of normalized.matchAll(pattern)){if(m[1].replace(/\D/g,'').length<22)push('numbers',m[1].toUpperCase(),'Número rotulado',m[0]);}
 // Busca sequências completas. Não corrige O/0, I/1 ou dígitos de forma silenciosa.
 const candidates=new Set();for(const line of lines){const stripped=line.replace(/[\s.\-]/g,'');if(/^\d{44}$|^\d{47}$|^\d{48}$/.test(stripped))candidates.add(stripped);for(const m of line.matchAll(/(?<!\d)(\d{44}|\d{47}|\d{48})(?!\d)/g))candidates.add(m[1]);}
 const bankPattern=/\b\d{5}[. ]?\d{5}\s+\d{5}[. ]?\d{6}\s+\d{5}[. ]?\d{6}\s+\d\s+\d{14}\b/g;for(const m of raw.matchAll(bankPattern))candidates.add(m[0]);
 let rejected=0;for(const candidate of candidates){try{const r=HSN_BOLETOS.read(candidate);push('barcodes',r.digits,r.bank,candidate);if(r.amount!==null)push('amounts',r.amount,'Valor validado no código',candidate);for(const date of r.dates)push('dueDates',date.date,date.label+' · conferir no boleto',candidate);}catch{rejected++;}}
 if(rejected)out.warnings.push('Foi encontrada sequência numérica que não passou na validação de boleto. Confira os dígitos; não foi corrigida automaticamente.');
 if(out.amounts.length>1)out.warnings.push('Mais de um valor foi identificado. Confira o total correto.');
 if(out.dueDates.length>1)out.warnings.push('Há mais de uma data possível. Confira vencimento e ciclo do boleto.');
 if(out.taxIds.length>1)out.warnings.push('Há vários CNPJs/CPFs. Selecione o do emitente, não o do tomador.');
 if(!out.dueDates.length)out.warnings.push('Vencimento não identificado. Não será calculado a partir da emissão.');
 if(!out.amounts.length)out.warnings.push('Valor não identificado por rótulo ou código válido. Informe após conferir.');
 return out;
}
root.HSN_DOCUMENT_PARSER={parse,amount,civil};
})(typeof window!=='undefined'?window:globalThis);
