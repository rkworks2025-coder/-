/* v6w app.js（GET初期読み込み＋エリア振り分け／混入なし）
   — 修正点 —
   1) GAS_URL を最新に更新
   2) GASの出力に両対応（配列/ {data:[]}/ {headers,rows}/ キー値ペア配列）
   3) 既存のv6w想定：送信なし（GETのみ）／localStorage保存＆各エリアページで参照
*/

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec';

// ======================== 基本UI補助 ========================
function setStatus(msg, ok) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#0a0' : '#c00';
}
function setCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(n);
}

// ======================== 正規化ユーティリティ ========================
/** GAS応答を v6wが扱いやすい「配列のオブジェクト」に正規化 */
function normalizePayload(payload) {
  // 1) {data:[ {...}, {...} ]} 形式
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  // 2) 既に配列のオブジェクト
  if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === 'object' && !Array.isArray(payload[0])) {
    return payload;
  }
  // 3) {headers:[], rows:[[]]} 形式
  if (payload && Array.isArray(payload.headers) && Array.isArray(payload.rows)) {
    const heads = payload.headers;
    return payload.rows.map(row => {
      const obj = {};
      for (let i = 0; i < heads.length; i++) obj[heads[i]] = row[i];
      return obj;
    });
  }
  // 4) [ ['項目','値','項目','値',...], ... ] のキー値ペア配列
  if (Array.isArray(payload) && payload.length > 0 && Array.isArray(payload[0])) {
    // 「行」がキー値交互ならオブジェクト化する
    const looksPair = (arr) => Array.isArray(arr) && arr.length >= 4 && (typeof arr[0] === 'string');
    if (looksPair(payload[0])) {
      return payload.map(pairArr => {
        const obj = {};
        for (let i = 0; i < pairArr.length; i += 2) {
          const k = pairArr[i];
          const v = pairArr[i + 1];
          if (typeof k === 'string') obj[k] = v;
        }
        return obj;
      });
    }
  }
  // 5) 単一オブジェクト
  if (payload && typeof payload === 'object') {
    return [payload];
  }
  // 6) どれにも合致しない場合は空
  return [];
}

/** 値の取り出し（日本語/英語ヘッダ両対応） */
function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return '';
}

/** エリア判定：列が無ければステーション名から推測（簡易フォールバック） */
function detectArea(rec) {
  const area = String(pick(rec, ['エリア', '地域', '担当エリア', 'Area', 'area'])).trim();
  if (area) return area;

  const station = String(pick(rec, ['ステーション名', 'ステーション', 'station', 'Station'])).trim();
  if (!station) return '';

  if (station.includes('大和') || /Yamato/i.test(station)) return '大和';
  if (station.includes('海老名') || /Ebina/i.test(station)) return '海老名';
  if (station.includes('調布') || /Chofu/i.test(station)) return '調布';
  return '';
}

/** 車番（plate）など、よく使う主キー候補の正規化 */
function normPlate(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\s‐-‒–—―ー−\-]/g, '')
    .trim();
}

// ======================== 初期読み込み（GETのみ） ========================
async function initialLoad() {
  try {
    setStatus('読み込み中…', true);
    const res = await fetch(`${GAS_URL}?action=init`, { cache: 'no-store' });
    if (!res.ok) throw new Error('通信エラー');
    const raw = await res.json();

    const list = normalizePayload(raw);
    if (!Array.isArray(list) || list.length === 0) throw new Error('データが空でした');

    // 必要最小フィールドの整形（v6w想定）
    const normalized = list.map(rec => {
      const plate = normPlate(pick(rec, ['車番', 'ナンバー', 'plate', 'Plate']));
      const station = pick(rec, ['ステーション名', 'ステーション', 'station', 'Station']);
      const model = pick(rec, ['車種', 'モデル', 'model', 'Model']);
      const area = detectArea(rec);

      return {
        plate,
        station,
        model,
        area,
        raw: rec // 万が一のため元データも保持
      };
    });

    // ローカル保存（インデックス表示用の総件数・各エリアページ用に分割保存）
    localStorage.setItem('masterData', JSON.stringify(normalized));

    const yamato = normalized.filter(r => r.area === '大和');
    const ebina  = normalized.filter(r => r.area === '海老名');
    const chofu  = normalized.filter(r => r.area === '調布');

    localStorage.setItem('yamatoData', JSON.stringify(yamato));
    localStorage.setItem('ebinaData',  JSON.stringify(ebina));
    localStorage.setItem('chofuData',  JSON.stringify(chofu));

    // トップ（index.html）用カウント表示（要素があれば更新）
    setCount('count-total', normalized.length);
    setCount('count-yamato', yamato.length);
    setCount('count-ebina',  ebina.length);
    setCount('count-chofu',  chofu.length);

    setStatus('読み込み完了', true);
    console.log('読み込み完了:', { total: normalized.length, yamato: yamato.length, ebina: ebina.length, chofu: chofu.length });
  } catch (err) {
    console.error(err);
    setStatus('読み込み失敗：' + err.message, false);
  }
}

// ======================== 各エリアページ用の描画補助 ========================
function getCityData(cityKey) {
  try {
    const txt = localStorage.getItem(cityKey);
    if (!txt) return [];
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function renderList(listId, rows) {
  const el = document.getElementById(listId);
  if (!el) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    el.innerHTML = '<li>データなし</li>';
    return;
  }
  el.innerHTML = rows.map(r => {
    const plate = r.plate || '';
    const station = r.station || '';
    const model = r.model || '';
    return `<li><span class="plate">${plate}</span>　<span class="station">${station}</span>　<span class="model">${model}</span></li>`;
  }).join('');
}

// 例：yamato.html などで使用
function mountYamato() {
  const rows = getCityData('yamatoData');
  renderList('list', rows);
}
function mountEbina() {
  const rows = getCityData('ebinaData');
  renderList('list', rows);
}
function mountChofu() {
  const rows = getCityData('chofuData');
  renderList('list', rows);
}

// ======================== 起動フック（indexで呼ぶ） ========================
// index.html の読み込みボタン等から initialLoad() を呼ぶ想定。
// v6w系は「送信（POST）は無し」。あくまでGETで全体管理→アプリ取り込みのみ。
