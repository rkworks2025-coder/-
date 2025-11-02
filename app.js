/* =========================================================
   v6w app.js（同期=GETのみ版） 2025-11-03
   目的：
   - GAS直叩きで返る「項目,データ,項目,データ…」配列を
     [header, row, row, ...] の行列へ正規化
   - 大和/海老名/調布へ正しく振り分け
   - 進捗バーと件数表示を更新
   - localStorageへ保存（各エリア＆共通）
   注意：
   - 初期同期ボタンは無し（v6w仕様）
   - POST/inspectionlog連携は一切入れていない（混入防止）
========================================================= */

const VERSION = 'v6w';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec';

// DOM要素ID（あなたのUIに合わせて存在していることが前提）
const EL = {
  syncBtn: '#syncBtn',
  progressBar: '#progressBar',         // 幅を%で伸ばす
  statusText: '#statusText',           // 同期中の文言
  countAll: '#count_all',
  countYamato: '#count_yamato',
  countEbina: '#count_ebina',
  countChofu: '#count_chofu',
};

// localStorageキー
const LS = {
  matrix: 'v6w_matrix',        // [header, ...rows]
  all:    'v6w_all',           // 正規化済オブジェクト配列
  yamato: 'v6w_yamato',
  ebina:  'v6w_ebina',
  chofu:  'v6w_chofu',
  ts:     'v6w_synced_at',
};

/* ---------------- 進捗UI ---------------- */
function setProgress(p, msg) {
  try {
    const bar = document.querySelector(EL.progressBar);
    if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%';
    const st = document.querySelector(EL.statusText);
    if (st && msg) st.textContent = msg;
  } catch (_) {}
}

/* ---------------- フェッチ ---------------- */
async function pullAllFromGAS() {
  setProgress(5, '取得開始…');
  const url = `${GAS_URL}?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('GAS応答エラー');
  const json = await res.json();
  setProgress(25, '整形中…');
  return json;
}

/* ------------ 正規化（交互→行列） ---------- */
/**
 * GAS直叩きの1レコード想定：
 * ["項目","値","項目","値", ...] あるいは { 項目: 値, ... } も許容
 * これをオブジェクト { 原キー: 値, ... , _canon: {plate, area, address, station} } にする
 */
function rowToObject(rec) {
  let obj = {};
  if (Array.isArray(rec)) {
    for (let i = 0; i + 1 < rec.length; i += 2) {
      const k = String(rec[i] ?? '').trim();
      const v = rec[i + 1];
      if (k) obj[k] = v;
    }
  } else if (rec && typeof rec === 'object') {
    obj = { ...rec };
  } else {
    return {};
  }
  // 正規化キー（多言語/表記ゆれ対応の最小限）
  const pick = (o, keys) => {
    for (const k of keys) {
      if (o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim();
    }
    return '';
  };
  const plate   = pick(obj, ['plate','Plate','ナンバー','車番','フルナンバー','車両番号']);
  const area    = pick(obj, ['エリア','area','Area']);
  const address = pick(obj, ['所在地','住所','市区町村','address','Address','ステーション住所']);
  const station = pick(obj, ['ステーション名','station','Station','ステーション']);
  obj._canon = { plate, area, address, station };
  return obj;
}

/**
 * オブジェクト配列 -> [header, ...rows] 行列へ
 * header の優先順を固定し、未知キーは末尾へ
 */
function objectsToMatrix(objs) {
  const pref = ['エリア','所在地','ステーション名','車種','plate','ナンバー','車番','備考'];
  const keysSet = new Set();
  // まず各行に存在するキーを収集
  for (const o of objs) {
    Object.keys(o).forEach(k => {
      if (k !== '_canon') keysSet.add(k);
    });
  }
  // ヘッダー順：既知優先→残り
  const header = [];
  for (const k of pref) if (keysSet.has(k)) header.push(k);
  for (const k of keysSet) if (!header.includes(k)) header.push(k);

  const rows = objs.map(o => header.map(k => o[k] ?? ''));
  return [header, ...rows];
}

/* ------------- エリア振り分け -------------- */
function guessArea(_canon) {
  // 1) エリア欄があればそれを優先
  if (_canon.area) {
    if (_canon.area.includes('大和')) return 'yamato';
    if (_canon.area.includes('海老名')) return 'ebina';
    if (_canon.area.includes('調布')) return 'chofu';
  }
  // 2) 住所の市名で判定
  const a = _canon.address || '';
  if (a.includes('大和市')) return 'yamato';
  if (a.includes('海老名市')) return 'ebina';
  if (a.includes('調布市')) return 'chofu';
  // 3) ステーション名にも地名が含まれる場合の保険
  const s = _canon.station || '';
  if (s.includes('大和')) return 'yamato';
  if (s.includes('海老名')) return 'ebina';
  if (s.includes('調布')) return 'chofu';
  // 不明は除外（またはallにのみ残す）
  return '';
}

function distribute(objs) {
  const yamato = [];
  const ebina  = [];
  const chofu  = [];
  for (const o of objs) {
    const a = guessArea(o._canon);
    if (a === 'yamato') yamato.push(o);
    else if (a === 'ebina') ebina.push(o);
    else if (a === 'chofu') chofu.push(o);
  }
  return { yamato, ebina, chofu };
}

/* ------------- UI反映/保存 -------------- */
function updateCounts(all, parts) {
  try {
    const q = (sel) => document.querySelector(sel);
    if (q(EL.countAll))    q(EL.countAll).textContent    = String(all.length);
    if (q(EL.countYamato)) q(EL.countYamato).textContent = String(parts.yamato.length);
    if (q(EL.countEbina))  q(EL.countEbina).textContent  = String(parts.ebina.length);
    if (q(EL.countChofu))  q(EL.countChofu).textContent  = String(parts.chofu.length);
  } catch (_) {}
}

function persist(matrix, all, parts) {
  localStorage.setItem(LS.matrix, JSON.stringify(matrix));
  localStorage.setItem(LS.all,    JSON.stringify(all));
  localStorage.setItem(LS.yamato, JSON.stringify(parts.yamato));
  localStorage.setItem(LS.ebina,  JSON.stringify(parts.ebina));
  localStorage.setItem(LS.chofu,  JSON.stringify(parts.chofu));
  localStorage.setItem(LS.ts,     String(Date.now()));
}

/* ------------- 同期（GETのみ） -------------- */
async function syncNow() {
  try {
    setProgress(1, '接続中…');
    const raw = await pullAllFromGAS();

    // レコード（配列 or オブジェクト）を統一オブジェクトへ
    const objs = (Array.isArray(raw) ? raw : []).map(rowToObject)
                    .filter(o => Object.keys(o).length > 0);

    if (objs.length === 0) {
      setProgress(100, '同期失敗：データが空でした');
      alert('同期失敗：データが空でした');
      return;
    }

    // 行列化（旧v6w下位互換：header + rows）
    const matrix = objectsToMatrix(objs);

    setProgress(60, '振り分け中…');
    const parts = distribute(objs);

    setProgress(85, '保存中…');
    persist(matrix, objs, parts);

    setProgress(100, '同期完了');
    updateCounts(objs, parts);

  } catch (err) {
    console.error(err);
    setProgress(100, '通信または解析エラー');
    alert('通信または解析エラー');
  }
}

/* ------------- 起動時 -------------- */
function bindUI() {
  const btn = document.querySelector(EL.syncBtn);
  if (btn) btn.addEventListener('click', () => {
    // 連打防止
    btn.disabled = true;
    syncNow().finally(() => { btn.disabled = false; });
  });
  // 起動時に前回値があれば件数だけ復元
  try {
    const all = JSON.parse(localStorage.getItem(LS.all) || '[]');
    const parts = {
      yamato: JSON.parse(localStorage.getItem(LS.yamato) || '[]'),
      ebina : JSON.parse(localStorage.getItem(LS.ebina)  || '[]'),
      chofu : JSON.parse(localStorage.getItem(LS.chofu)  || '[]'),
    };
    updateCounts(all, parts);
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', bindUI);
