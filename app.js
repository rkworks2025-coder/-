// ===== 巡回リストアプリ（同期修正版・完全版） =====
const GAS_URL = "https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec";
const MASTER_KEY = "jun_list_v2";      // { yamato, ebina, chofu, updatedAt }
const STATE_KEY  = (city)=>"state_"+city; // 各エリアの {"checked","flags","dates"}

// ---- Utilities ----
const cityIdFrom = (s)=>{
  if(!s) return null; const t=String(s);
  if(t.includes("大和")) return "yamato";
  if(t.includes("海老名")) return "ebina";
  if(t.includes("調布")) return "chofu";
  return null;
};

const toBadgeTime = (iso)=>{ // "MM/DD\nHH:MM" JST
  try{ const d = iso ? new Date(iso) : new Date();
    const z = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(d);
    const g=(k)=>z.find(x=>x.type===k)?.value||"";
    return `${g('month')}/${g('day')}\n${g('hour')}:${g('minute')}`;
  }catch(_ ){ return ""; }
};

// ---- Storage ----
const getMaster = ()=>{ try{ return JSON.parse(localStorage.getItem(MASTER_KEY)||"{}"); }catch(_ ){ return {}; } };
const setMaster = (obj)=> localStorage.setItem(MASTER_KEY, JSON.stringify(obj||{}));

const getState = (city)=>{ let st;
  try{ st = JSON.parse(localStorage.getItem(STATE_KEY(city))||"{}"); }catch(_ ){ st={}; }
  const m=getMaster(); const items=m[city]||[]; const n=items.length;
  st.checked = Array.isArray(st.checked)? st.checked.slice(0,n) : [];
  st.flags   = Array.isArray(st.flags)?   st.flags.slice(0,n)   : [];
  st.dates   = Array.isArray(st.dates)?   st.dates.slice(0,n)   : [];
  while(st.checked.length<n) st.checked.push(false);
  while(st.flags.length<n)   st.flags.push("");
  while(st.dates.length<n)   st.dates.push(null);
  localStorage.setItem(STATE_KEY(city), JSON.stringify(st));
  return st;
};
const setState = (city, st)=> localStorage.setItem(STATE_KEY(city), JSON.stringify(st));

// ---- Overlay (indeterminate) ----
const ensureOverlay=()=>{let ov=document.getElementById("syncOverlay"); if(!ov){ov=document.createElement("div"); ov.id="syncOverlay"; ov.innerHTML=`<div id="syncBox"><div id="syncText"></div><div id="syncBarWrap"><div id="syncBar"></div></div></div>`; document.body.appendChild(ov);} return ov;};
const showOverlay=(msg)=>{ensureOverlay().style.display="flex"; const t=document.getElementById("syncText"); if(t)t.textContent=msg||"同期中…";};
const hideOverlay=()=>{const ov=document.getElementById("syncOverlay"); if(ov) ov.style.display="none";};

// ---- Index counters ----
const countersFor=(city)=>{const m=getMaster(); const items=m[city]||[]; const st=getState(city); let d=0,stp=0,sk=0; for(let i=0;i<items.length;i++){ if(st.checked[i])d++; if(st.flags[i]==="stopped")stp++; if(st.flags[i]==="skip")sk++; } return{done:d,stopped:stp,skip:sk,total:items.length};};
const badgeHTML=(k)=>`<span class="badge done">済 ${k.done}</span><span class="badge stop">停 ${k.stopped}</span><span class="badge skip">不 ${k.skip}</span><span class="badge total">総 ${k.total}</span>`;
const updateIndexCounts=()=>{let ad=0,as=0,ak=0,at=0;["yamato","ebina","chofu"].forEach(c=>{const k=countersFor(c);ad+=k.done;as+=k.stopped;ak+=k.skip;at+=k.total;const el=document.getElementById(c+"_count"); if(el) el.innerHTML=badgeHTML(k);}); const all=document.getElementById("all_count"); if(all) all.innerHTML=badgeHTML({done:ad,stopped:as,skip:ak,total:at}); const ph=document.getElementById("placeholder"); if(ph) ph.style.display = getMaster().updatedAt? "none":"block"; };

// ---- Sync ----
const strictValidate=(obj)=>{ if(!obj||obj.ok!==true) return "ok!=true"; if(!('data' in obj)) return "data欠落"; const d=obj.data; if(Array.isArray(d)) return null; if(!Array.isArray(d.yamato)||!Array.isArray(d.ebina)||!Array.isArray(d.chofu)) return "配列不正"; return null; };

const syncAll=async()=>{const btn=document.getElementById("btnSync"); if(btn) btn.disabled=true; showOverlay("同期中…"); try{ const res=await fetch(GAS_URL+(GAS_URL.includes("?")?"&":"?")+"action=pull",{cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status+" "+res.statusText); let obj; const ct=res.headers.get("content-type")||""; if(ct.includes("application/json")) obj=await res.json(); else{ const tx=await res.text(); obj=JSON.parse(tx); } const err=strictValidate(obj); if(err) throw new Error(err); const d=obj.data; let yam=[], ebn=[], chf=[]; if(Array.isArray(d)){ d.forEach(r=>{ const id=cityIdFrom(r.city||r.City||r.area); const rec={ station:r.station||r.Station||"", model:r.model||r.carType||"", plate_full:r.plate_full||r.carNumber||"", note:r.note||r.備考||"", status:r.status||"" }; if(id==="yamato") yam.push(rec); else if(id==="ebina") ebn.push(rec); else if(id==="chofu") chf.push(rec); }); } else { yam=d.yamato||[]; ebn=d.ebina||[]; chf=d.chofu||[]; } setMaster({ yamato:yam, ebina:ebn, chofu:chf, updatedAt: obj.updatedAt || new Date().toISOString() }); ["yamato","ebina","chofu"].forEach(getState); updateIndexCounts(); hideOverlay(); alert(`同期完了！\n取り込み：大和 ${yam.length} / 海老名 ${ebn.length} / 調布 ${chf.length}`); }catch(e){ hideOverlay(); alert("同期失敗："+(e?.message||String(e))); } finally { if(btn) btn.disabled=false; } };

// ---- Init (index) ----
const initIndex=()=>{const s=document.getElementById("btnSync"); if(s) s.addEventListener("click", syncAll); const r=document.getElementById("btnRecalc"); if(r) r.addEventListener("click", updateIndexCounts); updateIndexCounts();};

// ---- Render area (sort on reload; checked -> bottom) ----
const renderArea=(city)=>{ const m=getMaster(); const items=(m[city]||[]).map((it,i)=>({...it,__i:i})); const st=getState(city); items.sort((a,b)=> ( (st.checked[a.__i]===st.checked[b.__i]) ? a.__i-b.__i : (st.checked[a.__i]?1:-1) )); const list=document.getElementById("list"); if(!list) return; list.innerHTML=""; items.forEach(it=>{ const i=it.__i; const row=document.createElement("div"); row.className="row"; if(st.flags[i]==="stopped") row.classList.add("stopped"); else if(st.flags[i]==="skip") row.classList.add("skip"); else if(st.checked[i]) row.classList.add("checked"); else if(st.dates[i] && (Date.now()-new Date(st.dates[i]).getTime()<7*24*60*60*1000)) row.classList.add("seven"); const idx=document.createElement("div"); idx.className="idx"; idx.textContent=(i+1); const chkCol=document.createElement("div"); const btn=document.createElement("button"); btn.className="chkbtn"; btn.textContent=st.checked[i]?"✔":"□"; btn.onclick=()=>{ if(!confirm("よろしいですか？")) return; st.checked[i]=!st.checked[i]; if(st.checked[i] && !st.dates[i]) st.dates[i]=new Date().toISOString(); setState(city,st); renderArea(city); }; chkCol.appendChild(btn); const wrap=document.createElement("div"); const t=document.createElement("div"); t.className="title"; t.textContent=it.station||""; const s=document.createElement("div"); s.className="sub"; s.textContent=(it.model||"")+"　"+(it.plate_full||""); wrap.appendChild(t); wrap.appendChild(s); const menu=document.createElement("div"); menu.className="menu"; const mb=document.createElement("button"); mb.className="menubtn"; mb.textContent="…"; mb.onclick=()=>{ const sel=prompt("メニュー:\n1=前回点検（日時を今に）\n2=稼働停止\n3=巡回不要\n0=通常に戻す","1"); if(sel===null) return; if(sel==='1') st.dates[i]=new Date().toISOString(); else if(sel==='2') st.flags[i]="stopped"; else if(sel==='3') st.flags[i]="skip"; else st.flags[i]=""; setState(city,st); renderArea(city); }; menu.appendChild(mb); const date=document.createElement("div"); date.className="date"; date.textContent=st.dates[i]? toBadgeTime(st.dates[i]) : ""; row.appendChild(idx); row.appendChild(chkCol); row.appendChild(wrap); row.appendChild(menu); row.appendChild(date); list.appendChild(row); }); const k={done:0,stopped:0,skip:0,total:items.length}; for(let i=0;i<items.length;i++){ if(st.checked[items[i].__i])k.done++; if(st.flags[items[i].__i]==="stopped")k.stopped++; if(st.flags[items[i].__i]==="skip")k.skip++; } const c=document.getElementById("count"); if(c) c.textContent=`済${k.done}/停止${k.stopped}/不要${k.skip}/総${k.total}`; };

// Expose
window.App = { initIndex, renderArea, updateIndexCounts, syncAll };
