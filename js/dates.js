(function(root){'use strict';
const pad=n=>String(n).padStart(2,'0');
function parse(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Data inválida');const [y,m,d]=s.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d));if(format(t)!==s)throw Error('Data inválida');return t;}
function format(d){return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());}
function add(s,n){const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return format(d);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function monthDay(month,day){const [y,m]=month.split('-').map(Number);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Competência inválida');return `${month}-${pad(Math.min(Number(day),new Date(Date.UTC(y,m,0)).getUTCDate()))}`;}
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;return `${y}-${pad(mo)}-${pad(da)}`;}
function holidays(year,custom=[]){const map=new Map();for(const [s,name]of [['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['12-25','Natal']])map.set(year+'-'+s,name);if(year>=2024)map.set(year+'-11-20','Consciência Negra');const e=easter(year);for(const [offset,name]of [[-48,'Carnaval (segunda)'],[-47,'Carnaval (terça)'],[-2,'Sexta-feira Santa'],[60,'Corpus Christi']])map.set(add(e,offset),name);for(const h of custom){const date=h.annually?year+h.holiday_date.slice(4):h.holiday_date;if(Number(date.slice(0,4))===year){try{parse(date);map.set(date,(map.has(date)?map.get(date)+' · ':'')+h.name);}catch{}}}return map;}
function business(s,custom=[]){const d=parse(s);return ![0,6].includes(d.getUTCDay())&&!holidays(d.getUTCFullYear(),custom).has(s);}
function adjust(s,rule,custom=[]){if(rule==='keep')return s;if(!['before','after'].includes(rule))throw Error('Regra inválida');let result=s,count=0;while(!business(result,custom)){result=add(result,rule==='before'?-1:1);if(++count>370)throw Error('Não há dia útil disponível');}return result;}
function br(s){return s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';}
function status(p){return p.payment_status==='paid'?'paid':p.due_date<today()?'overdue':p.due_date===today()?'today':'upcoming';}
root.HSN_DATES={parse,format,add,today,monthDay,easter,holidays,business,adjust,br,status};
})(typeof window!=='undefined'?window:globalThis);
