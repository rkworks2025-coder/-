/* v10a app.js（修正版）— 必要箇所のみ変更
   変更点：
   1) InspectionLog 読み込み時の既定ステータスを 'standby' に統一
   2) 'normal' / 'nomal' は UI 内部表現として 'standby' に正規化
   3) 'Checked' は checked=true のまま、UI 表示は 'standby' として扱う
   ※他ロジック・UI・I/F は不変更
*/

// ===== Utility =====
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function on(el, ev, fn){ el.addEventListener(ev, fn, {passive:true}); }
function create(tag, cls){ const el=document.createElement(tag); if(cls) el.className=cls; return el; }

function storeGet(k, def=null){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):def; }catch(e){ return def; } }
function storeSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

function fmtDate(d){
  if(!d) return '';
  try{
    const dt = (d instanceof Date)? d : new Date(d);
    if(Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const dd= String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }catch(e){ return ''; }
}

function toISOChecked(s){
  // 既存仕様：日付文字列を YYYY-MM-DD に
  return fmtDate(s);
}

// ===== App Config =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN'; // 既存の値をそのまま使うこと（差し替え禁止）
const SHEET_MAIN = '全体管理';
const SHEET_LOG  = 'InspectionLog'; // パラメータは大小混在許容、実体は GAS 側で inspectionlog を読む

// ===== 状態色（UI側） =====
function rowBg(rec){
  // 既存優先：checked が true ならピンク
  if(rec.checked) return 'bg-pink';
  // 停止・不要・7日ルール
  if(rec.status === 'stop') return 'bg-gray';
  if(rec.status === 'skip') return 'bg-yellow';
  if(rec.status === '7days_rule') return 'bg-blue';
  // 既定は緑
  return 'bg-green';
}

// ===== ステータスUI候補 =====
function buildStatusOptions(selected){
  const opts = [
    {v:'standby', label:'待機'},
    {v:'stop',    label:'停止'},
    {v:'skip',    label:'不要'},
    {v:'7days_rule', label:'7日ルール'}
  ];
  const frag = document.createDocumentFragment();
  for(const o of opts){
    const op = create('option');
    op.value = o.v;
    op.textContent = o.label;
    if(o.v === selected) op.selected = true;
    frag.appendChild(op);
  }
  return frag;
}

// ===== 初期同期（全体管理） → 既存I/Fのまま =====
async function pullMain(){
  const url = `${GAS_URL}?action=pull&sheet=${encodeURIComponent(SHEET_MAIN)}`;
  const res = await fetch(url, {method:'GET'});
  const data = await res.json(); // 既存：{status:'ok', data, headers} など
  return data;
}

// ===== ログ取得（inspectionlog） → 2行目以降の配列 =====
async function pullLog(){
  const url = `${GAS_URL}?action=pull&sheet=${encodeURIComponent(SHEET_LOG)}`;
  const res = await fetch(url, {method:'GET'});
  const arr = await res.json(); // 既存：配列のみ
  return Array.isArray(arr) ? arr : [];
}

// ===== ログ→UI用正規化（InspectionLog 専用） =====
/*
  期待する行配列： [city, station, model, plate, index, status, checked_at]
  - status:
      'Checked'     -> rec.checked = true, rec.status = 'standby'
      'stopped'     -> rec.status = 'stop'
      'Unnecessary' -> rec.status = 'skip'
      '7days_rule' / '7 day rule' -> rec.status = '7days_rule'
      'normal' / 'nomal' / 未設定 -> rec.status = 'standby'
*/
function normalizeLogArray(rows){
  const buckets = {}; // city毎
  for(const row of rows){
    if(!row || row.length < 6) continue;

    const city   = (row[0]||'').toString();
    const station= (row[1]||'').toString();
    const model  = (row[2]||'').toString();
    const number = (row[3]||'').toString(); // plate
    const idxSt  = (row[4]||'').toString();
    const statusEng= (row[5]||'').toString();
    const checkedAt=(row[6]||'').toString();

    // ★ 変更：既定状態は 'standby'
    const rec = {
      city, station, model, number,
      status:'standby', checked:false, index:'', last_inspected_at:'',
      ui_index: idxSt
    };

    // 行番号（表示用）
    {
      const m = idxSt.match(/(\d+)$/) || idxSt.match(/([A-Za-z]|[^0-9]*)(\d+)/);
      if(m){
        const num = parseInt(m[1],10);
        if(Number.isFinite(num)) rec.ui_index_num = num;
      }
    }

    // シートstatus→内部表現
    switch(statusEng){
      case 'normal':
      case 'nomal':
        rec.status = 'standby';
        break;
      case 'Checked':
        rec.checked = true;
        // UI表示は 'standby' 基準（ピンク化は checked=true が担う）
        rec.status = 'standby';
        rec.last_inspected_at = toISOChecked(checkedAt);
        break;
      case 'stopped':
        rec.status = 'stop';
        break;
      case 'Unnecessary':
        rec.status = 'skip';
        break;
      case '7days_rule':
      case '7 day rule':
        rec.status = '7days_rule';
        rec.checked = false;
        rec.last_inspected_at = toISOChecked(checkedAt);
        break;
      default:
        // ★ 変更：既定も 'standby'
        rec.status = 'standby';
    }

    if(!buckets[city]) buckets[city] = [];
    buckets[city].push(rec);
  }
  return buckets;
}

// ===== 全体管理（配列 or オブジェクト）→ UI正規化（既存のまま） =====
function normalizeMain(data){
  const buckets = {};
  if(Array.isArray(data)){
    // ヘッダ＋データ形式想定：先頭はヘッダ
    const rows = data.data || data;
    const headers = data.headers || rows[0] || [];
    const H = headers.map(h => (h||'').toString().trim().toLowerCase());
    const map = {};
    H.forEach((h,i)=> map[h]=i);
    for(let i=1;i<rows.length;i++){
      const r = rows[i];
      if(!r) continue;
      const city    = (r[map['city']]||'').toString();
      const station = (r[map['station']]||'').toString();
      const model   = (r[map['model']]||'').toString();
      const number  = (r[map['plate']]||r[map['number']]||'').toString();
      const idxSt   = (r[map['index']]||'').toString();

      const rec = {
        city, station, model, number,
        // 全体管理は初期状態：standby 相当（未チェック・未停止・不要でない）
        status:'standby', checked:false, index:'', last_inspected_at:'',
        ui_index: idxSt
      };
      if(!buckets[city]) buckets[city]=[];
      buckets[city].push(rec);
    }
  }else if(data && data.status==='ok' && Array.isArray(data.data)){
    const rows = data.data, headers = data.headers || [];
    const H = headers.map(h => (h||'').toString().trim().toLowerCase());
    const map = {}; H.forEach((h,i)=> map[h]=i);

    for(const r of rows){
      if(!r) continue;
      const city    = (r[map['city']]||'').toString();
      const station = (r[map['station']]||'').toString();
      const model   = (r[map['model']]||'').toString();
      const number  = (r[map['plate']]||r[map['number']]||'').toString();
      const idxSt   = (r[map['index']]||'').toString();

      const rec = {
        city, station, model, number,
        status:'standby', checked:false, index:'', last_inspected_at:'',
        ui_index: idxSt
      };
      if(!buckets[city]) buckets[city]=[];
      buckets[city].push(rec);
    }
  }
  return buckets;
}

// ===== マウント（都市ごと） =====
function mountCity(city, list, root){
  const wrap = create('div', 'city-wrap');
  const h2 = create('h2'); h2.textContent = city;
  wrap.appendChild(h2);

  for(const rec of list){
    const card = create('div', `card ${rowBg(rec)}`);

    const title = create('div','card-title');
    title.textContent = `${rec.ui_index || ''} ${rec.model} ${rec.number}`;
    card.appendChild(title);

    // チェックボックス
    const chk = create('input');
    chk.type = 'checkbox';
    chk.checked = !!rec.checked;
    on(chk,'change', ()=>{ rec.checked = chk.checked; });
    const chkWrap = create('label','chk');
    chkWrap.append('チェック', chk);
    card.appendChild(chkWrap);

    // ステータス
    const sel = create('select');
    sel.appendChild(buildStatusOptions(rec.status));
    on(sel,'change', ()=>{
      rec.status = sel.value;
      // 色を更新
      card.className = `card ${rowBg(rec)}`;
    });
    const selWrap = create('label','sel');
    selWrap.append('状態', sel);
    card.appendChild(selWrap);

    // 日付
    const date = create('input');
    date.type = 'date';
    date.value = rec.last_inspected_at ? fmtDate(rec.last_inspected_at) : '';
    on(date,'change', ()=>{ rec.last_inspected_at = date.value; });
    const dateWrap = create('label','date');
    dateWrap.append('最終', date);
    card.appendChild(dateWrap);

    root.appendChild(card);
  }
}

// ===== 初期同期 UI =====
async function initSync(){
  const btn = $('#btn-init');
  const bar = $('#progress');
  if(!btn || !bar) return;

  btn.disabled = true;
  bar.style.display = 'block';

  try{
    const data = await pullMain();
    // v8k 互換：normalizeMain
    const buckets = normalizeMain(data);
    storeSet('buckets', buckets);
    render();
  }catch(e){
    alert('初期同期に失敗しました');
  }finally{
    btn.disabled = false;
    bar.style.display = 'none';
  }
}

// ===== 同期（POST→GAS、→GET pullで更新） =====
async function sync(){
  const buckets = storeGet('buckets', {});
  const items = [];
  for(const city of Object.keys(buckets)){
    for(const rec of buckets[city]){
      // 既存：部分更新（index/status/checked_at）
      const payload = {
        plate: rec.number || '',
        index: rec.index || '',
        status: rec.status || '',
        checked_at: rec.checked ? fmtDate(new Date()) : (rec.last_inspected_at || '')
      };
      // 条件：何か入っているもののみ送る
      if(payload.plate && (payload.index || payload.status || payload.checked_at)){
        items.push(payload);
      }
    }
  }

  if(!items.length){
    alert('送信データがありません');
    return;
  }

  $('#sync-state').textContent = 'データ送信中…';
  try{
    // v8k 互換：x-www-form-urlencoded の action=push&data=<JSON>
    const body = new URLSearchParams();
    body.set('action','push');
    body.set('data', JSON.stringify(items));

    const res = await fetch(GAS_URL, {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    const r = await res.json();
    if(!r || r.ok !== true){
      alert('同期送信に失敗しました');
      return;
    }

    // 直後pullで UI 反映
    $('#sync-state').textContent = '同期取得中…';
    const logRows = await pullLog(); // 2行目以降配列
    const byCity = normalizeLogArray(logRows);

    // 既存 buckets とマージ（都市 → 既存カードへ反映）
    for(const city of Object.keys(byCity)){
      const list = byCity[city];
      // number をキーに上書き
      const map = new Map((buckets[city]||[]).map(r => [r.number, r]));
      for(const rec of list){
        if(map.has(rec.number)){
          const cur = map.get(rec.number);
          cur.status = rec.status;
          cur.checked = rec.checked;
          cur.index  = rec.index || cur.index;
          cur.last_inspected_at = rec.last_inspected_at || cur.last_inspected_at;
        }else{
          (buckets[city] ||= []).push(rec);
        }
      }
    }
    storeSet('buckets', buckets);
    render();
    $('#sync-state').textContent = '同期完了';
  }catch(e){
    alert('同期でエラーが発生しました');
  }finally{
    setTimeout(()=>{ $('#sync-state').textContent=''; }, 1200);
  }
}

// ===== 描画 =====
function render(){
  const root = $('#root');
  root.innerHTML = '';
  const buckets = storeGet('buckets', {});
  const cities = Object.keys(buckets).sort();
  for(const c of cities){
    mountCity(c, buckets[c], root);
  }
}

// ===== 起動 =====
function main(){
  const initBtn = $('#btn-init');
  if(initBtn){ on(initBtn,'click', initSync); }
  const syncBtn = $('#btn-sync');
  if(syncBtn){ on(syncBtn,'click', sync); }
  render();
}
document.addEventListener('DOMContentLoaded', main);
