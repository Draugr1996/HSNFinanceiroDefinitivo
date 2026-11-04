/* Financeiro HSN 9.4 — Sugestões dentro do campo, agenda compartilhada, sem disparo de e-mails. */
window.HSN_EMAIL_ASSIST=(()=>{'use strict';
const valid=s=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s);
const split=s=>String(s||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let cache={id:null,items:[],time:0,pending:null};
const span=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
async function load(client,id,{force=false}={}){
 if(!client||!id)return [];
 if(!force&&cache.id===id&&Date.now()-cache.time<60000)return cache.items;
 if(!force&&cache.id===id&&cache.pending)return cache.pending;
 cache.id=id;
 const task=(async()=>{
  const book=new Map();
  function append(raw,company,source){for(const email of split(raw)){
   if(!valid(email))continue;const key=email.toLowerCase();let x=book.get(key);
   if(!x){x={email,companies:new Set(),sources:new Set()};book.set(key,x);}
   if(company&&!/^EMAIL:\s*/i.test(company))x.companies.add(String(company).trim());x.sources.add(source);
  }}
  let success=0,failures=[];
  for(const [table,fields,datefield,source] of [
   ['hsn_billing_recipients','to_emails,cc_emails,company','updated_at','Faturamento / Zoho'],
   ['sicoob_contacts','email,company','company','Sicoob']]){
   try{
    for(let start=0;start<5000;start+=500){
     const {data,error}=await client.from(table).select(fields).eq('owner_id',id).order(datefield,{ascending:table==='sicoob_contacts'}).range(start,start+499);
     if(error)throw error;
     for(const r of data||[]){append(r.email||r.to_emails,r.company,source);if(r.cc_emails)append(r.cc_emails,r.company,source);}
     if((data||[]).length<500)break;
    }success++;
   }catch(e){failures.push(table+': '+(e?.message||String(e)));}
  }
  if(!success)throw Error('Não foi possível carregar a agenda compartilhada. '+failures.join('; '));
  cache.items=[...book.values()].map(x=>({email:x.email,companies:[...x.companies],sources:[...x.sources]}));cache.time=Date.now();return cache.items;
 })();
 cache.pending=task;
 try{return await task;}finally{if(cache.pending===task)cache.pending=null;}
}
function invalidate(){cache.time=0;}
function bind(input,{client,userId,company='',single=false,onSelect,limit=7}={}){
 if(!input||input.dataset.hsn94Assist==='true')return null;
 input.dataset.hsn94Assist='true';input.autocomplete='off';input.spellcheck=false;
 const host=span('div','hsn94-email-host');input.parentNode.insertBefore(host,input);host.append(input);
 const dropdown=span('div','hsn94-email-dropdown');dropdown.hidden=true;dropdown.setAttribute('role','listbox');
 const chips=span('div','hsn94-email-chips');host.append(dropdown,chips);
 let book=[],chosen=-1,current=[],disposed=false;
 const companyName=()=>typeof company==='function'?company():company;
 const field=()=>{
  const t=input.value||'';
  if(single)return {prefix:'',q:t.trim()};
  const cut=Math.max(t.lastIndexOf(';'),t.lastIndexOf(','),t.lastIndexOf('\n'));
  return {prefix:cut<0?'':t.slice(0,cut+1),q:t.slice(cut+1).trim()};
 };
 const picked=()=>new Set(split(input.value).map(e=>e.toLowerCase()));
 const emit=()=>{input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 function refreshChips(){chips.replaceChildren();const seen=new Set();for(const address of split(input.value)){
  const key=address.toLowerCase();if(!valid(address)||seen.has(key))continue;seen.add(key);
  const tag=span('span','hsn94-email-chip');tag.append(span('span','',address));
  const rm=span('button','hsn94-email-chip-remove','×');rm.type='button';rm.setAttribute('aria-label','Remover '+address);
  rm.addEventListener('click',()=>{input.value=split(input.value).filter(e=>e.toLowerCase()!==key).join('; ');emit();refreshChips();draw();});
  tag.append(rm);chips.append(tag);
 }}
 function close(){dropdown.hidden=true;dropdown.replaceChildren();current=[];chosen=-1;input.setAttribute('aria-expanded','false');}
 function choose(entry){if(!entry)return;const {prefix}=field();
  if(single)input.value=entry.email;
  else{const previous=split(prefix),next=[...previous,entry.email];input.value=[...new Map(next.map(e=>[e.toLowerCase(),e])).values()].join('; ')+'; ';}
  emit();close();refreshChips();input.focus();onSelect?.(entry);
 }
 function draw(){if(disposed||document.activeElement!==input){close();return;}const {q}=field();const selected=picked();const comp=norm(companyName());
  current=book.filter(x=>(!q||norm(x.email+' '+x.companies.join(' ')).includes(norm(q)))&&!selected.has(x.email.toLowerCase()))
   .sort((a,b)=>{const weight=x=>x.companies.some(c=>norm(c)===comp)?2:x.companies.some(c=>comp&&(norm(c).includes(comp)||comp.includes(norm(c))))?1:0;return weight(b)-weight(a)||a.email.localeCompare(b.email,'pt-BR');}).slice(0,limit);
  dropdown.replaceChildren();chosen=-1;
  if(!current.length){close();return;}
  dropdown.append(span('div','hsn94-email-caption','Sugestões da agenda · selecione para preencher'));
  current.forEach((entry,i)=>{const option=span('button','hsn94-email-option');option.type='button';option.setAttribute('role','option');option.dataset.index=i;
   option.append(span('strong','',entry.email),span('small','',entry.companies.slice(0,2).join(' · ')||entry.sources.join(' / ')));
   option.addEventListener('mousedown',e=>e.preventDefault());option.addEventListener('click',()=>choose(entry));dropdown.append(option);
  });dropdown.hidden=false;input.setAttribute('aria-expanded','true');
 }
 function step(direction){if(dropdown.hidden||!current.length)return;chosen=(chosen+direction+current.length)%current.length;dropdown.querySelectorAll('.hsn94-email-option').forEach((el,i)=>{el.classList.toggle('is-active',i===chosen);el.setAttribute('aria-selected',String(i===chosen));});}
 input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
 input.addEventListener('input',()=>{refreshChips();draw();});
 input.addEventListener('focus',draw);
 input.addEventListener('keydown',e=>{
  if(dropdown.hidden)return;
  if(e.key==='ArrowDown'){e.preventDefault();step(1);}else if(e.key==='ArrowUp'){e.preventDefault();step(-1);}
  else if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Enter'&&chosen>=0){e.preventDefault();choose(current[chosen]);}
 });
 input.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==input)close();},120));
 async function update(force=false){try{book=await load(client,userId,{force});if(document.activeElement===input)draw();}
  catch(e){book=[];host.title='Agenda indisponível: '+(e?.message||e);}}
 update();refreshChips();
 return {refresh:()=>{refreshChips();draw();},reload:()=>update(true),destroy:()=>{disposed=true;close();}};
}
return {load,bind,invalidate};})();
