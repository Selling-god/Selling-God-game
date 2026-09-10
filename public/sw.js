self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}catch{}
    try{await self.registration.unregister();}catch{}
    try{const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const page of pages)page.navigate(page.url);}catch{}
  })());
});
