// 巡回アプリ app.js
// version: s9a (エリア汎用化対応 ＋ TMAモーダル対応 ＋ 前回点検日時表示 MM/DD 化)

var Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/Tire_Check/";
  const WORK_APP_URL = "https://rkworks2025-coder.github.io/work/";
  const LS_CONFIG_KEY = "junkai:config";
  const TIMEOUT_MS = 15000;

  let appConfig = []; 

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const LS_KEY = (c) => `junkai:city:${c}`; 
  const LS_FILTER_KEY = (c) => `junkai:filter:${c}`;

  // JSTでの日付文字列(YYYY-MM-DD)を取得する
  function getTodayJST() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  }

  function showProgress(on, pct) {
    const m = document.getElementById("progressModal");
    const bar = document.getElementById("progressBar");
    if (!m) return;
    if (on) m.classList.add("show");
    else m.classList.remove("show");
    if (bar && typeof pct === "number") {
      const v = Math.max(0, Math.min(100, pct));
      bar.style.width = v + "%";
      bar.setAttribute("aria-valuenow", v);
    }
  }

  function statusText(msg) {
    const el = document.getElementById("statusText");
    if (el) el.textContent = msg;
  }

  async function fetchJSONWithRetry(url, retry = 2) {
    let lastErr = null;
    for (let i = 0; i <= retry; i++) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          redirect: "follow",
          signal: ctl.signal
        });
        clearTimeout(t);
        const raw = await res.text();
        const text = raw.replace(/^\ufeff/, ""); 
        return JSON.parse(text);
      } catch (e) {
        lastErr = e;
        await sleep(400 * (i + 1));
      }
    }
    throw lastErr || new Error("fetch-fail");
  }

  // ===== 戻り時の自動アクション (Bfcache対応) =====
  function handleReturnActions() {
    setTimeout(() => {
      try {
        // 1. 作業管理アプリからの戻り -> 自動チェック
        const compPlate = localStorage.getItem("junkai:completed_plate");
        if (compPlate) {
          localStorage.removeItem("junkai:completed_plate"); 
          const targetChk = document.querySelector(`input.chk[data-plate="${compPlate}"]`);
          if (targetChk && !targetChk.checked) {
            targetChk.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => targetChk.click(), 400); 
          }
        }

        // 2. タイヤ点検アプリからの戻り -> 作業モード判定によるTMA自動発火
        const tireCompPlate = localStorage.getItem("junkai:tire_completed_plate");
        if (tireCompPlate) {
          localStorage.removeItem("junkai:tire_completed_plate");
          
          // 作業モードを確認（連続モードなら自動発火しない）
          const workMode = localStorage.getItem("junkai:work_mode") || "single";
          if (workMode !== "continuous") {
            const targetChk = document.querySelector(`input.chk[data-plate="${tireCompPlate}"]`);
            if (targetChk) {
              const row = targetChk.closest('.row');
              if (row) {
                const tmaBtn = row.querySelector('.tma-btn');
                if (tmaBtn && !tmaBtn.disabled) {
                  tmaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => tmaBtn.click(), 400);
                }
              }
            }
          }
        }
      } catch(e) {}
    }, 300);
  }

  // スマホブラウザ等で「戻る」によりキャッシュから復元された時の強力なセンサー
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      handleReturnActions();
    }
  });

  // ===== 設定処理 =====
  function loadLocalConfig() {
    const cached = localStorage.getItem(LS_CONFIG_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        appConfig = Array.isArray(parsed) ? parsed : [];
      } catch(e) {
        appConfig = [];
      }
    } else {
      appConfig = [];
    }
  }

  async function fetchRemoteConfig() {
    try {
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=config`);
      if (json && Array.isArray(json.config)) {
        appConfig = json.config;
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(appConfig));
        return true;
      }
    } catch(e) {
      console.warn("Config fetch failed", e);
      throw new Error("設定の取得に失敗しました");
    }
    return false;
  }

  // ===== フィルタ機能 =====
  function getDefaultFilter() {
    return {
      standby: true,      // 未巡回
      stop: true,         // 停止
      skip: false,        // 不要
      "7days_rule": false, // 7days_rule
      checked: false      // チェック済み
    };
  }

  function loadFilter(city) {
    try {
      const saved = localStorage.getItem(LS_FILTER_KEY(city));
      if (saved) {
        return JSON.parse(saved);
      }
    } catch(e) {
      console.warn("Filter load failed", e);
    }
    return getDefaultFilter();
  }

  function saveFilter(city, filter) {
    localStorage.setItem(LS_FILTER_KEY(city), JSON.stringify(filter));
  }

  function getFilterLabel(filter) {
    const labels = [];
    if (filter.standby) labels.push("未");
    if (filter.stop) labels.push("停");
    if (filter.skip) labels.push("不");
    if (filter["7days_rule"]) labels.push("7");
    if (filter.checked) labels.push("済");
    
    if (labels.length === 0) return "なし";
    return labels.join("・");
  }

  function matchesFilter(rec, filter) {
    // チェック済みの判定
    if (rec.checked) {
      return filter.checked === true;
    }
    
    // ステータスによる判定
    const status = rec.status || "";
    if (status === "stop") {
      return filter.stop === true;
    }
    if (status === "skip") {
      return filter.skip === true;
    }
    if (status === "7days_rule") {
      return filter["7days_rule"] === true;
    }
    
    // 通常(standby)
    return filter.standby === true;
  }

  // ===== インデックス画面構築 =====
  function renderIndexButtons() {
    const container = document.getElementById("city-list-container");
    if(!container) return;
    container.innerHTML = "";

    appConfig.forEach(cfg => {
      // ホワイトリスト方式
      const s = (cfg.status || "").trim();
      if (s !== "" && s !== "help") return;

      const slug = cfg.slug;  
      const name = cfg.name;  
      
      const a = document.createElement("a");
      a.className = "cardlink";
      // ★変更: 汎用ページ(area.html)へパラメータを渡す
      a.href = `area.html?city=${slug}`; 
      
      if (s === 'help') {
        a.style.borderColor = "#fb7185"; 
      }

      const h2 = document.createElement("h2");
      h2.textContent = name + (s === 'help' ? " (Help)" : "");

      const meta = document.createElement("div");
      meta.className = "meta";
      
      meta.innerHTML = `
        <span class="chip">済 <span id="${slug}-done">0</span></span>
        <span class="chip">停 <span id="${slug}-stop">0</span></span>
        <span class="chip">不要 <span id="${slug}-skip">0</span></span>
        <span class="chip">総 <span id="${slug}-total">0</span></span>
        <span class="chip">残 <span id="${slug}-rem">0</span></span>
      `;
      a.appendChild(h2);
      a.appendChild(meta);
      container.appendChild(a);
    });
  }

  // ===== ローカル保存 =====
  function saveCity(city, arr) {
    localStorage.setItem(LS_KEY(city), JSON.stringify(arr));
  }

  function readCity(city) {
    try {
      const s = localStorage.getItem(LS_KEY(city));
      if (!s) return [];
      const a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }

  function applyUIIndex(city, arr) {
    const target = appConfig.find(c => c.name === city);
    const p = target ? target.prefix : "?";
    
    for (let i = 0; i < arr.length; i++) {
      arr[i].ui_index_num = i + 1;
      arr[i].ui_index = p + (i + 1);
    }
  }

  function normalizeRow(rowObj) {
    return {
      area:      (rowObj.area     || "").trim(),
      city:      (rowObj.city     || "").trim(),
      address:   (rowObj.address  || "").trim(),
      station:   (rowObj.station  || "").trim(),
      model:     (rowObj.model    || "").trim(),
      plate:     (rowObj.plate    || "").trim(),
      note:      (rowObj.note     || "").trim(),
      operator:  (rowObj.operator || "").trim(),
      status:    (rowObj.status   || "").trim(),
      checked:   !!rowObj.checked,
      last_inspected_at: (rowObj.last_inspected_at || "").trim(),
      index:     Number.isFinite(+rowObj.index) ? parseInt(rowObj.index, 10) : 0,
      ui_index:  rowObj.ui_index || "",
      ui_index_num: rowObj.ui_index_num || 0
    };
  }

  // ===== カウンタ =====
  function countCity(arr) {
    const c = { done: 0, stop: 0, skip: 0, total: arr.length };
    for (const it of arr) {
      if (it.status === "stop") c.stop++;
      else if (it.status === "skip") c.skip++;
      if (it.checked) c.done++;
    }
    return c;
  }

  function repaintCounters() {
    let overallTotal = 0, overallDone = 0, overallStop = 0, overallSkip = 0;
    appConfig.forEach(cfg => {
      const city = cfg.name; 
      const slug = cfg.slug; 

      const arr = readCity(city);
      const cnt = countCity(arr);
      overallTotal += cnt.total;
      overallDone += cnt.done;
      overallStop += cnt.stop;
      overallSkip += cnt.skip;

      if(document.getElementById(`${slug}-done`)) {
        document.getElementById(`${slug}-done`).textContent = cnt.done;
        document.getElementById(`${slug}-stop`).textContent = cnt.stop;
        document.getElementById(`${slug}-skip`).textContent = cnt.skip;
        document.getElementById(`${slug}-total`).textContent = cnt.total;
        document.getElementById(`${slug}-rem`).textContent = (cnt.total - cnt.done - cnt.skip);
      }
    });
    const allDoneEl  = document.querySelector("#all-done");
    const allStopEl  = document.querySelector("#all-stop");
    const allSkipEl  = document.querySelector("#all-skip");
    const allTotalEl = document.querySelector("#all-total");
    const allRemEl   = document.querySelector("#all-rem");

    if (allDoneEl)  allDoneEl.textContent  = overallDone;
    if (allStopEl)  allStopEl.textContent  = overallStop;
    if (allSkipEl)  allSkipEl.textContent  = overallSkip;
    if (allTotalEl) allTotalEl.textContent = overallTotal;
    if (allRemEl)   allRemEl.textContent   = (overallTotal - overallDone - overallSkip);

    const hint = document.getElementById("overallHint");
    if (hint) {
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "同期してください";
    }
  }

  // ===== Pull (ログ取込) 機能 =====
  async function execPullLog() {
    const ok = confirm("【Pull】inspectionlogの内容をアプリに反映しますか？\n(追加・更新・削除・状態変更が反映されます)");
    if (!ok) return;

    try {
      showProgress(true, 10);
      statusText("ログを取得中...");
      
      const url = `${GAS_URL}?action=pullLog&_=${Date.now()}`;
      const json = await fetchJSONWithRetry(url, 2);
      
      showProgress(true, 50);
      
      if (!json || !json.ok || !Array.isArray(json.rows)) {
        throw new Error("ログ取得失敗");
      }

      statusText("データ反映中...");
      const logRows = json.rows;
      let updatedCount = 0;
      let addedCount = 0;
      let deletedCount = 0; 

      for (const cfg of appConfig) {
        let cityData = readCity(cfg.name);
        let isCityModified = false;

        const cityLogs = logRows.filter(r => r.city === cfg.name);
        // 削除処理
        const validPlates = cityLogs.map(r => r.plate);
        const preCount = cityData.length;
        cityData = cityData.filter(localRow => validPlates.includes(localRow.plate));
        const postCount = cityData.length;
        
        if (preCount !== postCount) {
           deletedCount += (preCount - postCount);
           isCityModified = true;
        }

        // 更新・追加処理
        cityLogs.forEach(logRow => {
          const targetRow = cityData.find(r => r.plate === logRow.plate);

          // ステータス判定
          let newChecked = false;
          let newStatus = ""; 
          const s = (logRow.status || "").toLowerCase();

          if (s === "checked" || s === "完了" || s === "済") {
             newChecked = true;
          } else if (s === "stop" || s === "stopped" || s === "停止") {
             newStatus = "stop";
          } else if (s === "skip" || s === "unnecessary" || s === "不要") {
             newStatus = "skip";
          } else if (s === "7days_rule") {
             newStatus = "7days_rule"; 
          }

          let newDate = "";
          if (logRow.date) {
            newDate = logRow.date.slice(0, 10);
          }

          if (targetRow) {
            // ■ 既存更新
            if (targetRow.checked !== newChecked || targetRow.status !== newStatus || targetRow.last_inspected_at !== newDate) {
                targetRow.checked = newChecked;
                targetRow.status = newStatus;
                targetRow.last_inspected_at = newDate;
                isCityModified = true;
                updatedCount++;
            }
          } else {
            // ■ 新規追加
            const newRec = {
              city:    cfg.name,
              station: logRow.station,
              model:   logRow.model,
              plate:   logRow.plate,
              note:    "", 
              operator:"",
              status:  newStatus,
              checked: newChecked,
              last_inspected_at: newDate,
              ui_index: logRow.ui_index || "",
              ui_index_num: 999 
            };
            cityData.push(normalizeRow(newRec));
            isCityModified = true;
            addedCount++;
          }
        });
        if (isCityModified) {
          applyUIIndex(cfg.name, cityData);
          saveCity(cfg.name, cityData);
        }
      }

      repaintCounters();
      showProgress(true, 100);
      statusText(`Pull完了 (更新:${updatedCount}, 追加:${addedCount}, 削除:${deletedCount})`);
      setTimeout(() => showProgress(false), 2000);

    } catch(e) {
      console.error(e);
      statusText("Pull失敗：" + e.message);
      showProgress(false);
    }
  }


  // ===== index.html 用：初期同期 =====
  async function initIndex() {
    loadLocalConfig();
    // ▼ 作業モード切替UIの初期化
    const workModeSelect = document.getElementById("workModeSelect");
    if (workModeSelect) {
      const savedMode = localStorage.getItem("junkai:work_mode") || "single";
      workModeSelect.value = savedMode;
      workModeSelect.addEventListener("change", (e) => {
        localStorage.setItem("junkai:work_mode", e.target.value);
      });
    }

    // 画面構築
    if(document.getElementById("city-list-container")) {
       renderIndexButtons();
       repaintCounters();
    }
    statusText("");
    // 初期同期ボタン
    const btn = document.getElementById("syncBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        const ok = confirm("【注意】初期同期を実行します。\n現在のアプリ内のデータは全てリセットされます。\nよろしいですか?");
        if (!ok) return;

        try {
          showProgress(true, 5);
          statusText("設定ファイル更新中…");

          await fetchRemoteConfig();
          
          appConfig.forEach(cfg => {
             localStorage.removeItem(LS_KEY(cfg.name));
          });

          statusText("車両データ取得中…");
          const url = `${GAS_URL}?action=pull&_=${Date.now()}`;
          showProgress(true, 30);

          const json = await fetchJSONWithRetry(url, 2);
          showProgress(true, 60);

          if (!json || !Array.isArray(json.rows)) throw new Error("bad-shape");

          const buckets = {};
          appConfig.forEach(cfg => buckets[cfg.name] = []);

          for (const r of json.rows) {
            if (!r || typeof r !== "object") continue;
            const norm = normalizeRow(r);
            const cityName = norm.city;
            if (buckets[cityName]) {
              buckets[cityName].push(norm);
            }
          }

          let wrote = 0;
          for (const cfg of appConfig) {
            const arr = buckets[cfg.name];
            if (arr && arr.length > 0) {
              applyUIIndex(cfg.name, arr);
              saveCity(cfg.name, arr);
              wrote++;
            }
          }

          if (wrote === 0) {
            statusText("同期失敗：有効なデータがありませんでした");
            showProgress(false);
            return;
          }

          renderIndexButtons();
          repaintCounters();
          
          showProgress(true, 100);
          statusText("同期完了");
        } catch (e) {
          console.error("sync error", e);
          statusText("同期失敗：" + e.message);
        } finally {
          setTimeout(() => showProgress(false), 400);
        }
      });
    }

    // Pullボタン
    const pullBtn = document.getElementById("pushLogBtn");
    if (pullBtn) {
      pullBtn.textContent = "Pull"; 
      pullBtn.addEventListener("click", execPullLog);
    }
  }

  // ===== city / area ページ =====
  async function syncInspectionAll() {
    const all = [];
    appConfig.forEach(cfg => {
      const arr = readCity(cfg.name);
      for (const rec of arr) all.push(rec);
    });
    try {
      const h=document.getElementById("hint");
      if(h) h.textContent="送信中...";
      const res = await fetch(`${GAS_URL}?action=syncInspection`, {
        method: "POST",
        body: JSON.stringify({ data: all })
      });
      await res.json();
      if(h) {
        h.textContent="送信成功";
        setTimeout(()=>h.textContent=`件数：${all.length}`, 1500);
      }
    } catch (e) {
      const h=document.getElementById("hint");
      if(h) h.textContent="送信失敗";
    }
  }

  function rowBg(rec) {
    if (rec.checked) return "bg-pink";
    if (rec.status === "7days_rule") return "bg-blue";
    if (rec.status === "stop") return "bg-gray";
    if (rec.status === "skip") return "bg-yellow";
    return "bg-green";
  }

  function persistCityRec(city, rec) {
    const arr = readCity(city);
    if (!Array.isArray(arr) || !arr.length) return;
    const idx = arr.findIndex(r => r.ui_index === rec.ui_index);
    if (idx === -1) return;
    arr[idx] = rec;
    saveCity(city, arr);
    repaintCounters();
  }

  async function initCity(cityKey) {
    loadLocalConfig(); 

    let cityName = cityKey;
    let targetCfg = appConfig.find(c => c.name === cityKey);
    if (!targetCfg) {
       targetCfg = appConfig.find(c => c.slug === cityKey);
       if(targetCfg) cityName = targetCfg.name;
    }

    if (!targetCfg) {
      const h = document.getElementById("hint");
      if(h) h.textContent = "設定エラー：Config未ロードまたは無効なエリアです";
      return;
    }

    // ★追加: ページタイトルの動的変更
    const pageTitle = document.getElementById("pageTitle");
    const headerTitle = document.getElementById("headerTitle");
    if (pageTitle) pageTitle.textContent = targetCfg.name;
    if (headerTitle) headerTitle.textContent = targetCfg.name;

    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    if (!list || !hint) return;

    let currentFilter = loadFilter(cityName);
    const filterBtn = document.getElementById("filterBtn");
    const filterModal = document.getElementById("filterModal");
    const filterApply = document.getElementById("filterApply");
    const filterCancel = document.getElementById("filterCancel");

    function updateFilterButton() {
      if (filterBtn) {
        filterBtn.textContent = `フィルタ: ${getFilterLabel(currentFilter)} ▼`;
      }
    }

    function renderList() {
      const arr = readCity(cityName);
      list.innerHTML = "";

      if (arr.length === 0) {
        hint.textContent = "データなし";
        return;
      }

      const filteredArr = arr.filter(rec => matchesFilter(rec, currentFilter));
      hint.textContent = `件数：${filteredArr.length} / ${arr.length}`;
      for (const rec of filteredArr) {
        const row = document.createElement("div");
        row.className = `row ${rowBg(rec)}`;

        // 左カラム
        const left = document.createElement("div");
        left.className = "leftcol";
        const topLeft = document.createElement("div");
        topLeft.className = "left-top";
        const idxDiv = document.createElement("div");
        idxDiv.className = "idx";
        idxDiv.textContent = rec.ui_index || "";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.className = "chk";
        chk.checked = !!rec.checked;
        
        chk.dataset.plate = rec.plate; 
        
        topLeft.appendChild(idxDiv);
        topLeft.appendChild(chk);
        left.appendChild(topLeft);

        // 前回点検日時の表示 (MM/DD形式)
        if (rec.last_inspected_at) {
          const dtDiv = document.createElement("div");
          dtDiv.className = "datetime";
          let dispDate = rec.last_inspected_at;
          // YYYY-MM-DD 形式の場合、MM/DD の部分だけを抽出
          if (dispDate.length >= 10 && dispDate.charAt(4) === '-') {
            dispDate = dispDate.substring(5, 10).replace('-', '/');
          }
          dtDiv.textContent = dispDate;
          left.appendChild(dtDiv);
        }

        // ▼ チェックボックス操作時のダイアログ
        chk.addEventListener("change", () => {
          const msg = `【${rec.plate || "不明"}】\n${chk.checked ? "チェックしますか?" : "外しますか?"}`;
          if (!confirm(msg)) {
            chk.checked = !chk.checked;
            return;
          }
          if (chk.checked) {
            rec.checked = true;
            rec.last_inspected_at = getTodayJST();
          } else {
            rec.checked = false;
            rec.last_inspected_at = "";
          }
          row.className = `row ${rowBg(rec)}`;
  
          persistCityRec(cityName, rec);
          syncInspectionAll();
        
          renderList(); 
        });
        // 中央
        const mid = document.createElement("div");
        mid.className = "mid";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = rec.station || "";
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.innerHTML = `${rec.model || ""}<br>${rec.plate || ""}`;
        mid.appendChild(title);
        mid.appendChild(sub);

        // 右カラム
        const right = document.createElement("div");
        right.className = "rightcol";
        const sel = document.createElement("select");
        sel.className = "state";
        const statusOptions = [["", "通常"], ["stop", "停止"], ["skip", "不要"]];
        for (const [value, label] of statusOptions) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = label;
          if ((rec.status || "") === value) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () => {
          rec.status = sel.value;
          row.className = `row ${rowBg(rec)}`;
          persistCityRec(cityName, rec);
          syncInspectionAll();
          renderList(); 
        });
        const btnGroup = document.createElement("div");
        btnGroup.className = "btn-group";

        const tmaBtn = document.createElement("button");
        tmaBtn.className = "tma-btn";
        tmaBtn.textContent = "TMA";

        // TMAロジック
        tmaBtn.addEventListener("click", () => {
          const tmaModal = document.getElementById('tmaModal');
          const tmaModalTitle = document.getElementById('tmaModalTitle');
          const btnOk = document.getElementById('tmaModalOk');
          const btnCancel = document.getElementById('tmaModalCancel');

          if (!tmaModal || !tmaModalTitle || !btnOk || !btnCancel) {
            if(!confirm(`【${rec.plate}】\nTMA自動入力を実行しますか？`)) return;
            executeTma();
            return;
          }

          tmaModalTitle.textContent = `【${rec.plate}】`;
          tmaModal.classList.add('show');

          btnOk.onclick = () => {
            tmaModal.classList.remove('show');
            executeTma();
          };

          btnCancel.onclick = () => {
            tmaModal.classList.remove('show');
          };
          
          function executeTma() {
            tmaBtn.disabled = true;
            tmaBtn.textContent = "遷移中";
            
            // 整理券番号（requestId）の生成
            const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
            
            // 1. GASへバックグラウンド送信
            fetch(`${GAS_URL}?action=triggerTMA`, {
              method: "POST",
              body: JSON.stringify({ plate: rec.plate, requestId: requestId }),
              keepalive: true
            }).catch(() => {});
            
            // 2. 即座に作業管理アプリへ遷移
            const params = new URLSearchParams({
              station:    rec.station || "",
              model:      rec.model   || "",
              plate_full: rec.plate   || "",
              tma_plate:  rec.plate,
              tma_req_id: requestId
            });
            location.href = `${WORK_APP_URL}?${params.toString()}`;
          }
        });

        const tireBtn = document.createElement("button");
        tireBtn.className = "tire-btn";
        tireBtn.textContent = "点検";
        tireBtn.addEventListener("click", () => {
          const params = new URLSearchParams({
            station:    rec.station || "",
            model:      rec.model   || "",
            plate_full: rec.plate   || ""
          });
          location.href = `${TIRE_APP_URL}?${params.toString()}`;
        });

        btnGroup.appendChild(tmaBtn);
        btnGroup.appendChild(tireBtn);

        right.appendChild(sel);
        right.appendChild(btnGroup);

        row.appendChild(left);
        row.appendChild(mid);
        row.appendChild(right);
        list.appendChild(row);
      }
      
      // リスト描画直後にもアクションをチェック
      handleReturnActions();
    }

    if (filterBtn && filterModal) {
      filterBtn.addEventListener("click", () => {
        document.getElementById("filter_standby").checked = currentFilter.standby;
        document.getElementById("filter_stop").checked = currentFilter.stop;
        document.getElementById("filter_skip").checked = currentFilter.skip;
        document.getElementById("filter_7days").checked = currentFilter["7days_rule"];
        document.getElementById("filter_checked").checked = currentFilter.checked;
        
        filterModal.classList.add("show");
      });
    }

    if (filterApply) {
      filterApply.addEventListener("click", () => {
        currentFilter.standby = document.getElementById("filter_standby").checked;
        currentFilter.stop = document.getElementById("filter_stop").checked;
        currentFilter.skip = document.getElementById("filter_skip").checked;
        currentFilter["7days_rule"] = document.getElementById("filter_7days").checked;
        currentFilter.checked = document.getElementById("filter_checked").checked;
        
        saveFilter(cityName, currentFilter);
        updateFilterButton();
     
        filterModal.classList.remove("show");
        renderList();
      });
    }

    if (filterCancel) {
      filterCancel.addEventListener("click", () => {
        filterModal.classList.remove("show");
      });
    }

    updateFilterButton();
    renderList();
  }

  // ★追加: area.html 用の初期化エントリーポイント
  async function initAreaPage() {
    const params = new URLSearchParams(window.location.search);
    const cityKey = params.get('city');
    if (!cityKey) {
      const hint = document.getElementById("hint");
      if(hint) hint.textContent = "パラメータエラー：対象エリアが指定されていません";
      return;
    }
    await initCity(cityKey);
  }

  return { initIndex, initCity, initAreaPage };

})();
