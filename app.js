// ====== 設定 ======
const Junkai = (()=> {

  // ★バージョン v10d 用の修正が適用されています
  // GAS URLはあなたが使用しているものを維持しています
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec"; 
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
   * @param {string} title Optional title to display in the modal.
   */
  function showProgress(on, pct, title = '処理中…'){
    const m = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    const titleEl = document.getElementById('progressTitle');
    if(!m) return;
    if(on) m.classList.add('show'); else m.classList.remove('show');
    if(bar && pct !== undefined) bar.style.width = `${pct}%`;
    if(titleEl) titleEl.textContent = title;
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
   * Set status text in index.html
   * @param {string} text Status message.
   */
  function setStatusText(text){
     const el = document.getElementById('statusText');
     if(el) el.textContent = text;
  }

  /**
   * Format a Date object to JST YYYY/MM/DD HH:mm:ss.
   * @param {Date} date Date object.
   * @returns {string} Formatted JST string.
   */
  function toJST(date){
    if(!date || isNaN(date.getTime())) return '';
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
    showProgress(true, 10, '初期データ取得中 (全体管理)');
    
    try {
      // 1. GASからデータ取得
      const json = await pullData('全体管理');
      showProgress(true, 40, 'データ処理中');

      const arr = json?.data;
      if(!arr || arr.length === 0){
        // データが空の場合でも、エラーではなく処理完了として扱う（v10c修正）
        setStatusText('初期同期完了: 「全体管理」シートにデータが見つかりませんでした。');
        showProgress(false);
        document.getElementById('initSyncBtn').disabled = false;
        return;
      }

      const buckets = { [CITIES[0]]:[], [CITIES[1]]:[], [CITIES[2]]:[] };
      const currentData = readAll();
      let recordCount = 0;
      
      // 2. データのマージと仕分け
      arr.forEach((rowObj, index) => {
        // GAS側で'市区町村'が'city'に変換されている前提
        const cityName = (rowObj.city||'').trim(); 
        
        // cityName が CITIES に含まれない場合、スキップ
        if(!buckets[cityName]){
             if(DEBUG_ERRORS) console.warn(`Skipping record with unknown city: ${cityName}`);
             return; 
        } 

        // 既存データをマージ
        let rec = currentData.find(x => 
          (x.ui_index || '') === (rowObj.ui_index || '') ||
          (x.number || '') === (rowObj.number || '')
        ) || {};

        // 新しいレコードオブジェクトを作成/更新
        const newRec = {
          ...rec, 
          city: cityName,
          station: (rowObj.station || '').trim(),
          model: (rowObj.model || '').trim(),
          number: (rowObj.number || '').trim(),
          // ui_index は全体管理から取得（v8kの仕様）
          ui_index: (rowObj.ui_index || '').trim(), 
          index: index + 1, // 全体管理の行番号
          status: rec.status || 'normal', 
          checked: rec.checked || false,
          last_inspected_at: rec.last_inspected_at || '',
          ui_index_num: index // 内部インデックス
        };

        // UI表示用のindexを付与 (Y001, E001, C001)
        newRec.ui_index = `${PREFIX[cityName]}${String(buckets[cityName].length + 1).padStart(3, '0')}`;
        
        buckets[cityName].push(newRec);
        recordCount++;
      });
      
      // 3. Local Storageに書き込み
      CITIES.forEach(city => writeCity(city, buckets[city]));

      showProgress(true, 100, '初期同期完了');
      setStatusText(`初期同期完了: 全 ${recordCount} 件のデータを保存しました。`);

      await sleep(500);
      location.reload(); // 成功したらリロードしてUIを更新

    } catch(e) {
      // エラー発生時は必ずエラーモーダルを表示（v10c修正）
      document.getElementById('initSyncBtn').disabled = false;
      showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : '初期同期に失敗しました。GASのURL、アクセス権、またはシート名を確認してください。', '初期同期失敗');
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
      const logArr = json?.values; 

      if(!logArr || logArr.length === 0){
        setStatusText('同期完了: InspectionLogが空のため、ステータスは更新されません。');
      } else {
        const logData = logArr.slice(1); 
        
        const updatedRecords = allRecords.map(rec => {
          const logRow = logData.find(row => 
            String(row[4] || '') === (rec.ui_index || '') // 4は ui_index 列 (0-based)
          );

          if(logRow){
            rec.status = String(logRow[5]).trim() || 'normal'; 
            rec.checked = logRow[6] === true || String(logRow[6]).toUpperCase() === 'TRUE';
            rec.last_inspected_at = String(logRow[8] || '');
          } 
          // InspectionLogに見つからなかった場合、ローカルの値を維持

          // 7日ルールの適用
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
        setStatusText('同期完了: InspectionLogから最新のステータスを取得しました。');
      }

      showProgress(true, 100, '同期完了');
      await sleep(500);
      location.reload(); 

    } catch(e) {
      document.getElementById('syncBtn').disabled = false;
      showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : 'データ受信に失敗しました。', '同期失敗');
    }
  }
  
  // ===== UI Rendering and Event Handlers (省略せず) =====

  /**
   * Count summary values for a city's records (done, stop, skip, total).
   * (v8kの機能維持)
   */
  function countCity(arr){
    const c = {done:0, stop:0, skip:0, total:arr.length};
    for(const it of arr){
      if(it.status==='stop') c.stop++;
      else if(it.status==='skip') c.skip++;
      if(it.checked) c.done++; // checkedのみをカウント
    }
    return c;
  }
  
  /**
   * Repaint all counters on the index page and aggregated totals.
   * (v8kの機能維持)
   */
  function repaintCounters(){
    const map = {
      "大和市":    {done:'#yamato-done', stop:'#yamato-stop', skip:'#yamato-skip', total:'#yamato-total', rem:'#yamato-rem'},
      "海老名市":  {done:'#ebina-done',  stop:'#ebina-stop',  skip:'#ebina-skip',  total:'#ebina-total', rem:'#ebina-rem'},
      "調布市":    {done:'#chofu-done',  stop:'#chofu-stop',  skip:'#chofu-skip',  total:'#chofu-total', rem:'#chofu-rem'},
    };
    let overallTotal = 0, overallDone = 0, overallStop = 0, overallSkip = 0;
    for(const city of CITIES){
      const arr = readCity(city);
      const cnt = countCity(arr);
      overallTotal += cnt.total;
      overallDone += cnt.done;
      overallStop += cnt.stop;
      overallSkip += cnt.skip;
      const m = map[city];
      for(const k of ['done','stop','skip','total']){
        const el = document.querySelector(m[k]); if(el) el.textContent = cnt[k];
      }
      const remCount = cnt.total - cnt.done - cnt.skip;
      const remEl = document.querySelector(m.rem);
      if(remEl) remEl.textContent = remCount;
    }
    const allDoneEl  = document.querySelector('#all-done');
    const allStopEl  = document.querySelector('#all-stop');
    const allSkipEl  = document.querySelector('#all-skip');
    const allTotalEl = document.querySelector('#all-total');
    const allRemEl   = document.querySelector('#all-rem');
    if(allDoneEl)  allDoneEl.textContent  = overallDone;
    if(allStopEl)  allStopEl.textContent  = overallStop;
    if(allSkipEl)  allSkipEl.textContent  = overallSkip;
    if(allTotalEl) allTotalEl.textContent = overallTotal;
    if(allRemEl)   allRemEl.textContent   = (overallTotal - overallDone - overallSkip);
    const hint = document.getElementById('overallHint');
    if(hint) hint.textContent = overallTotal>0 ? `総件数：${overallTotal}` : 'まだ同期されていません';
  }

  function renderCity(city){
    const list = document.getElementById('list'); 
    if(!list) return;
    list.innerHTML = ''; 

    const arr = readCity(city);
    arr.sort((a,b) => (a.ui_index || '').localeCompare(b.ui_index || ''));

    arr.forEach(rec => {
      const row = document.createElement('div');
      row.className = `row ${rowBg(rec)}`; 
      
      const left = document.createElement('div');
      left.className = 'leftcol'; 
      
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
          dtDiv.innerHTML = String(rec.last_inspected_at).split(' ')[0].replace(/-/g, '/') + '<br>' + String(rec.last_inspected_at).split(' ')[1];
          dtDiv.style.display = '';
          return;
        }
        dtDiv.innerHTML = '';
        dtDiv.style.display = 'none';
      }
      updateDateTime();
      
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
          const iso = new Date(sel); 
          rec.last_inspected_at = toJST(iso); 
          persistCityRec(city, rec);
          updateDateTime();
          row.className = `row ${rowBg(rec)}`;
        }, { once: true });
      });


      left.appendChild(topLeft);
      left.appendChild(dtDiv);
      
      chk.addEventListener('change', () => {
        const message = chk.checked ? 'チェックを付けます。よろしいですか？' : 'チェックを外します。よろしいですか？';
        if(!confirm(message)){
          chk.checked = !chk.checked;
          return;
        }

        rec.checked = chk.checked;
        if(chk.checked){
           rec.last_inspected_at = toJST(new Date());
           rec.status = 'normal'; 
        } else {
           rec.last_inspected_at = '';
           rec.status = 'normal';
        }
        
        persistCityRec(city, rec);
        updateDateTime();
        row.className = `row ${rowBg(rec)}`; 
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
      
      const sel = document.createElement('select');
      sel.className = 'state';
      [['normal','通常'], ['stop','停止'], ['skip','不要']].forEach(([v,lab])=>{
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        // status==='stopped'がシートから来たら、'stop'を選択状態にする
        if((rec.status === 'stopped' && v === 'stop') || 
           (rec.status === 'unnecessary' && v === 'skip') ||
           (rec.status === v)) o.selected = true;
        
        sel.appendChild(o);
      });
      
      sel.addEventListener('change', () => {
        rec.status = sel.value; 
        
        if(rec.status === 'stop' || rec.status === 'skip'){
           rec.checked = false; 
           rec.last_inspected_at = ''; 
        } 
        
        persistCityRec(city, rec);
        row.className = `row ${rowBg(rec)}`; 
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

  function persistCityRec(city, rec){
    const arr = readCity(city);
    let i = -1;
    if(rec.ui_index){
      i = arr.findIndex(x => (x.ui_index || '') === (rec.ui_index || ''));
    }
    if(i === -1 && rec.number){
      i = arr.findIndex(x => (x.number || '') === (rec.number || ''));
    }

    if(i !== -1){
      arr[i] = rec;
    } else {
      console.warn('Record not found for persistence:', rec);
      arr.push(rec);
    }
    writeCity(city, arr);
  }

  function init(){
    // v10cのinit関数
    document.getElementById('initSyncBtn').addEventListener('click', initialSync);
    document.getElementById('syncBtn').addEventListener('click', syncAll);
    
    // index.htmlの描画とカウンターの更新
    repaintCounters();
  }
  
  function initCity(city) {
      // cityページの描画
      const list = document.getElementById('list');
      if(list) list.innerHTML = '';
      renderCity(city);
      
      const arr = readCity(city);
      const hintEl = document.getElementById('hint');
      if (arr.length === 0) {
          if(hintEl) hintEl.textContent = `まだ「${city}」のデータがありません。「巡回リスト」に戻って「初期同期」を押してください。`;
      } else {
          if(hintEl) hintEl.textContent = `全 ${arr.length} 台`;
      }
  }

  // Public interface
  return { init: init, initCity: initCity, initialSync, syncAll }; // initとinitCityを公開
})();

// DOMContentLoaded後に実行
document.addEventListener('DOMContentLoaded', () => {
    // URLに基づいて実行する関数を切り替え
    const url = window.location.pathname;
    if (url.endsWith('yamato.html') || url.endsWith('ebina.html') || url.endsWith('chofu.html')) {
        // 各HTMLファイルに記述されているscriptタグで呼び出される
    } else {
        Junkai.init(); // index.htmlのみJunkai.init()を実行
    }
});