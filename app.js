// ====== 設定 ======
const Junkai = (()=>{

  // ★ v8x：通信部のみ最新に差し替え
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
   * @param {boolean} show
   * @param {number} pct (0-100)
   */
  function showProgress(show, pct){
    const modal = document.getElementById('progressModal');
    if(!modal) return;
    if(show){
      modal.classList.add('show');
      if(typeof pct === 'number'){
        const bar = document.getElementById('progressBar');
        if(bar) bar.style.width = `${Math.max(0,Math.min(100, pct))}%`;
      }
    } else {
      modal.classList.remove('show');
      const bar = document.getElementById('progressBar');
      if(bar) bar.style.width = '0%';
    }
  }

  function status(s){
    const el = document.getElementById('statusText') || document.getElementById('statusTextModal');
    if(el) el.textContent = s;
    const el2 = document.getElementById('statusTextModal');
    if(el2 && el2 !== el) el2.textContent = s;
  }

  async function fetchJSONWithRetry(url, retries=1){
    for(let i=0;i<=retries;i++){
      try{
        const ctrl = new AbortController();
        const to = setTimeout(()=>ctrl.abort('timeout'), TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal, cache:'no-store' });
        clearTimeout(to);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data;
      } catch(err){
        if(i>=retries) throw err;
        await sleep(300);
      }
    }
  }

  function saveCity(city, arr){
    if(!Array.isArray(arr)) arr = [];
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }
  function readCity(city){
    try{
      const s = localStorage.getItem(LS_KEY(city));
      return s ? JSON.parse(s) : [];
    }catch(_){ return []; }
  }

  function repaintCounters(){
    const counts = { done:0, stop:0, skip:0, total:0, rem:0 };
    function add(city, prefix){
      const arr = readCity(city);
      // total = all recs
      const total = Array.isArray(arr)? arr.length : 0;
      // done/stop/skip computed from status flags when available
      let done = 0, stop = 0, skip = 0;
      if(Array.isArray(arr)){
        for(const r of arr){
          if(r && r.status === '済') done++;
          else if(r && r.status === '停') stop++;
          else if(r && r.status === '不要') skip++;
        }
      }
      const rem = Math.max(0, total - (done+stop+skip));
      const ids = {
        done: `${prefix}-done`, stop: `${prefix}-stop`, skip: `${prefix}-skip`,
        total: `${prefix}-total`, rem: `${prefix}-rem`,
      };
      for(const k of Object.keys(ids)){
        const el = document.getElementById(ids[k]);
        if(el) el.textContent = (k==='total'? total : (k==='rem'? rem : (k==='done'? done : (k==='stop'? stop : skip))));
      }
      counts.done += done; counts.stop += stop; counts.skip += skip; counts.total += total; counts.rem += rem;
    }
    add("大和市", "yamato");
    add("海老名市", "ebina");
    add("調布市", "chofu");
    // overall
    const id2 = { done:'all-done', stop:'all-stop', skip:'all-skip', total:'all-total', rem:'all-rem' };
    for(const k of Object.keys(id2)){
      const el = document.getElementById(id2[k]);
      if(el) el.textContent = counts[k];
    }
    const hint = document.getElementById('overallHint');
    if(hint) hint.textContent = counts.total>0 ? `総件数：${counts.total}` : 'まだ同期されていません';
  }

  /**
   * Pull records from the specified sheet (全体管理 or InspectionLog) and save them into local storage.
   * Displays progress and status messages throughout the operation.
   * @param {string} sheet Sheet name to pull from.
   * @param {string} actionLabel Label used in status messages (e.g. '初期同期' or '同期').
   */
  async function pullAndSave(sheet, actionLabel){
    // Start progress
    status(`${actionLabel}開始…`);
    showProgress(true, 5);
    try{
      // Build URL with sheet parameter and cache-busting timestamp
      const url = `${GAS_URL}?action=pull&sheet=${encodeURIComponent(sheet)}&_=${Date.now()}`;
      // Fetch JSON with retry
      status(`${actionLabel}取得中…`);
      showProgress(true, 25);
      const json = await fetchJSONWithRetry(url, 2);
      // Determine data array
      let arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.values) ? json.values : []);
      if(!Array.isArray(arr)) arr = [];
      if(arr.length === 0 && Array.isArray(json) && Array.isArray(json[0])) arr = json;

      // Skip header row for InspectionLog if present
      if(sheet === 'InspectionLog' && arr.length > 0 && Array.isArray(arr[0])){
        const firstRow = arr[0].map(x => typeof x === 'string' ? x.toLowerCase() : '');
        if(firstRow.includes('city') && firstRow.includes('station')) arr = arr.slice(1);
      }

      // Helper to convert yyyy/MM/dd or yyyy/MM/dd-HH:mm to ISO string
      function toISOChecked(s){
        if(!s) return '';
        const str = String(s).trim();
        const parts = str.split('-');
        let datePart='', timePart='';
        if(parts.length >= 2){
          datePart = parts[0]
          timePart = parts[1].split(' ')[0];
          const dt = new Date(`${datePart}T${timePart}:00`);
          return Number.isFinite(dt.getTime())? dt.toISOString() : '';
        } else {
          datePart = str.replace(/\//g,'-');
          const dt = new Date(`${datePart}T00:00:00`);
          return Number.isFinite(dt.getTime())? dt.toISOString() : '';
        }
      }

      // Prepare buckets per city
      const buckets = { "大和市":[], "海老名市":[], "調布市":[] };

      // Process rows based on sheet type
      if(sheet === 'InspectionLog'){
        for(const row of arr){
          if(!Array.isArray(row) || row.length < 7) continue;
          const [ city, station, model, plate, status, lastins, lastat ] = row;
          const c = String(city||'').trim();
          if(!(c in buckets)) continue;
          const rec = {
            city: c,
            station: String(station||'').trim(),
            model: String(model||'').trim(),
            plate: String(plate||'').trim(),
            status: String(status||'').trim(), // 済/停/不要/空
            last_inspected: String(lastins||'').trim(),
            last_inspected_at: toISOChecked(lastat||''),
          };
          buckets[c].push(rec);
        }
      } else {
        // 全体管理
        for(const row of arr){
          if(Array.isArray(row)){
            // array mode [station, city, model, plate, ...]
            const station = String(row[0]||'').trim();
            const city = String(row[1]||'').trim();
            const model = String(row[2]||'').trim();
            const plate = String(row[3]||'').trim();
            if(!(city in buckets)) continue;
            buckets[city].push({
              city, station, model, plate,
              status:'', last_inspected:'', last_inspected_at:''
            });
          } else if(row && typeof row === 'object'){
            // object mode { 'ステーション名':..., '市区町村':..., '車種':..., '登録番号':... }
            const station = String(row['ステーション名']||'').trim();
            const city = String(row['市区町村']||'').trim();
            const model = String(row['車種']||'').trim();
            const plate = String(row['登録番号']||'').trim();
            if(!(city in buckets)) continue;
            buckets[city].push({
              city, station, model, plate,
              status:'', last_inspected:'', last_inspected_at:''
            });
          }
        }
      }

      // Save per city
      for(const c of CITIES){
        saveCity(c, buckets[c]);
      }

      // Done
      repaintCounters();
      status(`${actionLabel}完了`);
      showProgress(true, 95);
    } catch(err){
      console.error('pull error', err);
      status(`${actionLabel}エラー`);
    } finally {
      setTimeout(()=>showProgress(false), 350);
    }
  }

  // ===== Index page =====
  function initIndex(){
    repaintCounters();

    // 初期同期：ストレージリセット → 全体管理からpull
    const initBtn = document.getElementById('initSyncBtn');
    if(initBtn){
      initBtn.addEventListener('click', async ()=>{
        status('リセット中…');
        showProgress(true, 10);
        for(const c of CITIES){
          localStorage.removeItem(LS_KEY(c));
        }
        repaintCounters();
        // 続いて全体管理からデータを取得して保存
        await pullAndSave('全体管理', '初期同期');
      });
    }

    // 同期：ローカル全件をInspectionLogへPOST → InspectionLogをpull
    const syncBtn = document.getElementById('syncBtn');
    if(syncBtn){
      syncBtn.addEventListener('click', async ()=>{
        // Step 1: push local changes
        await (async () => {
          status('データ送信中…');
          showProgress(true, 15);
          try {
            // Gather all records across cities
            const all = [];
            for(const c of CITIES){
              const arrCity = readCity(c);
              if(Array.isArray(arrCity)) all.push(...arrCity);
            }
            const params = new URLSearchParams();
            params.append('action','push');
            params.append('data', JSON.stringify(all));
            const res = await fetch(GAS_URL, {
              method:'POST',
              headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
              body: params.toString()
            });
            let result = null;
            try { result = await res.json(); } catch(_){ result = null; }
            if(result && result.ok){
              // proceed to pull next
              status('送信成功、同期中…');
              showProgress(true, 35);
            } else {
              status('送信失敗…');
              // continue to pull anyway to refresh statuses
              showProgress(true, 35);
            }
          } catch(err){
            console.error('push error', err);
            status('送信エラー');
            // continue to pull anyway
          } finally {
            // no-op
          }
        })();

        // Step 2: pull updated InspectionLog data
        await pullAndSave('InspectionLog', '同期');
      });
    }

    // 手動データ送信（POSTのみ）
    const pushBtn = document.getElementById('pushLogBtn');
    if(pushBtn){
      pushBtn.addEventListener('click', async ()=>{
        status('データ送信中…');
        showProgress(true, 15);
        try{
          const all = [];
          for(const c of CITIES){
            const arrCity = readCity(c);
            if(Array.isArray(arrCity)) all.push(...arrCity);
          }
          const params = new URLSearchParams();
          params.append('action','push');
          params.append('data', JSON.stringify(all));
          const res = await fetch(GAS_URL, {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          let result = null;
          try{ result = await res.json(); }catch(_){ result = null; }
          if(result && result.ok){
            status('送信成功');
            showProgress(true, 65);
          } else {
            status('送信失敗…');
          }
        }catch(err){
          console.error('push only error', err);
          status('送信エラー');
        }finally{
          setTimeout(()=>showProgress(false), 350);
        }
      });
    }
  }

  // ===== City page =====
  /**
   * Check if a date is within the last 7 days.
   * @param {string} last ISO date string
   */
  function isWithin7Days(last){
    if(!last) return false;
    const d = new Date(last);
    if(!Number.isFinite(d.getTime())) return false;
    const now = new Date();
    const diff = (now - d) / (1000*60*60*24);
    return diff <= 7 + 1e-9;
  }

  /**
   * Mount city page list.
   * @param {string} city
   */
  function mountCity(city){
    const list = document.getElementById('list');
    const hint = document.getElementById('hint');
    const arr = readCity(city);

    if(!Array.isArray(arr) || arr.length === 0){
      if(hint) hint.textContent = '同期後に表示されます。';
      return;
    }
    if(hint) hint.remove();

    // create rows
    for(let i=0;i<arr.length;i++){
      const rec = arr[i];
      const row = document.createElement('div');
      row.className = 'row';

      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = String(i+1);

      const left = document.createElement('div');
      left.className = 'leftcol';

      const leftTop = document.createElement('div');
      leftTop.className = 'left-top';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = rec.status === '済';
      chk.addEventListener('change', ()=>{
        rec.status = chk.checked ? '済' : '';
        if(chk.checked){
          const now = new Date();
          const yyyy = String(now.getFullYear());
          const mm = String(now.getMonth()+1).padStart(2,'0');
          const dd = String(now.getDate()).padStart(2,'0');
          rec.last_inspected = `${yyyy}/${mm}/${dd}`;
          rec.last_inspected_at = now.toISOString();
        }
        persistCityRec(city, rec);
      });
      leftTop.appendChild(idx);
      leftTop.appendChild(chk);

      const mid = document.createElement('div');
      mid.className = 'mid';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = rec.station || '';
      const model = document.createElement('div');
      model.className = 'model';
      model.textContent = `${rec.model||''}｜${rec.plate||''}`;
      mid.appendChild(title);
      mid.appendChild(model);

      const right = document.createElement('div');
      right.className = 'rightcol';
      const btns = document.createElement('div');
      btns.className = 'btns';

      // タイヤアプリ起動
      const tireBtn = document.createElement('a');
      tireBtn.className = 'btn';
      tireBtn.href = `${TIRE_APP_URL}?city=${encodeURIComponent(rec.city||'')}&station=${encodeURIComponent(rec.station||'')}&plate=${encodeURIComponent(rec.plate||'')}`;
      tireBtn.target = '_blank';
      tireBtn.rel = 'noopener';
      tireBtn.textContent = 'タイヤ';
      btns.appendChild(tireBtn);

      // 7日ルール表示
      const statusLine = document.createElement('div');
      statusLine.className = 'statusline';

      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = rec.status ? `状態：${rec.status}` : '状態：未';
      statusLine.appendChild(chip);

      const chip2 = document.createElement('span');
      chip2.className = 'chip';
      chip2.textContent = isWithin7Days(rec.last_inspected_at) ? '7日内' : '7日超';
      statusLine.appendChild(chip2);

      const dtDiv = document.createElement('div');
      dtDiv.className = 'datetime';
      right.appendChild(btns);
      right.appendChild(statusLine);
      right.appendChild(dtDiv);

      row.appendChild(left);
      left.appendChild(leftTop);
      row.appendChild(mid);
      row.appendChild(right);

      list.appendChild(row);

      function updateDateTime(){
        if(rec.last_inspected_at){
          const d = new Date(rec.last_inspected_at);
          if(Number.isFinite(d.getTime())){
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            dtDiv.innerHTML = `${yyyy}<br>${mm}/${dd}`;
            dtDiv.style.display = '';
            return;
          }
        }
        dtDiv.innerHTML = '';
        dtDiv.style.display = 'none';
      }
      updateDateTime();

      // 手動日付変更（必要時のみ使用）
      dtDiv.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'date';
        if(rec.last_inspected_at){
          const d0 = new Date(rec.last_inspected_at);
          if(Number.isFinite(d0.getTime())){
            const yyyy = d0.getFullYear();
            const mm = String(d0.getMonth()+1).padStart(2,'0');
            const dd = String(d0.getDate()).padStart(2,'0');
            input.value = `${yyyy}-${mm}-${dd}`;
          }
        }
        input.addEventListener('change', ()=>{
          const v = input.value;
          if(v){
            rec.last_inspected = v.replace(/-/g,'/');
            rec.last_inspected_at = new Date(`${v}T00:00:00`).toISOString();
            persistCityRec(city, rec);
            updateDateTime();
          }
        });
        input.click();
      });
    }
  }

  function persistCityRec(city, rec){
    const arr = readCity(city);
    const i = Array.isArray(arr) ? arr.findIndex(x => x && x.plate === rec.plate) : -1;
    if(i >= 0){
      arr[i] = rec;
    } else {
      arr.push(rec);
    }
    saveCity(city, arr);
  }

  // Expose public API
  return {
    initIndex,
    initCity: mountCity,
  };
})();
