// ====== 設定 ======
const Junkai = (()=> {

  // GAS_URLはCanvas実行環境で自動設定されます
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzCdDoldtJN_F2qB8aJoAwZinoVjunSq6Xf7qVdb11lB0-NLz4Dk2YfAN5iLb1Qdt8a/exec'; // Placeholder: Will be replaced by environment variable

  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/\
";
  const CITIES = ["大和市","海老名市","調布市"];
  const PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  const LS_KEY = (c) => `junkai:city:${c}`;
  const LS_HEADER_KEY = 'junkai:header:all'; // ヘッダー保存用
  const TIMEOUT_MS = 30000; // タイムアウトを30秒に延長
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
    if(bar && typeof pct==='number') bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  /**
   * Show a temporary status message in the appbar.
   * @param {string} msg Message to show.
   * @param {boolean} isError Whether it is an error message (shows red).
   */
  function showStatus(msg, isError=false){
    const statusText = document.getElementById('statusText');
    if(!statusText) return;
    statusText.textContent = msg;
    statusText.style.color = isError ? '#ef4444' : '#64748b';
    statusText.style.fontWeight = isError ? 'bold' : 'normal';
    setTimeout(() => {
      if(statusText.textContent === msg) {
        statusText.textContent = 'GASから取得して各エリアに保存します。';
        statusText.style.color = '#64748b';
        statusText.style.fontWeight = 'normal';
      }
    }, 5000);
  }

  /**
   * Fetch data from GAS with error handling.
   * @param {string} action GAS action ('init', 'pull', 'push')
   * @param {Object} params Additional parameters for the URL.
   * @param {string} method HTTP method ('GET' or 'POST').
   * @param {Object} data Data to send (for POST).
   * @returns {Promise<Object>} JSON response from GAS.
   */
  async function fetchGas(action, params = {}, method = 'GET', data = null) {
    const url = new URL(GAS_URL);
    url.searchParams.set('action', action);
    
    // Add other URL parameters
    for(const key in params) {
      if(params[key] !== undefined) url.searchParams.set(key, params[key]);
    }
    
    const fetchOptions = {
      method: method,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    
    if (method === 'POST' && data) {
      const formBody = new URLSearchParams();
      // POSTデータは 'data' パラメータにJSON文字列として格納
      formBody.append('data', JSON.stringify(data)); 
      fetchOptions.body = formBody.toString();
    }
    
    let response;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      response = await fetch(url.toString(), { ...fetchOptions, signal: controller.signal });
      clearTimeout(id);
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      
      // JSON解析エラーが発生する可能性がある
      const result = await response.json();

      if (!result.ok) {
        // GAS側でエラー処理された場合 (e.g., シートID間違いなど)
        const errMsg = result.message || 'GAS実行エラー（詳細不明）';
        throw new Error(`GAS Server Error: ${errMsg}`);
      }
      
      return result;
      
    } catch (e) {
      // タイムアウト、ネットワークエラー、JSONパースエラー、GASエラーのすべてをここで捕捉
      let errMsg;
      if (e.name === 'AbortError') {
        errMsg = '通信がタイムアウトしました。GASの実行時間が長すぎる可能性があります。';
      } else if (e.name === 'SyntaxError') {
        errMsg = `GASの応答が不正です（JSON解析エラー）。GASのコードを確認してください。元のエラー: ${e.message}`;
      } else if (e.message.includes('GAS Server Error')) {
        // GAS側で意図的に返されたエラーメッセージを表示
        errMsg = e.message.replace('GAS Server Error: ', '');
      } else {
        errMsg = `通信または解析エラー: ${e.message}`;
      }
      
      // デバッグモードでのみ詳細をコンソールに出力
      if (DEBUG_ERRORS) console.error("Fetch Error:", e);
      
      throw new Error(errMsg);
    }
  }

  // ===== Local Storage =====

  /**
   * Read all records for a city from local storage.
   * @param {string} city City name.
   * @returns {Array<Object>} List of records.
   */
  function readCity(city) {
    const json = localStorage.getItem(LS_KEY(city));
    try {
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  /**
   * Write all records for a city to local storage.
   * @param {string} city City name.
   * @param {Array<Object>} arr List of records.
   */
  function writeCity(city, arr) {
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }
  
  /**
   * Write header map to local storage.
   * @param {Object} headerMap Header map object.
   */
  function writeHeaderMap(headerMap) {
      localStorage.setItem(LS_HEADER_KEY, JSON.stringify(headerMap));
  }

  /**
   * Read header map from local storage.
   * @returns {Object} Header map object.
   */
  function readHeaderMap() {
      const json = localStorage.getItem(LS_HEADER_KEY);
      try {
          return json ? JSON.parse(json) : null;
      } catch {
          return null;
      }
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
    if(i < 0){
      i = arr.findIndex(x => (x.number || '') === (rec.number || ''));
    }
    
    if (i >= 0) {
      arr[i] = { ...arr[i], ...rec }; // マージして更新
    } else {
      // 見つからなかった場合はログにエラーを出すか、何もしない
      if (DEBUG_ERRORS) console.warn(`Record not found for persistence in ${city}:`, rec);
      return;
    }

    writeCity(city, arr);
  }

  // ===== Init Sync Logic (Index.html) =====

  /**
   * Handle the response from the initial sync fetch.
   * @param {Object} res Response object from fetchGas.
   * @param {string} action Action that triggered the sync.
   * @param {number} startTime Start time for performance logging.
   * @returns {Promise<void>}
   */
  async function handleInitialSyncResponse(res, action, startTime) {
    
    // GAS側が rows ではなく data キーで返すように変更したため、優先的に data を確認
    const arr = res.data || res.values || res.rows; 
    
    if (!Array.isArray(arr)) {
      throw new Error('データが配列ではありませんでした。GASの応答形式を確認してください。');
    }
    
    const totalCount = arr.length;
    if (totalCount === 0) {
      throw new Error('データが空でした。スプレッドシートの「全体管理」タブにデータが入っているか確認してください。');
    }
    
    // ヘッダー情報があれば保存 (GAS側がheadersを返すようになった)
    const headers = res.headers || [];
    let headerMap = null;
    if (headers.length > 0) {
        headerMap = {};
        headers.forEach((h, i) => {
            const hTrim = h.toLowerCase();
            // 複数の日本語名に対応
            if (hTrim.includes('市') || hTrim.includes('エリア') || hTrim.includes('city') || hTrim.includes('市区町村')) headerMap.city = i;
            if (hTrim.includes('駅') || hTrim.includes('station')) headerMap.station = i;
            if (hTrim.includes('型式') || hTrim.includes('model')) headerMap.model = i;
            if (hTrim.includes('ナンバー') || hTrim.includes('plate') || hTrim.includes('number')) headerMap.number = i;
            if (hTrim.includes('ステータス') || hTrim.includes('status')) headerMap.status = i;
            if (hTrim.includes('最終点検日') || hTrim.includes('last_inspected_at')) headerMap.last_inspected_at = i;
            // 'TS番号'はindexとして使わない
        });
        writeHeaderMap(headerMap);
    }
    
    // 既存のデータをロードし、マージ用オブジェクトを作成
    const existingData = {};
    CITIES.forEach(city => {
        existingData[city] = readCity(city).reduce((map, rec) => {
            if (rec.ui_index) map[rec.ui_index] = rec;
            return map;
        }, {});
    });

    // データを都市ごとに振り分ける
    const buckets = {};
    CITIES.forEach(city => buckets[city] = []);
    
    // 振り分け処理
    let rowObj = null;
    for(let i=0; i < totalCount; i++){
      const r = arr[i]; // GAS側はオブジェクトの配列を返す
      
      const rowObj = r;
      
      // city, station, model, number, status, last_inspected_at が存在することを確認
      const cityName = (rowObj.city||rowObj.エリア||rowObj.市区町村||'').trim(); // 複数のヘッダー名に対応する可能性
      
      if(!CITIES.includes(cityName)) {
        // 対象外の都市はスキップ
        continue; 
      }
      
      // UIで使うフィールドを正規化
      const normalizedRec = {
          city: cityName,
          station: (rowObj.station||rowObj.駅名||'').trim(),
          model: (rowObj.model||rowObj.型式||'').trim(),
          number: (rowObj.number||rowObj.ナンバー||'').trim(),
          status: (rowObj.status||rowObj.ステータス||'normal').trim(),
          last_inspected_at: (rowObj.last_inspected_at || rowObj.最終点検日 || ''),
          ui_index: PREFIX[cityName] + (buckets[cityName].length + 1),
          checked: false, // 初期同期時は未チェック
      };
      
      // 既存データ（ユーザーのチェック状態など）をマージ
      const existing = existingData[cityName][normalizedRec.ui_index];
      if (existing) {
          normalizedRec.checked = existing.checked || false;
          // statusとlast_inspected_atはGASの最新データで上書きする
          // normalizedRec.status = existing.status || normalizedRec.status;
          // normalizedRec.last_inspected_at = existing.last_inspected_at || normalizedRec.last_inspected_at;
      }

      buckets[cityName].push(normalizedRec);
      
      // 進捗バーを更新
      showProgress(true, Math.round((i + 1) / totalCount * 100));
      await sleep(1); // UI更新のための小休止
    }
    
    // Local Storageに保存
    CITIES.forEach(city => {
      writeCity(city, buckets[city]);
    });

    const endTime = performance.now();
    showStatus(`初期同期が完了しました (${totalCount}件 / ${((endTime - startTime) / 1000).toFixed(2)}秒)`, false);
    
    // ホーム画面の集計を更新
    if(window.location.pathname.endsWith('/index.html') || window.location.pathname === '/') {
      updateOverallStatus();
    }
  }

  /**
   * Initial sync: fetch all data from 全体管理 and save to Local Storage.
   * @param {Event} e Click event object.
   */
  async function initSync(e) {
    if (e && e.preventDefault) e.preventDefault();
    showProgress(true, 0);
    showStatus('初期同期中...');
    const startTime = performance.now();
    
    try {
      // 'init' action is used for the overall initial pull
      const res = await fetchGas('init'); 
      await handleInitialSyncResponse(res, 'init', startTime);

    } catch (error) {
      // GAS側で捕捉されたエラーメッセージもここで表示される
      const msg = error.message || '不明なエラーが発生しました。';
      showStatus(`初期同期失敗: ${msg}`, true);
      console.error('Initial Sync Failed:', error);
    } finally {
      showProgress(false);
    }
  }
  
  // ===== Status/Aggregates (Index.html) =====

  /**
   * Count done/stop/skip/total for a specific city.
   * @param {string} city City name.
   * @returns {{done: number, stop: number, skip: number, total: number, rem: number}} Counts.
   */
  function countCityStatus(city){
    const arr = readCity(city);
    let done = 0, stop = 0, skip = 0;
    for(const rec of arr){
      // 'done', 'stop', 'skip' は「対応済み」とみなす
      if(rec.status === 'done') done++;
      else if(rec.status === 'stop') stop++;
      else if(rec.status === 'skip') skip++;
    }
    const total = arr.length;
    // rem (残り) は total から done, stop, skip を引いたもの
    const rem = total - done - stop - skip;
    return { done, stop, skip, total, rem };
  }

  /**
   * Update the status display on the home screen for a single city card.
   * @param {string} city City name (e.g., 'yamato').
   * @param {Object} status Counts object from countCityStatus.
   */
  function updateCardStatus(city, status){
    document.getElementById(`${city}-done`).textContent = status.done;
    document.getElementById(`${city}-stop`).textContent = status.stop;
    document.getElementById(`${city}-skip`).textContent = status.skip;
    document.getElementById(`${city}-total`).textContent = status.total;
    document.getElementById(`${city}-rem`).textContent = status.rem;
  }

  /**
   * Update status display on the home screen (Index.html).
   */
  function updateOverallStatus(){
    const yamato = countCityStatus('大和市');
    const ebina  = countCityStatus('海老名市');
    const chofu  = countCityStatus('調布市');

    updateCardStatus('yamato', yamato);
    updateCardStatus('ebina', ebina);
    updateCardStatus('chofu', chofu);

    const all = {
      done: yamato.done + ebina.done + chofu.done,
      stop: yamato.stop + ebina.stop + chofu.stop,
      skip: yamato.skip + ebina.skip + chofu.skip,
      total: yamato.total + ebina.total + chofu.total,
    };
    all.rem = all.total - all.done - all.stop - all.skip;

    updateCardStatus('all', all);

    const overallHint = document.getElementById('overallHint');
    if(all.total > 0){
      overallHint.textContent = `総件数: ${all.total}件 | 残り: ${all.rem}件`;
      overallHint.className = 'hint';
    } else {
      overallHint.textContent = 'まだ同期されていません';
      overallHint.className = 'empty';
    }
  }

  /**
   * Initialize the home screen.
   */
  function initHome(){
    updateOverallStatus();

    document.getElementById('initSyncBtn').addEventListener('click', initSync);
    document.getElementById('syncBtn').addEventListener('click', regularSync);
    document.getElementById('pushLogBtn').addEventListener('click', pushLog);
  }

  // ===== Regular Sync (Pull/Push) Logic =====

  /**
   * Pull log data from GAS and merge into local storage.
   */
  async function regularSync(e){
    if (e && e.preventDefault) e.preventDefault();
    showProgress(true, 0);
    showStatus('ログ同期中...');
    const startTime = performance.now();

    try {
      // 'pull' action is used for the log pull from InspectionLog
      const res = await fetchGas('pull', { sheet: 'InspectionLog' }); 
      const arr = res.data || res.values || res.rows;
      
      if (!Array.isArray(arr) || arr.length === 0) {
        showStatus('ログシートは空です', false);
        return;
      }
      
      const headerMap = readHeaderMap();
      if (!headerMap) {
          throw new Error('ヘッダー情報が見つかりません。まず「初期同期」を実行してください。');
      }
      
      const logRecords = {}; // ui_index -> log record
      let updatedCount = 0;

      for (const r of arr) {
          // rはオブジェクト（GAS側で変換済み）
          // ログシートは status_en, city, ui_index などのキーを持つ
          const logCity = (r.city || '').trim();
          const logIndex = (r.ui_index || '').trim();
          const logStatus = (r.status_en || '').trim(); // Checked, stopped, 7days_rule, Unnecessary
          const logDate = (r.last_inspected_at || ''); // YYYY/MM/DD-HH:MM

          if (logIndex) {
              logRecords[logCity + logIndex] = {
                  status_en: logStatus,
                  last_inspected_at: logDate,
              };
          }
      }
      
      // ローカルデータを更新
      CITIES.forEach(city => {
          const localArr = readCity(city);
          let changed = false;
          
          const newArr = localArr.map(rec => {
              const key = rec.city + rec.ui_index;
              const log = logRecords[key];
              
              if (log) {
                  // GASログの状態を日本語に変換
                  let newStatus;
                  if (log.status_en === 'Checked') newStatus = 'done';
                  else if (log.status_en === 'stopped') newStatus = 'stop';
                  else if (log.status_en === 'Unnecessary') newStatus = 'skip';
                  else if (log.status_en === '7days_rule') newStatus = 'normal';
                  else newStatus = rec.status; // 変換できなかった場合は現状維持
                  
                  if (rec.status !== newStatus || rec.last_inspected_at !== log.last_inspected_at) {
                      updatedCount++;
                      changed = true;
                      return { 
                          ...rec, 
                          status: newStatus,
                          last_inspected_at: log.last_inspected_at,
                          checked: newStatus === 'done' || newStatus === 'stop' || newStatus === 'skip', // log pullで更新されたものはチェック済みに
                      };
                  }
              }
              return rec;
          });
          
          if (changed) {
              writeCity(city, newArr);
          }
      });

      const endTime = performance.now();
      showStatus(`ログ同期が完了しました (${updatedCount}件更新 / ${((endTime - startTime) / 1000).toFixed(2)}秒)`, false);
      updateOverallStatus();

    } catch (error) {
      const msg = error.message || '不明なエラーが発生しました。';
      showStatus(`ログ同期失敗: ${msg}`, true);
      console.error('Regular Sync Failed:', error);
    } finally {
      showProgress(false);
    }
  }

  /**
   * Push local changes to GAS.
   */
  async function pushLog(e){
    if (e && e.preventDefault) e.preventDefault();
    showProgress(true, 0);
    showStatus('データ送信中...');
    const startTime = performance.now();
    
    try {
      // 全都市から「チェック済み」のレコードを集める
      const recordsToPush = [];
      CITIES.forEach(city => {
        const arr = readCity(city);
        arr.forEach(rec => {
          // checkedがtrueか、statusが'stop'/'skip'のものを対象とする
          if (rec.checked || rec.status === 'stop' || rec.status === 'skip') {
            recordsToPush.push(rec);
          }
        });
      });
      
      if (recordsToPush.length === 0) {
        showStatus('送信する更新データがありません', false);
        showProgress(false);
        return;
      }

      // 'push' action for log push
      const res = await fetchGas('push', {}, 'POST', recordsToPush); 
      
      const endTime = performance.now();
      showStatus(`データ送信が完了しました (${recordsToPush.length}件 / ${((endTime - startTime) / 1000).toFixed(2)}秒)`, false);

    } catch (error) {
      const msg = error.message || '不明なエラーが発生しました。';
      showStatus(`データ送信失敗: ${msg}`, true);
      console.error('Push Log Failed:', error);
    } finally {
      showProgress(false);
    }
  }

  // ===== City Page Logic (yamato.html, ebina.html, chofu.html) =====

  const STATUS_LABELS = {
    'normal': '巡回対象',
    '7days_rule': '7日ルール', // 期限が近い
    'done': '済',
    'stop': '停止',
    'skip': '不要',
  };
  
  const STATUS_CLASSES = {
    'normal': 'bg-blue',
    '7days_rule': 'bg-yellow',
    'done': 'bg-green',
    'stop': 'bg-pink',
    'skip': 'bg-gray',
  };
  
  /**
   * Get the CSS class for the row background.
   * @param {Object} rec Record object.
   * @returns {string} CSS class name.
   */
  function rowBg(rec){
    return STATUS_CLASSES[rec.status] || 'bg-gray';
  }

  /**
   * Render the list for a specific city.
   * @param {string} city City name.
   * @param {Array<Object>} arr List of records.
   */
  function renderCityList(city, arr){
    const list = document.getElementById('list');
    const hint = document.getElementById('hint');
    list.innerHTML = ''; // リストをクリア
    
    if(arr.length === 0){
      hint.textContent = 'データがありません。ホーム画面で「初期同期」を実行してください。';
      return;
    }
    
    // hintは非表示
    hint.style.display = 'none';

    // UI Indexでソート
    arr.sort((a, b) => {
        if (!a.ui_index || !b.ui_index) return 0;
        const indexA = parseInt(a.ui_index.substring(1), 10);
        const indexB = parseInt(b.ui_index.substring(1), 10);
        return indexA - indexB;
    });

    for(const rec of arr){
      const row = document.createElement('div');
      row.className = `row ${rowBg(rec)}`;
      
      // Left Column: Index and Checkbox
      const left = document.createElement('div');
      left.className = 'leftcol';
      const index = document.createElement('span');
      index.className = 'index';
      index.textContent = rec.ui_index;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `chk-${rec.ui_index}`;
      checkbox.checked = rec.checked;
      checkbox.addEventListener('change', (e) => {
          rec.checked = e.target.checked;
          // チェックを外したらstatusはnormalに戻す（done/stop/skipだった場合のみ）
          if (!rec.checked && (rec.status === 'done' || rec.status === 'stop' || rec.status === 'skip')) {
              rec.status = 'normal';
              row.className = `row ${rowBg(rec)}`;
          }
          // チェックをつけたらstatusをdoneにする（normal/7days_ruleだった場合のみ）
          if (rec.checked && (rec.status === 'normal' || rec.status === '7days_rule')) {
              rec.status = 'done';
              // 最終点検日を現在日時に更新
              rec.last_inspected_at = new Date().toISOString().substring(0, 19).replace('T', '-');
              row.className = `row ${rowBg(rec)}`;
          }
          persistCityRec(city, rec);
      });
      
      left.appendChild(checkbox);
      left.appendChild(index);
      
      // Middle Column: Details
      const mid = document.createElement('div');
      mid.className = 'midcol';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = rec.station;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = `${rec.model} | ${rec.number}`;
      
      mid.appendChild(title);
      mid.appendChild(sub);

      // Right Column: Status Selector and Button
      const right = document.createElement('div');
      right.className = 'rightcol';
      
      const sel = document.createElement('select');
      sel.className = 'state';
      // ステータス選択肢の生成
      Object.entries(STATUS_LABELS).forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if(rec.status === v) o.selected = true;
        sel.appendChild(o);
      });
      // statusが変わったときの処理
      sel.addEventListener('change', () => {
        rec.status = sel.value;
        // statusが 'done', 'stop', 'skip' になったらチェックを入れる
        rec.checked = (rec.status === 'done' || rec.status === 'stop' || rec.status === 'skip');
        // 'done' になった場合は最終点検日を更新
        if (rec.status === 'done') {
            rec.last_inspected_at = new Date().toISOString().substring(0, 19).replace('T', '-');
        } else {
            // done以外の場合は、last_inspected_atの情報を残したまま、
            // checkedをfalseに戻す処理は、チェックボックスのchangeイベントに任せる
        }
        
        // チェックボックスの状態を同期
        checkbox.checked = rec.checked; 

        persistCityRec(city, rec);
        row.className = `row ${rowBg(rec)}`; // 背景色を更新
      });
      
      const btn = document.createElement('button');
      btn.className = 'btn tiny';
      btn.textContent = '点検';
      btn.addEventListener('click', () => {
        // 外部アプリへの遷移
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
    }
    
    // 画面下部に集計情報を表示 (City.html)
    const status = countCityStatus(city);
    const footer = document.createElement('div');
    footer.className = 'footer-status';
    footer.textContent = `総件数: ${status.total}件 | 済: ${status.done}件 | 停止: ${status.stop}件 | 不要: ${status.skip}件 | 残り: ${status.rem}件`;
    list.appendChild(footer);
  }
  
  /**
   * Initialize a city-specific page.
   * @param {string} city City name.
   */
  function initCity(city){
    const arr = readCity(city);
    renderCityList(city, arr);
  }


  // 公開API
  return {
    initHome,
    initCity,
    initSync, // for manual call if needed
    // GAS_URL: GAS_URL, // debug
  };
})();

