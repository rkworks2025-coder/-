
// ===== 設定 =====
const GAS_URL = "https://script.google.com/macros/s/AKfycbyLPjIJOmYeC7kyZikkWcY-CmWlHYwL2NJDD0GL78x8XEN5UkBRfLY9EeCPyPZD34_aVw/exec"; // 後でApps ScriptのURLに差し替え

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
  if(!ts) return false; // 初回は薄グリーン
  const SEVEN = 7*24*60*60*1000;
  return (Date.now() - ts) >= SEVEN; // 7日以上経過で青
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

// ===== GAS 送信（ログ） =====
async function sendLog(payload){
  if(!GAS_URL) return;
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
