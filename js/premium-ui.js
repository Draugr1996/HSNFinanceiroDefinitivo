/* Apenas preferência de navegação. Não lê ou grava dados financeiros. */
(()=>{'use strict';
const sidebar=document.querySelector('#app .sidebar');
if(!sidebar)return;
const button=document.createElement('button');button.type='button';button.className='hsn-collapse-btn';button.setAttribute('aria-label','Recolher ou expandir menu lateral');
button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span class="hsn-collapse-label">Recolher menu</span>';
const heading=sidebar.querySelector('.sidebar-heading');sidebar.insertBefore(button,heading||sidebar.firstChild);
const key='hsn-premium-sidebar-collapsed';
try{if(localStorage.getItem(key)==='1')document.documentElement.classList.add('hsn-sidebar-collapsed');}catch{}
function sync(){const collapsed=document.documentElement.classList.contains('hsn-sidebar-collapsed');button.setAttribute('aria-expanded',String(!collapsed));button.title=collapsed?'Expandir menu':'Recolher menu';const label=button.querySelector('.hsn-collapse-label');if(label)label.textContent=collapsed?'Expandir menu':'Recolher menu';}
button.addEventListener('click',()=>{const collapsed=document.documentElement.classList.toggle('hsn-sidebar-collapsed');try{localStorage.setItem(key,collapsed?'1':'0');}catch{}sync();});
const nav=sidebar.querySelector('#topic-navigation');if(nav){nav.querySelectorAll('.nav-topic>summary').forEach(summary=>{const group=summary.parentElement;const title=group.querySelector('.topic-copy strong')?.textContent?.trim();if(title)summary.title=title;});}
sync();
})();
