// 巡回アプリ app.js
// version: s3d_fast (高速化・Pullロジック完全修正)

const Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const LS_CONFIG_KEY = "junkai:config";
  const TIMEOUT_MS = 15000;

  let appConfig = []; 

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const LS_KEY = (c) => `junkai:city:${c}`; 

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

  // ===== 設定ロード処理（高速化対応） =====
  // forceReload=true の時だけGASへ問い合わせる。それ以外はキャッシュ優先。
  async function loadConfig(forceReload = false) {
    // 1. まずローカルキャッシュを確認
    const cached = localStorage.getItem(LS_CONFIG_KEY);
    if (cached) {
      try { appConfig = JSON.parse(cached); } catch(e) { appConfig = []; }
    }

    // キャッシュがあり、かつ強制更新でなければ、ここで終了（通信しない＝爆速）
    if (appConfig.length > 0 && !forceReload) {
      if(document.getElementById("statusText")) {
         // すぐ消す、または何も表示しない
         statusText("");
      }
      return; 
    }

    // キャッシュがない、または強制更新の場合はGASへ問い合わせ
    try {
      if(document.getElementById("statusText")) statusText("設定更新中...");
      
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=config`);
      if (json && Array.isArray(json.config)) {
        appConfig = json.config;
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(appConfig));
      }
    } catch(e) {
      console.warn("Config fetch failed, using cache if avail", e);
    }
  }

  // ===== インデックス画面構築 =====
  function renderIndexButtons() {
    const container = document.getElementById("city-list-container");
    if(!container) return;
    container.innerHTML = "";

    appConfig.forEach(cfg => {
      if (cfg.status === 'stop') return;

      const slug = cfg.slug;  
      const name = cfg.name;  
      
      const a = document.createElement("a");
      a.className = "cardlink";
      a.href = `${slug}.html`; 
      
      if (cfg.status === 'help') {
        a.style.borderColor = "#fb7185"; 
      }

      const h2 = document.createElement("h2");
      h2.textContent = name + (cfg.status === 'help' ? " (Help)" : "");

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
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "同期待機中";
    }
  }

  // ===== Pull (ログ取込) 機能（修正版） =====
  async function execPullLog() {
    const ok = confirm("【Pull】inspectionlogの内容をアプリに強制反映しますか？\n（追加、状態変更、削除キャンセル等が反映されます）");
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

      for (const cfg of appConfig) {
        let cityData = readCity(cfg.name);
        let isCityModified = false;

        const cityLogs = logRows.filter(r => r.city === cfg.name);

        cityLogs.forEach(logRow => {
          const targetRow = cityData.find(r => r.plate === logRow.plate);

          // ステータス判定
          let newChecked = false;
          let newStatus = ""; // デフォルトは通常(standby)
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
          // ※上記以外(standbyや空文字)なら newStatus="" (通常) になる

          // 日付
          let newDate = "";
          if (logRow.date) {
            const d = new Date(logRow.date);
            if (!isNaN(d.getTime())) {
               newDate = d.toISOString().slice(0, 10);
            }
          }

          if (targetRow) {
            // ■既存更新 (Scenario 2)
            // ★修正：ログにある以上、空データ(standby)であっても強制的に上書きする
            // 以前の if (newChecked || ...) のガードを撤廃
            
            // 変更があるか確認
            if (targetRow.checked !== newChecked || targetRow.status !== newStatus || targetRow.last_inspected_at !== newDate) {
                targetRow.checked = newChecked;
                targetRow.status = newStatus;
                targetRow.last_inspected_at = newDate;
                isCityModified = true;
                updatedCount++;
            }
          } else {
            // ■新規追加 (Scenario 1)
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
      statusText(`Pull完了 (更新:${updatedCount}件, 追加:${addedCount}件)`);
      setTimeout(() => showProgress(false), 1500);

    } catch(e) {
      console.error(e);
      statusText("Pull失敗：" + e.message);
      showProgress(false);
    }
  }


  // ===== index.html 用：初期同期 =====
  async function initIndex() {
    // 高速化：まずはキャッシュで即時表示
    await loadConfig(false); 
    
    // 画面構築
    if(document.getElementById("city-list-container")) {
       renderIndexButtons();
       repaintCounters();
    }
    statusText("準備完了"); // 即時表示

    // 初期同期ボタン
    const btn = document.getElementById("syncBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        const ok = confirm("【注意】初期同期を実行します。\n現在のアプリ内のデータは全てリセットされます。\nよろしいですか？");
        if (!ok) return;

        // ★同期のタイミングで設定も最新にする
        try {
          await loadConfig(true); 
        } catch(e) { console.warn("config refresh failed"); }

        appConfig.forEach(cfg => {
          localStorage.removeItem(LS_KEY(cfg.name));
        });

        try {
          showProgress(true, 5);
          statusText("開始…");

          const url = `${GAS_URL}?action=pull&_=${Date.now()}`;
          statusText("GASへ問い合わせ中…");
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

          // 再描画
          renderIndexButtons();
          repaintCounters();
          
          showProgress(true, 100);
          statusText("同期完了");
        } catch (e) {
          console.error("sync error", e);
          statusText("同期失敗：通信エラー");
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

  // ===== city ページ =====
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
