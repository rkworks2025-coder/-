
// ===== 設定（固定URL版） =====
const GAS_URL = "https://script.google.com/macros/s/AKfycbyLPjIJOmYeC7kyZikkWcY-CmWlHYwL2NJDD0GL78x8XEN5UkBRfLY9EeCPyPZD34_aVw/exec";

// ===== 共通ユーティリティ =====
function fmtDateJST(ts){
  if(!ts) return "";
  try{
    const dt = new Date(ts);
    const fmt = new Intl.DateTimeFormat("ja-JP", {
      timeZone:"Asia/Tokyo", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", hour12:false
    }).formatToParts(dt);
    const get = t => fmt.find(x=>x.type===t)?.value || "";
    return get("month") + "/" + get("day") + "\n" + get("hour") + ":" + get("minute");
  }catch(e){ return ""; }
}
function sevenRule(ts){
  if(!ts) return false;
  const SEVEN = 7*24*60*60*1000;
  return (Date.now() - ts) >= SEVEN;
}
function computeCounters(state){
  const total = state.items.length;
  let done=0, stopped=0, skip=0;
  for(let i=0;i<total;i++){
    if(state.checked[i]) done++;
    if(state.flags[i]==="stopped") stopped++;
    if(state.flags[i]==="skip") skip++;
  }
  return {done, stopped, skip, total};
}
function getSortedIndices(state){
  const idx = [...Array(state.items.length).keys()];
  idx.sort((a,b)=> (state.checked[a]===state.checked[b]) ? 0 : (state.checked[a] ? 1 : -1));
  return idx;
}
function loadCityState(cityKey){
  try{
    return JSON.parse(localStorage.getItem("junkai_"+cityKey)) || {
      items: [], checked: [], flags: [], dates: [], meta: []
    };
  }catch(e){ return {items: [], checked: [], flags: [], dates: [], meta: []}; }
}
function saveCityState(cityKey, state){
  localStorage.setItem("junkai_"+cityKey, JSON.stringify(state));
}

// ===== GAS 送信（ログ：市ページで使用） =====
async function sendLog(payload){
  try{
    await fetch(GAS_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
  }catch(e){
    // silent
  }
}

// ====== 同期（index の「同期」ボタン用） ======
async function syncFromGAS(){
  try{
    const url = GAS_URL + (GAS_URL.includes("?") ? "&" : "?") + "action=pull";
    const res = await fetch(url, { method:"GET" });
    if(!res.ok){
      const text = await res.text().catch(()=> "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text?("- "+text):""}`.trim());
    }
    const ct = res.headers.get("content-type") || "";
    let data;
    if(ct.includes("application/json")){
      data = await res.json();
    }else{
      const txt = await res.text();
      try{ data = JSON.parse(txt); }
      catch(_e){ throw new Error("JSON 以外のレスポンスを受信しました。GAS 側で JSON を返すようにしてください。"); }
    }
    const CITY_KEYS = ["yamato","ebina","chofu"];
    const arrSafe = (v)=> Array.isArray(v) ? v : [];
    for(const key of CITY_KEYS){
      const items = arrSafe(data[key]).map(o => ({
        station: o?.station ?? "",
        model:   o?.model   ?? "",
        plate:   o?.plate   ?? "",
        address: o?.address ?? "",
        note:    o?.note    ?? ""
      }));
      const state = {
        items,
        checked: items.map(()=>false),
        flags: items.map(()=>""),
        dates: items.map(()=>null),
        meta: []
      };
      saveCityState(key, state);
    }
    alert("同期完了！");
    return true;
  }catch(err){
    alert("同期に失敗しました：\n" + (err?.message || String(err)));
    return false;
  }
}
