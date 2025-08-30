/* 巡回アプリ front: 本番同期フル版
   - デモ処理なし
   - GAS ?action=pull の配列データを取り込み localStorage へ保存
   - 進捗オーバーレイ内蔵
   - 既存HTML互換: 'yamato' 'ebina' 'chofu' も保存
*/

const GAS_URL = 'https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec';
const CITIES = ['大和市','海老名市','調布市'];

/* ========== 進捗オーバーレイ ========== */
const Overlay = (() => {
  let root, bar, text, prog = 0, timer = null;
  function ensure() {
    if (root) return;
    root = document.createElement('div');
    Object.assign(root.style, {
      position:'fixed', inset:0, display:'none', zIndex:9999,
      alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.35)'
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      minWidth:'260px', padding:'16px 18px', borderRadius:'12px',
      background:'#111', color:'#fff', fontWeight:700, boxShadow:'0 8px 20px rgba(0,0,0,.3)'
    });
    text = document.createElement('div'); text.textContent='同期中…'; text.style.marginBottom='10px';
    const wrap = document.createElement('div');
    Object.assign(wrap.style,{height:'6px', background:'#333', borderRadius:'6px', overflow:'hidden'});
    bar = document.createElement('div');
    Object.assign(bar.style,{height:'100%', width:'0%', background:'#19a1ff', transition:'width .15s linear'});
    wrap.appendChild(bar); box.appendChild(text); box.appendChild(wrap); root.appendChild(box); document.body.appendChild(root);
  }
  function show(msg){ ensure(); text.textContent = msg||'同期中…'; root.style.display='flex';
    prog=5; bar.style.width=prog+'%';
    if (timer) clearInterval(timer);
    timer=setInterval(()=>{ prog=Math.min(90, prog+Math.random()*8); bar.style.width=prog+'%'; },180);
  }
  function to100AndHide(msg){ if(!root) return; text.textContent=msg||'同期完了'; bar.style.width='100%'; setTimeout(hide,350); }
  function hide(){ if(timer) clearInterval(timer), timer=null; if(root) root.style.display='none'; }
  return {show, to100AndHide, hide};
})();

/* ========== 同期（本番） ========== */
async function runSyncFromGAS() {
  try {
    Overlay.show('同期中…');
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 20000);
    const res = await fetch(`${GAS_URL}?action=pull`, {
      method:'GET', headers:{'Accept':'application/json'}, signal:ctrl.signal
    });
    clearTimeout(t);
    const json = await res.json();
    if (!json || json.ok !== true || !Array.isArray(json.data)) throw new Error('JSON形式不正');

    const rows = normalizeRows(json.data);
    applyPulledData(rows);
    Overlay.to100AndHide('同期完了');

    const counts = cityCounts(rows);
    alert(`同期完了：大和 ${counts['大和市']||0} / 海老名 ${counts['海老名市']||0} / 調布 ${counts['調布市']||0}`);
  } catch(e) {
    Overlay.hide();
    alert(`同期に失敗しました：${e && e.message ? e.message : e}`);
  }
}

/* ========== 整形・保存・反映 ========== */
function normalizeRows(arr){
  return arr.map(r=>({
    city: (r.city ?? '').toString().trim(),
    station: (r.station ?? '').toString().trim(),
    model: (r.model ?? '').toString().trim(),
    plate_full: (r.plate_full ?? '').toString().trim(),
    rowNumber: Number(r.rowNumber ?? 0) || 0
  })).filter(r=>r.city);
}
function cityCounts(rows){
  const m={}; for(const r of rows) m[r.city]=(m[r.city]||0)+1; return m;
}
function applyPulledData(rows){
  // 全体保存
  localStorage.setItem('jun:data:all', JSON.stringify(rows));
  localStorage.setItem('jun:data:ts', String(Date.now()));
  // 都市別
  const byCity={}; for(const c of CITIES) byCity[c]=[];
  rows.forEach(r=>{ (byCity[r.city] || (byCity[r.city]=[])).push(r); });
  localStorage.setItem('jun:data:city:大和市', JSON.stringify(byCity['大和市']||[]));
  localStorage.setItem('jun:data:city:海老名市', JSON.stringify(byCity['海老名市']||[]));
  localStorage.setItem('jun:data:city:調布市', JSON.stringify(byCity['調布市']||[]));
  // 旧キー互換
  localStorage.setItem('yamato', JSON.stringify(byCity['大和市']||[]));
  localStorage.setItem('ebina',  JSON.stringify(byCity['海老名市']||[]));
  localStorage.setItem('chofu',  JSON.stringify(byCity['調布市']||[]));
  // インデックスの分母表示を更新（存在する場合のみ）
  tryUpdateIndexCounters(byCity);
}
function tryUpdateIndexCounters(byCity){
  const set = (id,n)=>{ const el=document.getElementById(id); if(el) el.textContent=String(n); };
  set('count-yamato', (byCity['大和市']||[]).length);
  set('count-ebina',  (byCity['海老名市']||[]).length);
  set('count-chofu',  (byCity['調布市']||[]).length);
}

/* ========== 初期化 ========== */
function bindButtons(){
  const b1 = document.getElementById('btnSync');
  if (b1) b1.addEventListener('click', runSyncFromGAS);
  document.querySelectorAll('.js-sync').forEach(b=> b.addEventListener('click', runSyncFromGAS));
  const recalc = document.getElementById('btnRecalc') || document.querySelector('.js-recalc');
  if (recalc) recalc.addEventListener('click', ()=>{
    const rows = JSON.parse(localStorage.getItem('jun:data:all')||'[]');
    const bc={'大和市':[],'海老名市':[],'調布市':[]};
    rows.forEach(r=>{ (bc[r.city]||(bc[r.city]=[])).push(r); });
    tryUpdateIndexCounters(bc);
    alert('再計算しました');
  });
}
document.addEventListener('DOMContentLoaded', bindButtons);
window.runSyncFromGAS = runSyncFromGAS;  // 直接呼び出し用
