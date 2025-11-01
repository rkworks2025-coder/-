// ★バージョン v10g 用の修正が適用されています (初期化エラー捕捉)

try { // アプリコード全体をtryブロックで囲む

// ====== 設定 ======
const Junkai = (()=> {

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
   */
  function setStatusText(text){
     const el = document.getElementById('statusText');
     if(el) el.textContent = text;
  }

  /**
   * Format a Date object to JST YYYY/MM/DD (日付のみ).
   */
  function toJSTDateOnly(date){
    if(!date || isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000; 
    const jstTime = date.getTime() + offset + (9 * 60 * 60 * 1000); 
    const jstDate = new Date(jstTime);
    
    const y = jstDate.getFullYear();
    const m = String(jstDate.getMonth() + 1).padStart(2, '0');
    const d = String(jstDate.getDate()).padStart(2, '0');
    
    return `${y}/${m}/${d}`;
  }

  /**
   * Read city data from local storage.
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
   */
  function writeCity(city, arr){
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }
  
  /**
   * Get all records from all cities.
   */
  function readAll(){
    return CITIES.flatMap(readCity);
  }

  /**
   * Get the current status/color based on record data.
   */
  function rowBg(rec){
    if(rec.status === 'stopped' || rec.status === 'stop') return 'bg-gray'; 
    if(rec.status === 'unnecessary' || rec.status === 'skip') return 'bg-yellow'; 
    if(rec.status === '7days_rule' || rec.status === '7 day rule') return 'bg-blue'; 
    if(rec.checked) return 'bg-pink'; 
    return 'bg-green'; 
  }

  /**
   * Check if a record was inspected within the last 7 days.
   */
  function within7d(rec){
    if(!rec.last_inspected_at) return false;
    const [y, m, d] = rec.last_inspected_at.split('/').map(Number);
    if (!y || !m || !d) return false;
    
    const lastDate = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);

    const diff = now.getTime() - lastDate.getTime();
    return diff < (7 * 24 * 60 * 60 * 1000) && diff >= 0; 
  }

  // ===== API Calls (変更なし) =====
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
      
      if(!res.ok){ throw new Error(`HTTP Error! Status: ${res.status}`); }
      
      const json = await res.json();
      if(!json.ok){ throw new Error(`GAS Error: ${json.error || '不明なエラー'}`); }
      return json;
    } catch(e) {
      clearTimeout(timeout);
      throw e;
    }
  }

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
      
      if(!res.ok){ throw new Error(`HTTP Error! Status: ${res.status}`); }
      
      const json = await res.json();
      if(!json.ok){ throw new Error(`GAS Error: ${json.error || '不明なエラー'}`); }
      return json;
    } catch(e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  // ===== Core Logic =====

  /**
   * Initial data pull from '全体管理'.
   */
  async function initialSync(){
    if(!confirm('初期同期を行います。現在のローカルデータはリセットされますが、よろしいですか？')) return; 

    document.getElementById('initSyncBtn').disabled = true;
    showProgress(true, 5, 'リセット中...');
    
    CITIES.forEach(c => localStorage.removeItem(LS_KEY(c)));
    updateIndexCounts(); 
    
    showProgress(true, 10, '初期データ取得中 (全体管理)');
    
    try {
      const json = await pullData('全体管理');
      showProgress(true, 40, 'データ処理中');

      const arr = json?.data;
      if(!arr || arr.length === 0){
        setStatusText('初期同期完了: 「全体管理」シートにデータが見つかりませんでした。');
        showProgress(false);
        document.getElementById('initSyncBtn').disabled = false;
        return;
      }

      const buckets = { [CITIES[0]]:[], [CITIES[1]]:[], [CITIES[2]]:[] };
      let recordCount = 0;
      
      arr.forEach((rowObj, index) => {
        const cityName = (rowObj.city||'').trim(); 
        
        if(!buckets[cityName]){ return; } 

        const newRec = {
          city: cityName,
          station: (rowObj.station || '').trim(),
          model: (rowObj.model || '').trim(),
          number: (rowObj.number || '').trim(),
          ui_index: (rowObj.ui_index || '').trim(), 
          index: index + 1, 
          status: 'normal', 
          checked: false, 
          last_inspected_at: '',
          ui_index_num: index 
        };

        newRec.ui_index = `${PREFIX[cityName]}${buckets[cityName].length + 1}`; 
        
        buckets[cityName].push(newRec);
        recordCount++;
      });
      
      CITIES.forEach(city => writeCity(city, buckets[city]));

      showProgress(true, 100, '初期同期完了');
      setStatusText(`初期同期完了: 全 ${recordCount} 件のデータを保存しました。`);

      await sleep(500);
      location.reload(); 

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
    setStatusText('データ送信中...');
    showProgress(true, 20, 'データ送信中...');
    try {
      await pushData(allRecords); 
      setStatusText('送信成功、同期取得中...');
      showProgress(true, 50, '同期取得中...');
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
            String(row[4] || '') === (rec.ui_index || '') 
          );

          if(logRow){
            rec.status = String(logRow[5]).trim() || 'normal'; 
            rec.checked = logRow[6] === true || String(logRow[6]).toUpperCase() === 'TRUE';
            rec.last_inspected_at = String(logRow[8] || '');
          } 

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
  
  // 以下のUI関数は省略（v10eと同じ）
  function updateIndexCounts() {
    const all = readAll();
    let total = all.length;
    let allDone = 0;
    let allStop = 0;
    let allSkip = 0;

    CITIES.forEach(city => {
        const cityData = all.filter(r => r.city === city);
        let done = 0;
        let stop = 0;
        let skip = 0;
        
        cityData.forEach(r => {
            if (r.checked) {
                done++;
            }
            if (r.status === 'stopped' || r.status === 'stop') {
                stop++;
            }
            if (r.status === 'unnecessary' || r.status === 'skip') {
                skip++;
            }
        });
        const map = {
          "大和市":    {done:'#yamato-done', stop:'#yamato-stop', skip:'#yamato-skip', total:'#yamato-total', rem:'#yamato-rem'},
          "海老名市":  {done:'#ebina-done',  stop:'#ebina-stop',  skip:'#ebina-skip',  total:'#ebina-total', rem:'#ebina-rem'},
          "調布市":    {done:'#chofu-done',  stop:'#chofu-stop',  skip:'#chofu-skip',  total:'#chofu-total', rem:'#chofu-rem'},
        };
        const m = map[city];
        if (m) {
            document.querySelector(m.done).textContent = done;
            document.querySelector(m.stop).textContent = stop;
            document.querySelector(m.skip).textContent = skip;
            document.querySelector(m.total).textContent = cityData.length;
            document.querySelector(m.rem').textContent = cityData.length - done - stop - skip;
        }

        allDone += done;
        allStop += stop;
        allSkip += skip;
    });

    document.querySelector('#all-done').textContent = allDone;
    document.querySelector('#all-stop').textContent = allStop;
    document.querySelector('#all-skip').textContent = allSkip;
    document.querySelector('#all-total').textContent = total;
    document.querySelector('#all-rem').textContent = total - allDone - allStop - allSkip;
    
    const hint = document.getElementById('overallHint');
    if (hint) {
        if (total === 0) {
            hint.textContent = 'まだ同期されていません';
        } else {
            hint.textContent = `総件数：${total}`;
        }
    }
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
          const parts = String(rec.last_inspected_at).split('/');
          if (parts.length === 3) {
            dtDiv.innerHTML = `${parts[0]}<br>${parts[1]}/${parts[2]}`;
            dtDiv.style.display = '';
            return;
          }
        }
        dtDiv.innerHTML = '';
        dtDiv.style.display = 'none';
      }
      updateDateTime();
      
      dtDiv.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'date';
        if(rec.last_inspected_at){
          const isoDate = rec.last_inspected_at.replace(/\//g, '-');
          input.value = isoDate;
        }
        dtDiv.appendChild(input);
    
        if(typeof input.showPicker === 'function'){ input.showPicker(); } else { input.focus(); }
        input.addEventListener('change', () => {
          const sel = input.value;
          dtDiv.removeChild(input);
          if(!sel) return;
          if(!confirm('よろしいですか？')) return;
          const [y, m, d] = sel.split('-').map(Number); 
          
          rec.last_inspected_at = `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`; 
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
        if(rec.checked){
           rec.last_inspected_at = toJSTDateOnly(new Date());
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
        if(v === 'stop') v = 'stopped'; 
        if(v === 'skip') v = 'unnecessary'; 

        if(v === rec.status) o.selected = true;
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
    document.getElementById('initSyncBtn').addEventListener('click', initialSync);
    document.getElementById('syncBtn').addEventListener('click', syncAll);

    updateIndexCounts(); 
    
    const total = readAll().length;
    if (total === 0) {
        document.getElementById('overallHint').textContent = 'データがありません。「初期同期」ボタンを押してください。';
    } else {
        document.getElementById('overallHint').textContent = `総件数：${total}`;
    }
  }
  
  function initCity(city) {
      document.getElementById('list').innerHTML = ''; 
      renderCity(city);
      const arr = readCity(city);
      if (arr.length === 0) {
          document.getElementById('hint').textContent = `まだ「${city}」のデータがありません。「巡回リスト」に戻って「初期同期」を押してください。`;
      } else {
          document.getElementById('hint').textContent = `全 ${arr.length} 台`;
      }
  }

  return { init: init, initCity: initCity, initialSync, syncAll, updateIndexCounts };
})();

document.addEventListener('DOMContentLoaded', () => {
    const url = window.location.pathname;
    if (url.endsWith('yamato.html') || url.endsWith('ebina.html') || url.endsWith('chofu.html')) {
        const cityMap = {
            'yamato.html': '大和市',
            'ebina.html': '海老名市',
            'chofu.html': '調布市'
        };
        const currentCity = cityMap[url.substring(url.lastIndexOf('/') + 1)];
        if (currentCity) Junkai.initCity(currentCity);
    } else {
        Junkai.init();
    }
});

} catch (e) {
    // 致命的な初期化エラーをキャッチし、エラーモーダルを表示
    const errorMsg = "Fatal Init Error: " + (e.message || '不明なエラー');
    // DOMがロードされているか確認し、可能であればエラーモーダルを表示
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        alert(errorMsg); // 最後の手段としてalert
    } else {
        window.addEventListener('load', () => alert(errorMsg));
    }
}