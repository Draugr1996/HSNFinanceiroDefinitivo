/* Financeiro HSN 8.0 — acabamento visual exclusivamente no DOM.
   Não lê, modifica nem envia cobranças, dados de hóspedes ou credenciais. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const summary=$('summary');const title=$('view-title');const nav=$('topic-navigation');
const icons=[
 '<path d="M5 3h10l4 4v14H5z M15 3v5h5 M8 12h8 M8 16h6"/>',
 '<circle cx="12" cy="12" r="9"/><path d="M15.2 8.5a4 4 0 0 0-6.5 1.1c-1.1 2.1.1 4.1 2.8 4.1h1.2c2.6 0 3.8 2 2.6 4.1A4.5 4.5 0 0 1 8 18 M12 5v14"/>',
 '<rect x="3" y="8" width="7" height="13" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/><path d="M6 12h1M6 15h1M17 8h1M17 12h1M3 21h18"/>',
 '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'
];
const navIcons={sicoob_collections:'<path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h6"/>',zoho_connect:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',push:'<path d="M12 3a6 6 0 0 0-6 6v5l-2 3h16l-2-3V9a6 6 0 0 0-6-6z M10 21h4"/>',cash_forecast:'<path d="M3 18l6-6 4 3 8-9 M3 4v16h18"/>',reports:'<path d="M5 3h11l4 4v14H5z M15 3v5h5 M8 12h8 M8 16h8"/>',imports:'<path d="M4 8h16l-4-4m4 4-4 4 M20 16H4l4-4m-4 4 4 4"/>',adjustments:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',dda:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7 9h10M7 13h10"/>',audit:'<path d="M5 5h14v14H5z M8 9h8 M8 13h8"/>',backups:'<path d="M12 3v12m-5-5 5 5 5-5 M5 18h14"/>',alerts:'<path d="M12 3a6 6 0 0 0-6 6v5l-2 3h16l-2-3V9a6 6 0 0 0-6-6z M10 21h4"/>',commissions:'<path d="M12 2v20 M17 6H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H6"/>'};
function svg(paths){return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;}
function decorateStats(){if(!summary)return;[...summary.children].forEach((card,i)=>{
 if(!card.classList.contains('stat')&&!card.classList.contains('sicoob-stat'))return;
 if(card.querySelector('.hsn8-stat-icon'))return;
 const ico=document.createElement('span');ico.className='hsn8-stat-icon';ico.setAttribute('aria-hidden','true');ico.innerHTML=svg(icons[Math.min(i,3)]);card.prepend(ico);
});}
function syncView(){
 if(!title)return;
 const active=nav?.querySelector('[data-view].active');const view=active?.dataset.view||'payables';
 document.documentElement.dataset.hsnView=view;
 const crumbTitle=$('hsn8-breadcrumb-title');if(crumbTitle)crumbTitle.textContent=title.textContent||'Financeiro';
 const crumbSection=$('hsn8-breadcrumb-section');if(crumbSection)crumbSection.textContent=active?.closest('.nav-topic')?.querySelector('.topic-copy strong')?.textContent||'Financeiro';
}
if(nav){nav.querySelectorAll('[data-view]').forEach(b=>{const el=b.querySelector('.nav-icon');if(el&&!el.querySelector('svg')&&navIcons[b.dataset.view])el.innerHTML=svg(navIcons[b.dataset.view]);});
 new MutationObserver(syncView).observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});}
if(title)new MutationObserver(syncView).observe(title,{childList:true,characterData:true,subtree:true});
if(summary)new MutationObserver(decorateStats).observe(summary,{childList:true});
// Atalho e indicação da pesquisa já existente: sempre pesquisa o módulo atual.
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
  const input=$('hsn7-search');if(input&&!input.offsetParent)return;
  if(input){e.preventDefault();input.focus();input.select();}
 }
});
const connection=$('connection');const status=$('hsn8-bank-connection');
function syncConnection(){if(!status||!connection)return;status.textContent=connection.textContent.trim()||'Conexão de dados não verificada';}
if(connection)new MutationObserver(syncConnection).observe(connection,{childList:true,characterData:true,subtree:true});
syncView();decorateStats();syncConnection();
})();
