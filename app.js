
// ===== 共通ユーティリティ =====
const GAS_ENDPOINT = ""; // 必要ならWeb App URLを設定
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
  if(!ts) return false; // 初回は薄グリーンを維持
  const SEVEN = 7*24*60*60*1000;
  return (Date.now() - ts) >= SEVEN;
}
async function sendGAS(payload){
  if(!GAS_ENDPOINT) return;
  try{
    await fetch(GAS_ENDPOINT, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload), mode:"no-cors"
    });
  }catch(e){}
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
function parsePasted(text){
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const items = [];
  for(const line of lines){
    const parts = line.split(/\t|,/); // タブ or カンマ
    const [station, model, plate] = [parts[0]||"", parts[1]||"", parts[2]||""];
    if(station){
      items.push({station, model, plate});
    }
  }
  return items;
}
