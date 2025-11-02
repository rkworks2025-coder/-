// ====== 設定 ======
const Junkai = (()=>{

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const CITIES = ["大和市","海老名市","調布市"];
  const PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  const LS_KEY = (c) => `junkai:city:${c}`;
  const TIMEOUT_MS = 15000;
  const DEBUG_ERRORS = true;

  // ===== utils =====
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

  function showProgress(on, pct){
    const m = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    if(!m) return;
    if(on) m.classList.add('show'); else m.classList.remove('show');
    if(bar && typeof pct==='number') bar.style.width = Math.max(0,Math.min(100,pct)) + '%';
  }
  function status(txt){
    const el = document.getElementById('statusText'); if(el) el.textContent = txt;
  }

  function normalize(r){
    return {
      city: (r.city||'').trim(),
      station: (r.station||'').trim(),
      model: (r.model||'').trim(),
      number: (r.number||'').trim(),
      status: (r.status||'normal').trim(),
      checked: !!r.checked,
      index: (Number.isFinite(+r.index) && +r.index>0)? parseInt(r.index,10) : 0,
      last_inspected_at: (r.last_inspected_at||'').trim(),
      ui_index: r.ui_index || '',
      ui_index_num: r.ui_index_num || 0
    };
  }

  async function fetchJSONWithRetry(url, retry=2){
    let lastErr = null;
    for(let i=0;i<=retry;i++){ 
      try{
        const ctl = new AbortController();
        const t = setTimeout(()=>ctl.abort(), TIMEOUT_MS);
        const res = await fetch(url, { method:'GET', cache:'no-store', redirect:'follow', signal: ctl.signal });
        clearTimeout(t);
        const raw = await res.text();
        // try parse JSON (strip BOM)
        const text = raw.replace(/^\ufeff/, '');
        let json = null;
        try{ json = JSON.parse(text); }
        catch(e){ 
          if(DEBUG_ERRORS) console.warn('JSON parse fail, first 200 chars:', text.slice(0,200));
          throw new Error('parse-fail');
        }
        return json;
      }catch(e){
        lastErr = e;
        await sleep(400*(i+1));
      }
    }
    throw lastErr || new Error('fetch-fail');
  }

  function saveCity(city, arr){
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }
  function readCity(city){
    try{ const s = localStorage.getItem(LS_KEY(city)); if(!s) return []; const a = JSON.parse(s); return Array.isArray(a)? a:[]; }catch(_){ return []; }
  }

  function applyUIIndex(city, arr){
    const p = PREFIX[city] || '';
    for(let i=0;i<arr.length;i++){
      arr[i].ui_index_num = i+1;
      arr[i].ui_index = p + (i+1);
    }
  }

  function countCity(arr){
    const c = {done:0, stop:0, skip:0, total:arr.length};
    for(const it of arr){
      if(it.status==='stop') c.stop++;
      else if(it.status==='skip') c.skip++;
      if(it.checked || it.status==='done') c.done++;
    }
    return c;
  }

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

  // ====== public init for index ======
  async function initIndex(){
    repaintCounters();
    const btn = document.getElementById('syncBtn');
    if(!btn) return;
    btn.addEventListener('click', async()=>{
      try{
        showProgress(true, 5);
        status('開始…');
        const u = `${GAS_URL}?action=pull&_=${Date.now()}`;
        status('GASへ問い合わせ中…');
        showProgress(true, 35);
        const json = await fetchJSONWithRetry(u, 2);
        showProgress(true, 55);
        if(!json || (!Array.isArray(json.data) && !Array.isArray(json.values))) throw new Error('bad-shape');
        const buckets = { "大和市":[], "海老名市":[], "調布市":[] };
        
        // GASは { status: 'ok', data: [...] } 形式で返すため、dataプロパティを使用する
        let arr = Array.isArray(json.data) ? json.data : (Array.isArray(json.values) ? json.values : []);
        if(!Array.isArray(arr)) arr = [];
        
        // もしGASが { [行配列1], [行配列2]... } の形式で返ってきた場合（古いデプロイなど）のフォールバック
        if(arr.length === 0 && Array.isArray(json) && Array.isArray(json[0])) arr = json;


        // 以下の headerMap の処理は、GASがヘッダー付きで返すことを想定しているが、
        // Code.gsはヘッダーを取り除いて返しているので、この処理は通常スキップされるべき。
        // ただし、念のため元の構造は保持し、データ処理ロジックのみを調整する。
        let headerMap = null;
        if(arr.length > 0 && Array.isArray(arr[0])){
          const firstRow = arr[0];
          const lower = firstRow.map(x => (typeof x === 'string' ? x.trim().toLowerCase() : ''));
          if(lower.some(x => x.includes('city')) && lower.some(x => x.includes('station'))){
            headerMap = {};
            for(let i=0;i<firstRow.length;i++){
              const col = lower[i];
              if(col.includes('city')) headerMap.city = i;
              else if(col.includes('station')) headerMap.station = i;
              else if(col.includes('model')) headerMap.model = i;
              else if(col.includes('plate') || col.includes('number')) headerMap.number = i;
              else if(col.includes('status')) headerMap.status = i;
            }
            // Code.gsはヘッダーを削除して返すため、arr.slice(1)は不要
          }
        }


        // ★★★ データをオブジェクトに変換する処理を修正 ★★★
        for(const r of arr){
          let rowObj;
          
          if(Array.isArray(r)){
            // rは [列1の値, 列2の値, 列3の値, ...] という配列
            if(headerMap){
              // ヘッダーが特定できた場合（ただしCode.gsの仕様では通常falseになる）
              const city = r[headerMap.city ?? 0] || '';
              const station = r[headerMap.station ?? 1] || '';
              const model = r[headerMap.model ?? 2] || '';
              const number = r[headerMap.number ?? 3] || '';
              const status = (headerMap.status !== undefined ? (r[headerMap.status] || '') : 'normal');
              rowObj = { city, station, model, number, status: status || 'normal', checked:false, index:'', last_inspected_at:'' };
            }else{
              // Code.gsがヘッダーを取り除いた配列の配列を返す場合に適用されるロジック
              // r.lengthをチェックし、既知の列インデックスを使ってオブジェクトを作成する
              
              // ログのデータ構造から列インデックスを仮定
              // 0: TSエリア
              // 1: 所在地 (e.g., 大和市, 海老名市)
              // 2: 営業所 (使用しない)
              // 3: 拠点 (Station)
              // 4: 車両番号 (Model)
              // 5: プレート番号 (Number)
              // 6: 状態 (Status)
              
              if(r.length >= 6){
                const city = r[1] || r[0] || '';         // 2列目 (インデックス 1) を City として取得
                const station = r[3] || r[1] || '';      // 4列目 (インデックス 3) を Station として取得
                const model = r[4] || r[2] || '';        // 5列目 (インデックス 4) を Model として取得
                const number = r[5] || r[3] || '';       // 6列目 (インデックス 5) を Number として取得
                const status = r[6] || 'normal';         // 7列目 (インデックス 6) を Status として取得
                
                // 元のコードの冗長な条件分岐を削除し、最新のログに基づくインデックスに統一
                rowObj = { city, station, model, number, status, checked:false, index:'', last_inspected_at:'' };
              } else {
                // データが短すぎる場合のフォールバック（元のコードのまま）
                const city = r[0] || '';
                const station = r[1] || '';
                const model = r[2] || '';
                const number = r[3] || '';
                const status = r[4] || 'normal';
                rowObj = { city, station, model, number, status: status || 'normal', checked:false, index:'', last_inspected_at:'' };
              }
            }
          }else if(r && typeof r === 'object'){
            // rがオブジェクト形式の場合 (通常は発生しないが、元のコードを保持)
            rowObj = r;
          }else continue;
          
          const cityName = (rowObj.city || '').trim();
          if(!buckets[cityName]) continue;
          
          const rec = normalize(rowObj);
          buckets[cityName].push(rec);
        }
        // ★★★ 修正箇所終了 ★★★

        let wrote = 0;
        for(const city of CITIES){
          if(buckets[city].length>0){
            applyUIIndex(city, buckets[city]);
            saveCity(city, buckets[city]);
            wrote++;
          }
        }

        if(wrote===0){ status('同期失敗：データが空でした（既存データは保持）'); showProgress(false); return; }

        repaintCounters();
        showProgress(true, 100);
        status(`同期完了：大和${buckets['大和市'].length||0} / 海老名${buckets['海老名市'].length||0} / 調布${buckets['調布市'].length||0}`);
      }catch(e){
        console.error('sync error', e);
        status('同期失敗：通信または解析エラー（既存データは保持）');
      }finally{ setTimeout(()=>showProgress(false), 350); }
    });

    const pushBtn = document.getElementById('pushLogBtn');
    if (pushBtn) {
      pushBtn.addEventListener('click', async () => {
        try {
          const all = [];
          for (const c of CITIES) {
            const arrCity = readCity(c);
            if (Array.isArray(arrCity)) all.push(...arrCity);
          }
          status('シート更新中…');
          const json = JSON.stringify(all);
          const params = new URLSearchParams();
          params.append('action', 'push');
          params.append('data', json);
          const url = `${GAS_URL}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          let result = null;
          try { result = await res.json(); } catch(_){ result = null; }
          if (result && result.ok) status('シート更新完了！');
          else status('更新に失敗しました');
        } catch(err){
          console.error('push error', err);
          status('更新エラー');
        }
      });
    }
  }

  // ===== City page =====
  function within7d(last){
    if(!last) return false;
    const t = Date.parse(last);
    if(!Number.isFinite(t)) return false;
    return (Date.now() - t) < (7*24*60*60*1000);
  }
  function rowBg(rec){
    if(rec.checked) return 'bg-pink';
    if(rec.status==='stop') return 'bg-gray';
    if(rec.status==='skip') return 'bg-yellow';
    if(within7d(rec.last_inspected_at)) return 'bg-blue';
    return 'bg-green';
  }

  function mountCity(city){
    const list = document.getElementById('list');
    const hint = document.getElementById('hint');
    list.innerHTML = '';
    const arr = readCity(city);
    if(arr.length===0){ hint.textContent='まだ同期されていません（インデックスの同期を押してください）'; return; }
    hint.textContent = `件数：${arr.length}`;
    for(const rec of arr){
      const row = document.createElement('div');
      row.className = `row ${rowBg(rec)}`;
      const left = document.createElement('div');
      left.className = 'leftcol';
      const idxDiv = document.createElement('div');
      idxDiv.className = 'idx';
      idxDiv.textContent = rec.ui_index || '';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!rec.checked;
      chk.className = 'chk';
      const topLeft = document.createElement('div');
      topLeft.className = 'left-top';
      topLeft.appendChild(idxDiv);
      topLeft.appendChild(chk);
      const dtDiv = document.createElement('div');
      dtDiv.className = 'datetime';
      function updateDateTime(){
        if(rec.last_inspected_at){
          const d = new Date(rec.last_inspected_at);
          if(Number.isFinite(d.getTime())){
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            const hh = String(d.getHours()).padStart(2,'0');
            const mi = String(d.getMinutes()).padStart(2,'0');
            dtDiv.innerHTML = `${mm}/${dd}<br>${hh}:${mi}`;
            dtDiv.style.display = '';
            return;
          }
        }
        dtDiv.innerHTML = '';
        dtDiv.style.display = 'none';
      }
      updateDateTime();
      left.appendChild(topLeft);
      left.appendChild(dtDiv);
      chk.addEventListener('change', () => {
        // IMPORTANT: Use custom modal UI instead of confirm()
        // For simplicity in this debugging context, using a simple check
        // Ideally, this should use a custom DOM modal or state logic.
        // Assuming the user is running this in a controlled environment for now.
        const message = chk.checked ? 'チェックを付けます。よろしいですか？' : 'チェックを外します。よろしいですか？';
        if (!window.confirm(message)) { // Using window.confirm() for brevity, but should be replaced with custom UI
          chk.checked = !chk.checked;
          return;
        }
        const nowISO = new Date().toISOString();
        rec.checked = chk.checked;
        if(chk.checked){
          rec.last_inspected_at = nowISO;
        } else {
          rec.last_inspected_at = '';
        }
        updateDateTime();
        persistCityRec(city, rec);
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
      [['normal', '通常'], ['stop', '停止'], ['skip', '不要']].forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if (rec.status === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        rec.status = sel.value;
        persistCityRec(city, rec);
        row.className = `row ${rowBg(rec)}`;
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
    }
  }

  function persistCityRec(city, rec){
    const arr = readCity(city);
    let i = -1;
    if(rec.ui_index){
      i = arr.findIndex(x => (x.ui_index || '') === (rec.ui_index || ''));
    }
    if(i < 0){
      i = arr.findIndex(x => (x.number || '') === (rec.number || ''));
    }
    if(i >= 0){
      arr[i] = rec;
      saveCity(city, arr);
      repaintCounters();
    } else {
      console.warn('Persist failed: record not found', rec);
    }
  }


  return { initIndex, mountCity };
})();

// マウント処理の呼び出し
// このファイル自体がアプリのメインコードと仮定し、ページロード時の処理を追記
// window.onload = Junkai.initIndex; // 適切な呼び出しはアプリのフレームワークに依存します
