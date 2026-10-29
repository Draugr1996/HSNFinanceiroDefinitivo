// HSN 8.9 — cache de arquivos estáticos. Nunca cacheia Supabase, Auth, CDN ou anexos.
const CACHE="hsn-v9-3-0-comunicacao-20261029";
const STATIC=["./","./index.html","manifest.json","icons/icon-192.png","css/hsn89-optimized.css?v=8-9-2-20261022","css/hsn90-modules.css?v=9-0-20261023","css/hsn91-duplicates.css?v=9-1-20261026","css/hsn92-faturamento.css?v=9-2-6-20261028","js/theme.js","js/config.js","js/utils.js","js/dates.js","js/boletos.js","js/alerts-engine.js","js/phase3.js?v=8-8-20261022","js/attachments.js","js/document-parser.js","js/ocr-reader.js","js/document-reading.js","js/import-rules.js?v=9-1-20261026","js/phase4.js?v=9-1-20261026","js/planning-engine.js","js/phase5.js","js/push-engine.js","js/push.js","js/finance.js?v=9-1-20261026","js/zoho-connect.js?v=zoho-test-1","js/app.js?v=9-0-20261023","js/layout.js","js/sicoob-collections.js?v=9-3-0-20261029","js/premium-ui.js?v=premium-1","js/hsn8-shell.js?v=9-3-0-20261029","js/hsn90-modules.js?v=9-0-20261023","js/hsn92-faturamento.js?v=9-2-8-20261028","js/hsn93-communications.js?v=9-3-0-20261029","css/hsn93-communications.css?v=9-3-0-20261029","./icons/icon-192.png","./icons/icon-512.png","./icons/badge-96.png","./manifest.json"];
const PRELOAD=["./","./index.html","./css/hsn89-optimized.css?v=8-9-2-20261022","./js/theme.js","./icons/icon-192.png"];
const STATIC_URLS=new Set(STATIC.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRELOAD))));
self.addEventListener('activate',event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('hsn-shell-')||key.startsWith('hsn-v'))&&key!==CACHE).map(key=>caches.delete(key))))
 .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(!STATIC_URLS.has(url.href)&&request.mode!=='navigate')return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(request);
   if(response.ok&&STATIC_URLS.has(url.href)){
    const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
   }
   return response;
  }catch{
   const saved=await caches.match(request);
   if(saved)return saved;
   if(request.mode==='navigate')return(await caches.match('./index.html'))||Response.error();
   return Response.error();
  }
 })());
});

// Push contém apenas resumos; nenhum token de acesso, chave privada ou documento.
self.addEventListener('message',event=>{
 if(event.data?.type==='HSN_PUSH_VERSION')event.ports?.[0]?.postMessage({pushVersion:6});
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const views=['alerts','commission_alerts','dda'],view=views.includes(data.view)?data.view:'alerts';
 const title=typeof data.title==='string'?data.title.slice(0,100):'Financeiro HSN';
 const body=typeof data.body==='string'?data.body.slice(0,700):'Abra o app para conferir seus avisos.';
 event.waitUntil(self.registration.showNotification(title,{body,icon:new URL('./icons/icon-192.png',self.registration.scope).href,
 badge:new URL('./icons/badge-96.png',self.registration.scope).href,
 tag:typeof data.tag==='string'?data.tag.slice(0,150):'hsn-aviso',renotify:false,data:{view}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const view=['alerts','commission_alerts','dda'].includes(event.notification.data?.view)?event.notification.data.view:'alerts';
 event.waitUntil((async()=>{const scope=new URL(self.registration.scope),url=new URL('./',scope);url.hash=view;
 const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of list){const current=new URL(client.url);if(current.origin===scope.origin&&current.pathname.startsWith(scope.pathname)){
 await client.focus();client.postMessage({type:'HSN_PUSH_OPEN',view});return;}}
 await self.clients.openWindow(url.href);
 })());
});
