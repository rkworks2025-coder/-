// ====== 設定 ======
const Junkai = (()=> {

  // ★バージョン v10b 用の修正が適用されています
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec"; // ★あなたのURLに置き換え済み★
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const CITIES = ["大和市","海老名市","調布市"];
  const PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  const LS_KEY = (c) => `junkai:city:${c}`;
  const TIMEOUT_MS = 15000;
  const DEBUG_ERRORS = true;

  // ===== utils =====
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

  /**
   * Show or hide the progress modal and optionally update its bar width.
   * @param {boolean} on Whether to show the modal.
   * @param {number} pct Percentage (0–100) of the progress bar width.
   */
  function showProgress(on, pct){
    const m = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    if(!m) return;
    if(on) m.classList.add('show'); else m.classList.remove('show');
    if(bar && pct !== undefined) bar.style.width = `${pct}%`;
  }

  /**
   * Show an error message in the modal.
   * @param {string} msg Error message.
   * @param {string} title Modal title.
   */
  function showError(msg, title='エラー'){
    showProgress(false);
    const m = document.getElementById('errorModal');
    if(!m) return;
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMsg').textContent = msg;
    m.classList.add('show');
    m.onclick = () => m.classList.remove('show');
  }

  /**
   * Format a Date object to JST YYYY/MM/DD HH:mm:ss.
   * @param {Date} date Date object.
   * @returns {string} Formatted JST string.
   */
  function toJST(date){
    if(!date || isNaN(date.getTime())) return '';
    // ISOStringで取得し、時差9時間を反映させてJSTとして整形
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}/${m}/${d} ${h}:${min}:${s}`;
  }

  /**
   * Read city data from local storage.
   * @param {string} city City name.
   * @returns {Array<Object>} Array of records.
   */
  function readCity(city){
    const json = localStorage.getItem(LS_KEY(city));
    try {
      return JSON.parse(json) || [];
    } catch(e) {
      console.error(`Local storage JSON parse error for ${city}:`, e);
      return [];
    }
  }

  /**
   * Persist city data to local storage.
   * @param {string} city City name.
   * @param {Array<Object>} arr Array of records.
   */
  function writeCity(city, arr){
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }
  
  /**
   * Get all records from all cities.
   * @returns {Array<Object>} All records.
   */
  function readAll(){
    return CITIES.flatMap(readCity);
  }

  /**
   * Get the current status/color based on record data.
   * @param {Object} rec Record object.
   * @returns {string} Status class name.
   */
  function rowBg(rec){
    if(rec.status === 'stopped' || rec.status === 'stop') return 'bg-gray'; // 稼働停止
    if(rec.status === 'unnecessary' || rec.status === 'skip') return 'bg-yellow'; // 巡回不要
    if(rec.status === '7days_rule' || rec.status === '7 day rule') return 'bg-blue'; // 7日ルール
    if(rec.checked) return 'bg-pink'; // チェック済み
    return 'bg-green'; // 通常
  }

  /**
   * Check if a record was inspected within the last 7 days.
   * @param {Object} rec Record object.
   * @returns {boolean} True if within 7 days.
   */
  function within7d(rec){
    if(!rec.last_inspected_at) return false;
    const date = new Date(rec.last_inspected_at);
    if(isNaN(date.getTime())) return false;
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return diff < (7 * 24 * 60 * 60 * 1000); // Less than 7 days
  }

  // ===== API Calls =====

  /**
   * Send data to GAS (POST/Push).
   * @param {Array<Object>} data Data to send.
   * @returns {Promise<Object>} API response.
   */
  async function pushData(data){
    const params = new URLSearchParams();
    params.append('action', 'push');
    params.append('data', JSON.stringify(data)); 
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'}, 
        body: params.toString(),
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if(!res.ok){
        throw new Error(`HTTP Error! Status: ${res.status}`);
      }
      
      const json = await res.json();
      if(!json.ok){
         throw new Error(`GAS Error: ${json.error || '不明なエラー'}`);
      }
      return json;
    } catch(e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  /**
   * Get data from GAS (GET/Pull).
   * @param {string} sheetName Sheet name to pull data from.
   * @returns {Promise<Object>} API response.
   */
  async function pullData(sheetName){
    const url = new URL(GAS_URL);
    url.searchParams.append('action', 'pull');
    url.searchParams.append('sheet', sheetName);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if(!res.ok){
        throw new Error(`HTTP Error! Status: ${res.status}`);
      }
      
      const json = await res.json();
      if(!json.ok){
        throw new Error(`GAS Error: ${json.error || '不明なエラー'}`);
      }
      return json;
    } catch(e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  // ===== Core Logic =====

  /**
   * Initial data pull from '全体管理'.
   * Merges with existing local data.
   */
  async function initialSync(){
    document.getElementById('initSyncBtn').disabled = true;
    showProgress(true, 10);
    try {
      const json = await pullData('全体管理');
      showProgress(true, 50);

      const arr = json?.data;
      if(!arr || arr.length === 0){
        throw new Error('データが空でした。シート名、アクセス権、またはデータ構造を確認してください。');
      }

      const buckets = { [CITIES[0]]:[], [CITIES[1]]:[], [CITIES[2]]:[] };
      const currentData = readAll();
      
      arr.forEach((rowObj, index) => {
        // GAS側で'市区町村'が'city'に変換されている前提
        const cityName = (rowObj.city||'').trim(); 
        if(!buckets[cityName]) return; 

        // 既存データをマージ (ui_index, number (plate) の順でマッチング)
        let rec = currentData.find(x => 
          (x.ui_index || '') === (rowObj.ui_index || '') ||
          (x.number || '') === (rowObj.number || '')
        ) || {};

        // 新しいレコードオブジェクトを作成/更新
        const newRec = {
          ...rec, // 既存のステータス, checked, last_inspected_atなどを引き継ぐ
          city: cityName,
          station: (rowObj.station || '').trim(),
          model: (rowObj.model || '').trim(),
          number: (rowObj.number || '').trim(),
          ui_index: (rowObj.ui_index || '').trim(),
          index: index + 1, // 全体管理の行番号
          // ★修正3: 必須項目の初期値設定を強化
          status: rec.status || 'normal', 
          checked: rec.checked || false,
          last_inspected_at: rec.last_inspected_at || '',
          ui_index_num: index // 内部インデックス
        };

        // UI表示用のindexを付与 (Y001, E001, C001)
        newRec.ui_index = `${PREFIX[cityName]}${String(buckets[cityName].length + 1).padStart(3, '0')}`;
        
        buckets[cityName].push(newRec);
      });

      // Local Storageに書き込み
      CITIES.forEach(city => writeCity(city, buckets[city]));

      showProgress(true, 100);
      await sleep(500);
      location.reload(); // 成功したらリロードしてUIを更新

    } catch(e) {
      document.getElementById('initSyncBtn').disabled = false;
      showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : '初期同期に失敗しました。', '初期同期失敗');
    }
  }

  /**
   * Synchronize (Push and Pull) all data.
   */
  async function syncAll(){
    document.getElementById('syncBtn').disabled = true;
    const allRecords = readAll();
    
    // 1. PUSH (送信)
    status('データ送信中…');
    showProgress(true, 20);
    try {
      await pushData(allRecords); 
      status('送信成功、同期取得中...');
      showProgress(true, 50);
    } catch(e){
      document.getElementById('syncBtn').disabled = false;
      showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : 'データ送信に失敗しました。', '同期失敗');
      return;
    }

    // 2. PULL (受信) - InspectionLogから最新のステータスを取得
    try {
      const json = await pullData('InspectionLog');
      const logArr = json?.values; // GASは2次元配列を返す

      
      if(!logArr || logArr.length === 0){
        // InspectionLogが空の場合、エラー表示せずに継続
        status('同期完了（ログデータなし）');
      } else {
        // ヘッダー行をスキップ (GASはヘッダーも含めて送ってくるため)
        const logData = logArr.slice(1); 
        
        // 既存の全レコードを更新
        const updatedRecords = allRecords.map(rec => {
          // ui_index を使って InspectionLog の対応行を探す
          const logRow = logData.find(row => 
            String(row[4] || '') === (rec.ui_index || '') // 4は ui_index 列 (0-based)
          );

          if(logRow){
            // logRow: [city, station, model, number, ui_index, status, checked, index, last_inspected_at, ui_index_num]
            // ★修正5: シートから取得した status, checked, last_inspected_at で上書き
            rec.status = String(logRow[5]).trim() || 'normal'; 
            // シートのチェックボックスの値 (true/false) をそのまま適用
            rec.checked = logRow[6] === true || String(logRow[6]).toUpperCase() === 'TRUE';
            rec.last_inspected_at = String(logRow[8] || '');
          } else {
            // InspectionLogに見つからなかった場合、ローカルの値を維持（初期同期後の状態）
            // 何も更新しない
          }

          // 7日ルールの適用 (アプリ側で処理する場合)
          if(rec.status !== 'stopped' && rec.status !== 'unnecessary' && within7d(rec)){
             rec.status = '7days_rule';
          }
          
          return rec;
        });
        
        // Local Storageのデータを更新後のデータで上書き
        const buckets = { [CITIES[0]]:[], [CITIES[1]]:[], [CITIES[2]]:[] };
        updatedRecords.forEach(rec => {
          if(buckets[rec.city]) buckets[rec.city].push(rec);
        });
        CITIES.forEach(city => writeCity(city, buckets[city]));
      }


      showProgress(true, 100);
      await sleep(500);
      location.reload(); // 成功したらリロードしてUIを更新

    } catch(e) {
      document.getElementById('syncBtn').disabled = false;
      showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : 'データ受信に失敗しました。', '同期失敗');
    }
  }

  // ===== UI Rendering and Event Handlers =====

  /**
   * Render the data for a specific city.
   * @param {string} city City name.
   */
  function renderCity(city){
    const list = document.getElementById('list'); // IDをlistに修正
    if(!list) return;
    list.innerHTML = ''; // Clear existing list

    const arr = readCity(city);
    // Sort logic (optional, based on your UI needs)
    arr.sort((a,b) => (a.ui_index || '').localeCompare(b.ui_index || ''));

    arr.forEach(rec => {
      // Create card UI elements
      const row = document.createElement('div');
      row.className = `row ${rowBg(rec)}`; // Apply color based on status
      
      const left = document.createElement('div');
      left.className = 'leftcol'; // クラス名をleftcolに修正
      
      // ui_index, checkbox, datetime
      const idxDiv = document.createElement('div');
      idxDiv.className = 'idx';
      idxDiv.textContent = rec.ui_index || '';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = rec.checked;
      chk.className = 'chk';
      chk.disabled = rec.status === 'stopped' || rec.status === 'unnecessary';

      const topLeft = document.createElement('div');
      topLeft.className = 'left-top';
      topLeft.appendChild(idxDiv);
      topLeft.appendChild(chk);

      const dtDiv = document.createElement('div');
      dtDiv.className = 'datetime';
      function updateDateTime(){
        if(rec.last_inspected_at){
          // シートからJST YYYY/MM/DD HH:mm:ss形式で送られてくる前提
          dtDiv.innerHTML = rec.last_inspected_at.split(' ')[0].replace(/-/g, '/') + '<br>' + rec.last_inspected_at.split(' ')[1];
          dtDiv.style.display = '';
          return;
        }
        dtDiv.innerHTML = '';
        dtDiv.style.display = 'none';
      }
      updateDateTime();
      
      // 日付変更イベント（省略）
      // ... (dtDiv.addEventListenerはv8kのものをそのまま継承)
      dtDiv.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'date';
        if(rec.last_inspected_at){
          const d0 = new Date(rec.last_inspected_at);
          if(Number.isFinite(d0.getTime())){
            input.value = d0.toISOString().slice(0,10);
          }
        }
        dtDiv.appendChild(input);
    
        if(typeof input.showPicker === 'function'){ input.showPicker(); } else { input.focus(); }
        input.addEventListener('change', () => {
          const sel = input.value;
          dtDiv.removeChild(input);
          if(!sel) return;
          if(!confirm('よろしいですか？')) return;
          const iso = new Date(sel); // 日付オブジェクト取得
          rec.last_inspected_at = toJST(iso); // JST形式に変換
          persistCityRec(city, rec);
          updateDateTime();
          row.className = `row ${rowBg(rec)}`;
        }, { once: true });
      });


      left.appendChild(topLeft);
      left.appendChild(dtDiv);
      
      // ★修正6: チェックボックスのイベントハンドラ強化
      chk.addEventListener('change', () => {
        const message = chk.checked ? 'チェックを付けます。よろしいですか？' : 'チェックを外します。よろしいですか？';
        if(!confirm(message)){
          chk.checked = !chk.checked;
          return;
        }

        rec.checked = chk.checked;
        if(chk.checked){
           // チェックON時：現在時刻をJST形式で保存
           rec.last_inspected_at = toJST(new Date());
           rec.status = 'normal'; // チェックした場合は通常ステータスに戻る
        } else {
           // チェックOFF時：日時をクリア
           rec.last_inspected_at = '';
           rec.status = 'normal';
        }
        
        persistCityRec(city, rec);
        updateDateTime();
        row.className = `row ${rowBg(rec)}`; // 色を更新
      });

      const mid = document.createElement('div');
      mid.className = 'mid';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = rec.station || '';
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.innerHTML = `${rec.model || ''}<br>${rec.number || ''}`;
      mid.appendChild(title);
      mid.appendChild(sub);

      const right = document.createElement('div');
      right.className = 'rightcol';
      
      // Status selector (Dropdown)
      const sel = document.createElement('select');
      sel.className = 'state';
      // ステータスオプション
      [['normal','通常'], ['stop','停止'], ['skip','不要']].forEach(([v,lab])=>{
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if(v === 'stop') v = 'stopped'; // アプリ内部表記に合わせて補正
        if(v === 'skip') v = 'unnecessary'; // アプリ内部表記に合わせて補正

        if(v === rec.status) o.selected = true;
        sel.appendChild(o);
      });
      
      // ★修正7: ドロップダウン変更イベント
      sel.addEventListener('change', () => {
        rec.status = sel.value; // 'stop' or 'skip'
        
        if(rec.status === 'stop' || rec.status === 'skip'){
           rec.checked = false; // 停止/不要ならチェックを外す
           rec.last_inspected_at = ''; // 日時もクリア
        } else {
           // 'normal'に戻した時、ローカルストレージの値をそのまま維持
        }
        
        persistCityRec(city, rec);
        row.className = `row ${rowBg(rec)}`; // 色を更新
        // チェックボックスの状態も更新
        chk.checked = rec.checked; 
        chk.disabled = rec.status === 'stop' || rec.status === 'skip';
      });

      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.textContent = '点検';
      btn.addEventListener('click', () => {
        const q = new URLSearchParams({
          station: rec.station || '',
          model: rec.model || '',
          plate_full: rec.number || '',
        });
        location.href = `${TIRE_APP_URL}?${q.toString()}`;
      });
      right.appendChild(sel);
      right.appendChild(btn);
      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);
      list.appendChild(row);
    });
  }

  /**
   * Persist a record update to local storage by matching on ui_index or plate number.
   * @param {string} city City name.
   * @param {Object} rec Record to persist.
   */
  function persistCityRec(city, rec){
    const arr = readCity(city);
    let i = -1;
    if(rec.ui_index){
      i = arr.findIndex(x => (x.ui_index || '') === (rec.ui_index || ''));
    }
    // ui_indexでマッチしない場合、numberで試す (v8kのロジック)
    if(i === -1 && rec.number){
      i = arr.findIndex(x => (x.number || '') === (rec.number || ''));
    }

    if(i !== -1){
      arr[i] = rec;
    } else {
      // 既存データに見つからない場合は、ログに出す
      console.warn('Record not found for persistence:', rec);
      arr.push(rec);
    }
    writeCity(city, arr);
  }

  // ===== Initialize =====

  function init(){
    // Event listeners
    document.getElementById('initSyncBtn').addEventListener('click', initialSync);
    document.getElementById('syncBtn').addEventListener('click', syncAll);

    // Initial render
    CITIES.forEach(renderCity);
    
    // Total count display
    const total = readAll().length;
    document.getElementById('totalCount').textContent = `全 ${total} 台`;
  }

  // Public interface
  return { init, initialSync, syncAll, renderCity };
})();

// DOMContentLoaded後に実行
document.addEventListener('DOMContentLoaded', Junkai.init);