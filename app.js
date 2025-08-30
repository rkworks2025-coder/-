/* app.js — 巡回リストアプリ 同期フル版（保持ベースに最小改修） */
(function(){
  "use strict";
  const API_URL = "https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec?action=pull";
  const CITIES = ["大和市","海老名市","調布市"];
  const LS_ALL="jun:data:all", LS_TS="jun:data:ts"; const LS_CITY=(c)=>"jun:data:city:"+c;
  const q=(sel,root=document)=> typeof sel==="string"? root.querySelector(sel): sel||null;
  const setText=(sel,val)=>{ const el=q(sel); if(el) el.textContent=String(val); };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const readAll=()=>{ try{return JSON.parse(localStorage.getItem(LS_ALL)||"[]");}catch(_){return [];} };
  const saveAll=(rows)=>{ localStorage.setItem(LS_ALL, JSON.stringify(rows||[])); localStorage.setItem(LS_TS, String(Date.now())); };
  const saveByCity=(m)=> CITIES.forEach(c=>localStorage.setItem(LS_CITY(c), JSON.stringify(m[c]||[])));
  const splitByCity=(rows)=>{ const m={"大和市":[],"海老名市":[],"調布市":[]}; (rows||[]).forEach(r=>{ if(CITIES.includes(r.city)) m[r.city].push(r); }); return m; };
  const normalizeRows=(arr)=> (Array.isArray(arr)?arr:[]).map(r=>({
      city:(r.city??"").toString().trim(),
      station:(r.station??"").toString().trim(),
      model:(r.model??"").toString().trim(),
      plate_full:(r.plate_full??"").toString().trim(),
      rowNumber:Number(r.rowNumber??0)||0
    })).filter(r=>CITIES.includes(r.city));

  function updateCounters(counters){
    const all = readAll(); const by = splitByCity(all);
    const countOf = (arr)=>({done:0, stop:0, skip:0, total:arr.length});
    const Y=countOf(by["大和市"]), E=countOf(by["海老名市"]), C=countOf(by["調布市"]);
    if(counters&&counters.yamato){ setText(counters.yamato.done,Y.done); setText(counters.yamato.stop,Y.stop); setText(counters.yamato.skip,Y.skip); setText(counters.yamato.total,Y.total); }
    if(counters&&counters.ebina ){ setText(counters.ebina.done,E.done); setText(counters.ebina.stop,E.stop); setText(counters.ebina.skip,E.skip); setText(counters.ebina.total,E.total); }
    if(counters&&counters.chofu ){ setText(counters.chofu.done,C.done); setText(counters.chofu.stop,C.stop); setText(counters.chofu.skip,C.skip); setText(counters.chofu.total,C.total); }
  }

  async function doSync(els,counters){
    const modal=q(els.progressModal), bar=q(els.progressBar), status=q(els.statusText);
    const open=(m)=>{ if(modal) modal.classList.add("show"); if(status) status.textContent=m||"同期中…"; if(bar) bar.style.width="5%"; };
    const step=(p,m)=>{ if(bar) bar.style.width=clamp(p,0,100)+"%"; if(status&&m) status.textContent=m; };
    const close=()=>{ if(modal) modal.classList.remove("show"); };
    try{
      open("同期中…");
      const res = await fetch(API_URL,{headers:{"Accept":"application/json"}, cache:"no-store"});
      step(30);
      if(!res.ok) throw new Error("HTTP "+res.status+" "+res.statusText);
      let obj; const ct=(res.headers.get("content-type")||"").toLowerCase();
      if(ct.includes("json")) obj=await res.json(); else obj=JSON.parse(await res.text());
      step(60);
      if(!obj || obj.ok!==true || !Array.isArray(obj.data)) throw new Error("JSON形式不正／dataが配列ではありません");
      const rows = normalizeRows(obj.data);
      step(85,"保存中…");
      saveAll(rows); const by=splitByCity(rows); saveByCity(by);
      step(100,"同期完了");
      updateCounters(counters);
      setTimeout(close,500);
      const cnt=(n)=>(by[n]||[]).length;
      alert(`同期完了：大和 ${cnt("大和市")} / 海老名 ${cnt("海老名市")} / 調布 ${cnt("調布市")}`);
    }catch(e){
      close(); alert("同期失敗："+(e&&e.message?e.message:String(e)));
    }
  }

  window.JunkaiApp = window.JunkaiApp || {
    mountIndex(options={}){
      const els=options.els||{}, counters=options.counters||{};
      updateCounters(counters);
      const syncBtn=q(els.syncBtn), recalc=q(els.recalcBtn);
      if(syncBtn) syncBtn.addEventListener("click", ()=>doSync(els,counters));
      if(recalc)  recalc.addEventListener("click", ()=>updateCounters(counters));
    }
  };
})();