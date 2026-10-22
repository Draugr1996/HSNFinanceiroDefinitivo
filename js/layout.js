/* Somente navegação e apresentação. Não acessa dados, Auth ou permissões. */
(() => {
 'use strict';
 const sidebar=document.querySelector('.sidebar');
 const toggle=document.getElementById('navigation-toggle');
 const nav=document.getElementById('topic-navigation');
 if(!sidebar||!toggle||!nav)return;
 const groups=[...nav.querySelectorAll('.nav-topic')];
 const mobile=()=>window.matchMedia('(max-width: 850px)').matches;
 function closeMenu(){sidebar.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');}
 toggle.addEventListener('click',()=>{const open=sidebar.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(open));});
 groups.forEach(group=>group.querySelector('summary').addEventListener('click',()=>{
  if(!group.open)groups.forEach(other=>{if(other!==group)other.open=false;});
 }));
 let lastActive=null;
 function sync(){
  const active=nav.querySelector('[data-view].active');
  nav.querySelectorAll('[data-view]').forEach(b=>{if(b===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  groups.forEach(g=>{const selected=!!active&&g.contains(active);if(g.classList.contains('has-current')!==selected)g.classList.toggle('has-current',selected);});
  if(active&&active!==lastActive){const group=active.closest('.nav-topic');groups.forEach(other=>{other.open=other===group;});lastActive=active;}
  const title=document.getElementById('view-title')?.textContent;
  if(title)document.getElementById('navigation-current').textContent=title;
 }
 nav.addEventListener('click',event=>{if(event.target.closest('[data-view]')&&mobile()){closeMenu();document.getElementById('view-title')?.scrollIntoView?.({block:'start',behavior:'auto'});}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sidebar.classList.contains('menu-open')){closeMenu();toggle.focus();}});
 const observer=new MutationObserver(sync);
 observer.observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});
 const title=document.getElementById('view-title');
 if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
 // Evita ciclos de observação ao aplicar os mesmos atributos/classes.
 sync();
})();
