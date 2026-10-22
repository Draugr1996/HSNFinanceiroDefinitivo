/* Financeiro HSN · Fase 3. Contas e comissões permanecem separadas. */
'use strict';
const $=id=>document.getElementById(id);
const titles={dashboard:'Seu painel',suppliers:'Fornecedores',account_types:'Tipos de conta',message_templates:'Mensagens prontas',payables:'Contas a pagar',recurring_models:'Contas recorrentes',calendar:'Calendário',local_holidays:'Feriados locais',alerts:'Alertas de contas',commissions:'Comissões',commission_alerts:'Alertas de comissões',alert_settings:'Configurações de alertas',dda:'DDA',imports:'Importar / exportar',reports:'Relatórios',cash_forecast:'Previsão de caixa',audit:'Histórico de alterações',adjustments:'Reajustes de contrato',backups:'Backups',push:'Notificações no telefone',zoho_connect:'Conexão Zoho Mail',sicoob_collections:'Cobranças Sicoob'};

/* Sugestões opcionais; usuários escolhem quais cadastrar. Nunca renomeia tipos existentes. */
const recommendedTypes=[
 ['Energia elétrica','#f59e0b'],['Água e esgoto','#0ea5e9'],['Internet e telefonia','#6366f1'],
 ['Aluguel e condomínio','#8b5cf6'],['Manutenção','#f97316'],['Limpeza e lavanderia','#10b981'],
 ['Materiais e suprimentos','#14b8a6'],['Serviços terceirizados','#3b82f6'],
 ['Impostos e taxas','#ef4444'],['Administrativo','#64748b'],['Outros','#94a3b8']
];
async function addRecommendedTypes(){
 if(busy)return;
 await operation(async()=>{
  const existing=check(await db.from('account_types').select('*').eq('owner_id',user.id));
  const old=new Set(existing.map(t=>HSN_IMPORT_RULES.normalize(t.name)));
  const pending=recommendedTypes.filter(([name])=>!old.has(HSN_IMPORT_RULES.normalize(name)));
  if(!pending.length){notice('Todos os tipos sugeridos já estão cadastrados.');return;}
  if(!confirm('Adicionar '+pending.length+' tipos de conta sugeridos?\n\n'+pending.map(x=>'• '+x[0]).join('\n')+'\n\nNenhum cadastro atual será alterado. Depois você poderá editar ou excluir os novos tipos.'))return;
  const errors=[];let created=0;
  for(const [name,color] of pending){try{const updated=check(await db.from('account_types').select('id,name').eq('owner_id',user.id));if(updated.some(t=>HSN_IMPORT_RULES.normalize(t.name)===HSN_IMPORT_RULES.normalize(name)))continue;check(await db.from('account_types').insert({owner_id:user.id,name,color}));created++;}catch(e){errors.push(name+': '+e.message);}}
  await load();notice(created+' tipo(s) cadastrado(s). '+(errors.length?errors.length+' falha(s): '+errors.slice(0,2).join(' | '):'Você pode editar os nomes e as cores.'),errors.length>0);
 });
}
const supplierFields=[['legal_name','Razão social / nome completo',true],['trade_name','Nome fantasia'],['tax_id','CNPJ / CPF (opcional)'],['service_type','Tipo de serviço'],['postal_code','CEP'],['street','Logradouro'],['address_number','Número'],['complement','Complemento'],['neighborhood','Bairro'],['city','Cidade'],['state','UF'],['bank','Banco'],['bank_branch','Agência'],['bank_account','Conta'],['pix_key','Chave PIX'],['notes','Observações']];
const recordSearchIndex=new WeakMap();
let db=null,user=null,view=HSN_PUSH.initialView(),rows=[],templates=[],editing=null,waSupplier=null,busy=false,loadToken=0,installPrompt=null;
function notice(message='',error=false){$('notice').textContent=message;$('notice').className=error?'error':'';}
function connected(){ $('connection').textContent=navigator.onLine?'Conectado · dados no Supabase':'Sem internet · conecte-se para consultar ou salvar'; }
function failure(error){notice(error?.message||'Não foi possível concluir. Verifique a conexão.',true);}
function requireOnline(){if(!navigator.onLine) throw new Error('Sem internet. Os dados não foram salvos. Reconecte e tente novamente.');}
function check(result){if(result.error) throw result.error;return result.data;}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function button(text,action,cls='secondary'){const node=el('button',text,cls);node.type='button';node.addEventListener('click',action);return node;}
async function operation(fn){if(busy)return;busy=true;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);try{requireOnline();await fn();}catch(e){failure(e);}finally{busy=false;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}}
function resetPrivate(){
 HSN_THEME.reset();
 window.HSN_FINANCE?.reset();loadToken++;user=null;rows=[];templates=[];editing=null;waSupplier=null;$('records').replaceChildren();$('fields').replaceChildren();$('wa-text').value='';$('password').value='';$('editor').close();$('whatsapp').close();$('app').hidden=true;$('login').hidden=false;$('logout').hidden=true;}
async function acceptSession(session){
 if(!session){resetPrivate();return;}
 if(session.user.id!==HSN_CONFIG.ownerId){await db.auth.signOut();resetPrivate();throw new Error('Este usuário não é o proprietário configurado.');}
 user=session.user;await HSN_THEME.sync(db,user.id);$('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;connected();await load();
}
async function load(){
 loadToken++;
 if(view==='sicoob_collections'){if(user)HSN_SICOOB.load();return;}
 if(view==='zoho_connect'){if(user)HSN_ZOHO.show();return;}
 if(window.HSN_FINANCE?.handles(view))return HSN_FINANCE.load(view);
 if(!user)return;const token=++loadToken;const current=view;$('records').replaceChildren(el('p','Carregando…'));
 try{requireOnline();const [a,b]=await Promise.all([db.from(current).select('*').order(current==='suppliers'?'legal_name':current==='account_types'?'name':'title'),db.from('message_templates').select('*').order('title')]);const data=check(a),messages=check(b);if(token!==loadToken||!user||current!==view)return;rows=data;templates=messages;render();}
 catch(e){if(token!==loadToken)return;rows=[];$('records').replaceChildren(el('p','Não foi possível consultar. Clique em Atualizar após recuperar a conexão.'));failure(e);}
}
function render(){
 HSN_THEME.describe(view);
 $('search').closest('.search-wrap').hidden=false;
 if(view==='sicoob_collections')return HSN_SICOOB.render();
 if(view==='zoho_connect')return HSN_ZOHO.show();
 if(window.HSN_FINANCE?.handles(view))return HSN_FINANCE.render();
 $('new').hidden=false;HSN_PHASE3.clearCalendar();$('new').textContent='Novo cadastro';$('finance-controls').replaceChildren();$('summary').replaceChildren();$('calendar-board').replaceChildren();
 $('view-title').textContent=titles[view];document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const term=$('search').value.toLocaleLowerCase('pt-BR');const list=rows.filter(r=>{let text=recordSearchIndex.get(r);if(text===undefined){text=JSON.stringify(r).toLocaleLowerCase('pt-BR');recordSearchIndex.set(r,text);}return text.includes(term);});$('records').replaceChildren();
 if(view==='account_types'){const help=el('section',undefined,'card full-width hsn-type-suggestions');help.append(el('h3','Tipos de conta personalizados'),el('p','Você pode editar qualquer tipo existente, adicionar novos ou incluir uma lista inicial sugerida. Nenhuma alteração ocorre sem confirmação.'));help.append(button('Adicionar tipos sugeridos',addRecommendedTypes,'primary'));$('records').append(help);}
 if(view==='suppliers'){const help=el('section',undefined,'card full-width hsn-type-suggestions');help.append(el('h3','Fornecedores integrados ao DDA'),el('p','Beneficiários captados do DDA ficam aqui, com nome e CPF/CNPJ. Você pode corrigir os dados e reutilizar o fornecedor em novas contas a pagar.'));$('records').append(help);}
 if(!list.length){$('records').append(el('p','Nenhum cadastro encontrado.'));return;}
 list.forEach(r=>{
 const card=el('article',undefined,'record'),heading=el('h2',r.legal_name||r.name||r.title);
 if(view==='account_types'){const dot=el('span',undefined,'badge');dot.style.backgroundColor=r.color;heading.prepend(dot);}card.append(heading);
 card.append(el('p',view==='suppliers'?[r.trade_name,r.tax_id,r.service_type,r.city].filter(Boolean).join(' · '):view==='message_templates'?r.body:r.color));
 const actions=el('div',undefined,'actions');actions.append(button('Editar',()=>openEditor(r)),button('Excluir',()=>remove(r),'danger'));
 if(view==='suppliers'){
 const wa=button('WhatsApp',()=>openWhatsApp(r));wa.disabled=!(r.contacts||[]).some(c=>HSN_UTILS.whatsappNumber(c.whatsapp).valid);if(wa.disabled)card.append(el('p','Cadastre um WhatsApp válido para habilitar o atalho.'));actions.prepend(wa);
 }card.append(actions);$('records').append(card);
 });
}
function field(container,key,title,value='',type='text',required=false){
 const label=el('label',title);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.name=key;input.value=value??'';input.required=required;input.maxLength=type==='textarea'?2000:180;if(type==='textarea')input.rows=4;label.append(input);container.append(label);return input;
}
function contactRow(c={}){
 const box=el('section',undefined,'contact'),grid=el('div',undefined,'grid');box.append(grid);
 for(const [k,t,type] of [['name','Nome do contato','text'],['phone','Telefone','tel'],['whatsapp','WhatsApp com DDD','tel'],['email','E-mail','email']])field(grid,'contact_'+k,t,c[k]||'',type);
 box.append(button('Remover contato',()=>box.remove(),'danger'));$('contacts').append(box);
}
function openEditor(record=null){
 if(busy)return;
 if(window.HSN_FINANCE?.handles(view))return HSN_FINANCE.editor(record);
 editing=record;const table=view;$('edit-form').dataset.table=table;$('edit-title').textContent=(record?'Editar · ':'Novo · ')+titles[table];const container=$('fields');container.replaceChildren();const grid=el('div',undefined,'grid');container.append(grid);
 if(table==='suppliers'){
 supplierFields.forEach(([k,t,required])=>field(grid,k,t,record?.[k]||'',k==='notes'?'textarea':'text',required));
 container.append(el('h3','Contatos'));const contacts=el('div');contacts.id='contacts';container.append(contacts);(record?.contacts?.length?record.contacts:[{}]).forEach(contactRow);container.append(button('Adicionar contato',()=>contactRow()));
 container.append(el('p','CPF/CNPJ: formato de 11 ou 14 dígitos. Confira o documento; esta fase não consulta a Receita Federal.'));
 }else if(table==='account_types'){field(grid,'name','Nome',record?.name||'','text',true).maxLength=80;field(grid,'color','Cor no calendário',record?.color||'#2563eb','color',true);}
 else{field(grid,'title','Título',record?.title||'','text',true).maxLength=100;field(container,'body','Mensagem',record?.body||'','textarea',true);container.append(el('p','Variáveis disponíveis: {fornecedor}, {mês}, {competência}, {valor}. Antes de enviar você pode editar o texto.'));}
 $('editor').showModal();
}
async function save(event){event.preventDefault();await operation(async()=>{
 const form=$('edit-form'),table=form.dataset.table,f=new FormData(form),payload={};
 if(table==='suppliers'){
 supplierFields.forEach(([key])=>payload[key]=String(f.get(key)||'').trim());payload.tax_id=payload.tax_id.replace(/\D/g,'');
 if(payload.tax_id&&!/^([0-9]{11}|[0-9]{14})$/.test(payload.tax_id))throw new Error('CPF deve ter 11 dígitos; CNPJ, 14.');
 payload.state=payload.state.toUpperCase();if(payload.state&&!/^[A-Z]{2}$/.test(payload.state))throw new Error('UF deve ter duas letras.');
 payload.contacts=[...document.querySelectorAll('#contacts .contact')].map(box=>Object.fromEntries([...box.querySelectorAll('input')].map(input=>[input.name.replace('contact_',''),input.value.trim()]))).filter(c=>Object.values(c).some(Boolean));
 for(const c of payload.contacts)if(c.whatsapp&&!HSN_UTILS.whatsappNumber(c.whatsapp).valid)throw new Error('WhatsApp inválido: '+HSN_UTILS.whatsappNumber(c.whatsapp).warning);
 }else{for(const key of table==='account_types'?['name','color']:['title','body'])payload[key]=String(f.get(key)||'').trim();}
 const query=editing?db.from(table).update(payload).eq('id',editing.id).eq('updated_at',editing.updated_at):db.from(table).insert({...payload,owner_id:user.id});
 const result=check(await query.select('id'));if(result.length!==1)throw new Error('Este cadastro mudou em outro aparelho ou foi excluído. Feche, atualize a lista e confira antes de salvar.');
 $('editor').close();notice('Cadastro salvo no Supabase.');await load();
 });}
async function remove(record){if(!confirm('Excluir “'+(record.legal_name||record.name||record.title)+'”? Esta ação não pode ser desfeita.'))return;const table=view;await operation(async()=>{const result=check(await db.from(table).delete().eq('id',record.id).eq('updated_at',record.updated_at).select('id'));if(result.length!==1)throw new Error('Cadastro alterado ou removido em outro aparelho. Atualize antes de excluir.');notice('Cadastro excluído.');await load();});}
function openWhatsApp(supplier){
 waSupplier=supplier;$('wa-contact').replaceChildren();(supplier.contacts||[]).forEach((c,i)=>{const option=el('option',(c.name||'Contato')+' · '+(c.whatsapp||'sem WhatsApp'));option.value=i;option.disabled=!HSN_UTILS.whatsappNumber(c.whatsapp).valid;$('wa-contact').append(option);});
 $('wa-contact').value=String(supplier.contacts.findIndex(c=>HSN_UTILS.whatsappNumber(c.whatsapp).valid));$('wa-template').replaceChildren(new Option('Mensagem livre',''));templates.forEach(t=>$('wa-template').append(new Option(t.title,t.id)));
 $('wa-month').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());$('wa-value').value='';$('wa-text').value='';updateWhatsApp();$('whatsapp').showModal();
}
function updateWhatsApp(){const c=waSupplier?.contacts[Number($('wa-contact').value)];const info=HSN_UTILS.whatsappNumber(c?.whatsapp);$('wa-open').disabled=!info.valid;$('wa-warning').textContent=info.warning;}
$('wa-fill').onclick=()=>{const template=templates.find(t=>t.id===$('wa-template').value);if(!template){$('wa-text').value='';return;}$('wa-text').value=HSN_UTILS.fillTemplate(template.body,{supplier:waSupplier.trade_name||waSupplier.legal_name,month:$('wa-month').value,value:$('wa-value').value});};
$('wa-contact').onchange=updateWhatsApp;
$('wa-open').onclick=()=>{const c=waSupplier?.contacts[Number($('wa-contact').value)],info=HSN_UTILS.whatsappNumber(c?.whatsapp);if(!info.valid)return;const url='https://wa.me/'+info.number+'?text='+encodeURIComponent($('wa-text').value);window.open(url,'_blank','noopener,noreferrer');};
$('login-form').onsubmit=event=>{event.preventDefault();operation(async()=>{if(!db)throw new Error('Confira js/config.js e a conexão com o CDN.');const data=check(await db.auth.signInWithPassword({email:HSN_CONFIG.loginEmail,password:$('password').value}));$('password').value='';await acceptSession(data.session);notice('');});};
$('logout').onclick=()=>operation(async()=>{await HSN_PUSH.beforeLogout();check(await db.auth.signOut());resetPrivate();notice('Sessão encerrada.');});
$('refresh').onclick=load;
let searchRenderTimer=0;
$('search').oninput=()=>{
 clearTimeout(searchRenderTimer);
 const target=view,token=loadToken;
 searchRenderTimer=setTimeout(()=>{if(target===view&&token===loadToken)render();},120);
};
$('new').onclick=()=>openEditor();$('close-editor').onclick=()=>{if(!busy)$('editor').close();};$('edit-form').onsubmit=save;
$('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(busy||!user)return;view=b.dataset.view;$('search').value='';$('hsn7-search')&&($('hsn7-search').value='');window.scrollTo(0,0);load();});
window.addEventListener('online',()=>{connected();if(user)load();});window.addEventListener('offline',()=>{connected();notice('Sem internet. Não há salvamento local de cadastros.');});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};
async function init(){
 connected();
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./service-worker.js').catch(()=>notice('PWA: não foi possível registrar o service worker. Verifique HTTPS.'));
 try{
 if(!window.supabase)throw new Error('Biblioteca Supabase indisponível. Conecte à internet e recarregue.');
 const cfg=window.HSN_CONFIG;if(!cfg||cfg.supabaseUrl.includes('SEU-PROJETO')||cfg.supabaseAnonKey==='SUA_ANON_KEY'||!/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cfg.ownerId))throw new Error('Configure os quatro campos de js/config.js antes de entrar.');
 db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 window.HSN_ZOHO_CLIENT=db;
 db.auth.onAuthStateChange((event,session)=>{if(!session)resetPrivate();else if(event==='SIGNED_IN'&&user?.id!==session.user.id)setTimeout(()=>acceptSession(session).catch(failure),0);});
 const data=check(await db.auth.getSession());await acceptSession(data.session);
 }catch(e){failure(e);}
}
init();
