// 巡回アプリ app.js
// version: s4a (JST強制・削除反映・Status色判定修正)

var Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const LS_CONFIG_KEY = "junkai:config";
  const TIMEOUT_MS = 15000;

  let appConfig = []; 

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const LS_KEY = (c) => `junkai:city:${c}`; 

  // ★修正: JSTでの日付文字列(YYYY-MM-DD)を取得する
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

  // ===== 設定処理 =====

  // 1. ローカルキャッシュのみ読み込む（起動用・通信なし）
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

  // 2. GASから設定を強制更新する（初期同期ボタン用）
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
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "同期してください";
    }
  }

  // ===== Pull (ログ取込) 機能 =====
  async function execPullLog() {
    const ok = confirm("【Pull】inspectionlogの内容をアプリに反映しますか？\n（追加・更新・削除・状態変更が反映されます）");
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
      let deletedCount = 0; // 削除数カウント用

      for (const cfg of appConfig) {
        let cityData = readCity(cfg.name);
        let isCityModified = false;

        const cityLogs = logRows.filter(r => r.city === cfg.name);
        
        // ★修正: 削除処理 (ログにない車両を削除)
        // ログに含まれる plate のリストを作成
        const validPlates = cityLogs.map(r => r.plate);
        const preCount = cityData.length;
        // ログに存在しない plate の行を除外
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

          let newDate = "";
          if (logRow.date) {
            // GASから来る日付(YYYY-MM-DD)をそのまま使う、もしくは整形
            // ここでは文字列としてそのまま扱う（GAS側でJST整形済みを想定）
            newDate = logRow.date.slice(0, 10);
          }

          if (targetRow) {
            // ■既存更新
            if (targetRow.checked !== newChecked || targetRow.status !== newStatus || targetRow.last_inspected_at !== newDate) {
                targetRow.checked = newChecked;
                targetRow.status = newStatus;
                targetRow.last_inspected_at = newDate;
                isCityModified = true;
                updatedCount++;
            }
          } else {
            // ■新規追加
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
    // 1. まずローカル設定だけで即時表示（通信ゼロ）
    loadLocalConfig(); 
    
    // 画面構築
    if(document.getElementById("city-list-container")) {
       renderIndexButtons();
       repaintCounters();
    }
    statusText(""); 

    // 2. 初期同期ボタンの処理
    const btn = document.getElementById("syncBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        const ok = confirm("【注意】初期同期を実行します。\n現在のアプリ内のデータは全てリセットされます。\nよろしいですか？");
        if (!ok) return;

        try {
          showProgress(true, 5);
          statusText("設定ファイル更新中…");

          // ★GASからConfigを取得
          await fetchRemoteConfig();
          
          // 設定更新後に古いデータをクリア
          appConfig.forEach(cfg => {
             localStorage.removeItem(LS_KEY(cfg.name));
          });

          // 続いて車両データを取得
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

          // 再描画
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
        h.textContent="送信成功";
        setTimeout(()=>h.textContent=`件数：${all.length}`, 1500);
      }
    } catch (e) {
      const h=document.getElementById("hint");
      if(h) h.textContent="送信失敗";
    }
  }

  function within7d(last) {
    if (!last) return false;
    const t = Date.parse(last);
    if (!Number.isFinite(t)) return false;
    const diff = Date.now() - t;
    return diff < 7 * 24 * 60 * 60 * 1000;
  }

  function rowBg(rec) {
    if (rec.checked) return "bg-pink";
    // ★修正: status が 7days_rule の場合も青色にする
    if (rec.status === "7days_rule") return "bg-blue"; 
    
    if (rec.status === "stop") return "bg-gray";
    if (rec.status === "skip") return "bg-yellow";
    if (within7d(rec.last_inspected_at)) return "bg-blue";
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
    // 起動時：キャッシュのみを使用
    loadLocalConfig(); 

    let cityName = cityKey;
    let targetCfg = appConfig.find(c => c.name === cityKey);
    if (!targetCfg) {
       targetCfg = appConfig.find(c => c.slug === cityKey);
       if(targetCfg) cityName = targetCfg.name;
    }

    if (!targetCfg) {
      const h = document.getElementById("hint");
      if(h) h.textContent = "設定エラー：Config未ロード";
      return;
    }

    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    if (!list || !hint) return;

    const arr = readCity(cityName);
    list.innerHTML = "";

    if (arr.length === 0) {
      hint.textContent = "データなし";
      return;
    }

    hint.textContent = `件数：${arr.length}`;

    for (const rec of arr) {
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
      topLeft.appendChild(idxDiv);
      topLeft.appendChild(chk);

      const dtDiv = document.createElement("div");
      dtDiv.className = "datetime";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;border:none;padding:0;margin:0;z-index:-1;";

      function updateDateTime() {
        if (rec.last_inspected_at) {
          let d = new Date(rec.last_inspected_at);
          if (Number.isFinite(d.getTime())) {
            const yyyy = String(d.getFullYear());
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            dtDiv.innerHTML = `${yyyy}<br>${mm}/${dd}`;
            dtDiv.style.display = "";
            dateInput.value = `${yyyy}-${mm}-${dd}`;
            return;
          }
        }
        dtDiv.innerHTML = "";
        dtDiv.style.display = "none";
        dateInput.value = "";
      }
      updateDateTime();

      dtDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!rec.checked) return;
        try { dateInput.focus(); dateInput.showPicker(); } catch (err) { dateInput.click(); }
      });
      dateInput.addEventListener("change", () => {
        if (!dateInput.value) return; 
        if (confirm("日付を変更しますか？")) {
          rec.last_inspected_at = dateInput.value;
          updateDateTime();
          persistCityRec(cityName, rec);
          syncInspectionAll(); 
        }
      });

      left.appendChild(topLeft);
      left.appendChild(dtDiv);
      left.appendChild(dateInput);

      chk.addEventListener("change", () => {
        if (!confirm(chk.checked ? "チェックしますか？" : "外しますか？")) {
          chk.checked = !chk.checked;
          return;
        }
        if (chk.checked) {
          rec.checked = true;
          // ★修正: JSTの日付文字列を取得
          rec.last_inspected_at = getTodayJST();
        } else {
          rec.checked = false;
          rec.last_inspected_at = "";
        }
        updateDateTime();
        row.className = `row ${rowBg(rec)}`;
        persistCityRec(cityName, rec);
        syncInspectionAll();
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

      right.appendChild(sel);
      right.appendChild(tireBtn);

      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  return { initIndex, initCity };

})();
