/* 巡回アプリ front: 本番同期 2025-08-29
   - デモ同期は完全撤廃
   - GAS: action=pull を叩いて配列データを受け取り、localStorage へ保存
   - 既存HTMLに依存しない軽量な進捗表示付き
*/

// ★あなたの最新GAS WebアプリURL（本番）
const GAS_URL = 'https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec';

// 都市名（アプリで扱う3エリア）
const CITIES = ['大和市', '海老名市', '調布市'];

// ---------- 進捗オーバーレイ ----------
const Overlay = (() => {
  let el, bar, txt, prog = 0, timer = null;
  function ensure() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'syncOverlay';
    Object.assign(el.style, {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
      display: 'none', zIndex: 9999, alignItems: 'center', justifyContent: 'center'
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      minWidth: '260px', padding: '16px 18px', borderRadius: '12px',
      background: '#111', color: '#fff', fontWeight: 700, boxShadow: '0 8px 20px rgba(0,0,0,.3)'
    });
    txt = document.createElement('div');
    txt.textContent = '同期中…';
    txt.style.marginBottom = '10px';
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { height: '6px', background: '#333', borderRadius: '6px', overflow: 'hidden' });
    bar = document.createElement('div');
    Object.assign(bar.style, { height: '100%', width: '0%', background: '#19a1ff', transition: 'width .15s linear' });
    wrap.appendChild(bar);
    box.appendChild(txt);
    box.appendChild(wrap);
    el.appendChild(box);
    document.body.appendChild(el);
  }
  function show(message) {
    ensure(); txt.textContent = message || '同期中…'; el.style.display = 'flex';
    prog = 5; bar.style.width = prog + '%';
    if (timer) clearInterval(timer);
    // 擬似プログレス（最大90%まで）。応答時に100%へ。
    timer = setInterval(() => { prog = Math.min(90, prog + Math.random()*8); bar.style.width = prog + '%'; }, 180);
  }
  function hide() {
    if (!el) return;
    if (timer) clearInterval(timer), timer = null;
    el.style.display = 'none';
  }
  function to100AndHide(msg) {
    if (!el) return;
    txt.textContent = msg || '同期完了';
    bar.style.width = '100%';
    setTimeout(hide, 350);
  }
  return { show, hide, to100AndHide };
})();

// ---------- 同期（本番） ----------
async function runSyncFromGAS() {
  try {
    Overlay.show('同期中…');
    // 15秒タイムアウト
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    const res = await fetch(`${GAS_URL}?action=pull`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    });
    clearTimeout(t);

    // ネットワーク／CORSエラーは fetch で例外になる想定
    const json = await res.json();
    if (!json || json.ok !== true || !Array.isArray(json.data)) {
      throw new Error('JSON形式不正');
    }

    const rows = normalizeRows(json.data);
    applyPulledData(rows);         // localStorage へ保存＆UI反映
    Overlay.to100AndHide('同期完了');

    // 件数サマリ（都市別）
    const counts = cityCounts(rows);
    alert(`同期完了！ 取り込み件数：大和 ${counts['大和市']||0} / 海老名 ${counts['海老名市']||0} / 調布 ${counts['調布市']||0}`);
  } catch (e) {
    Overlay.hide();
    alert(`同期に失敗しました：${e && e.message ? e.message : e}`);
  }
}

// ---------- データ整形・保存 ----------
function normalizeRows(arr) {
  // 期待フィールド: city, station, model, plate_full, rowNumber
  return arr.map(r => ({
    city: (r.city ?? '').toString().trim(),
    station: (r.station ?? '').toString().trim(),
    model: (r.model ?? '').toString().trim(),
    plate_full: (r.plate_full ?? '').toString().trim(),
    rowNumber: Number(r.rowNumber ?? 0) || 0
  })).filter(r => r.city); // city必須
}

function cityCounts(rows) {
  const counts = {};
  for (const r of rows) counts[r.city] = (counts[r.city] || 0) + 1;
  return counts;
}

function applyPulledData(rows) {
  // 全体保存（互換）
  localStorage.setItem('jun:data:all', JSON.stringify(rows));
  localStorage.setItem('jun:data:ts', String(Date.now()));

  // 都市ごとにも複数キーで保存（既存実装の参照名に広く合わせる）
  const byCity = {};
  for (const name of CITIES) byCity[name] = [];
  rows.forEach(r => { (byCity[r.city] || (byCity[r.city] = [])).push(r); });

  // 代表キー
  localStorage.setItem('jun:data:city:大和市', JSON.stringify(byCity['大和市'] || []));
  localStorage.setItem('jun:data:city:海老名市', JSON.stringify(byCity['海老名市'] || []));
  localStorage.setItem('jun:data:city:調布市', JSON.stringify(byCity['調布市'] || []));

  // 旧キー互換（念のため）
  localStorage.setItem('yamato', JSON.stringify(byCity['大和市'] || []));
  localStorage.setItem('ebina', JSON.stringify(byCity['海老名市'] || []));
  localStorage.setItem('chofu', JSON.stringify(byCity['調布市'] || []));

  // インデックスのカウンタを更新（存在すれば）
  tryUpdateIndexCounters(byCity);
}

function tryUpdateIndexCounters(byCity) {
  const set = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };
  // 例: <span id="count-yamato"></span> などがあれば反映
  set('count-yamato', (byCity['大和市'] || []).length);
  set('count-ebina',  (byCity['海老名市'] || []).length);
  set('count-chofu',  (byCity['調布市'] || []).length);
}

// ---------- 初期化（ボタン紐付け） ----------
function bindButtons() {
  // 同期ボタン id=btnSync / class=.js-sync どちらでも拾う
  const btn1 = document.getElementById('btnSync');
  const btns = [...document.querySelectorAll('.js-sync')];
  if (btn1) btn1.addEventListener('click', runSyncFromGAS);
  btns.forEach(b => b.addEventListener('click', runSyncFromGAS));

  // 再計算ボタン（存在する場合のみ）: 保存済データからカウンタを再描画
  const recalc = document.getElementById('btnRecalc') || document.querySelector('.js-recalc');
  if (recalc) {
    recalc.addEventListener('click', () => {
      const rows = JSON.parse(localStorage.getItem('jun:data:all') || '[]');
      const bc = { '大和市': [], '海老名市': [], '調布市': [] };
      rows.forEach(r => { (bc[r.city] || (bc[r.city] = [])).push(r); });
      tryUpdateIndexCounters(bc);
      alert('再計算しました');
    });
  }
}

document.addEventListener('DOMContentLoaded', bindButtons);

// グローバルにも露出（既存HTMLから直接呼ぶための保険）
window.runSyncFromGAS = runSyncFromGAS;
