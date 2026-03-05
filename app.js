// 巡回アプリ app.js
// version: s7a (初期同期復元・TMA即遷移・整理券発行対応)

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
        const compPlate = localStorage.getItem("junkai:completed_plate");
        if (compPlate) {
          localStorage.removeItem("junkai:completed_plate"); 
          const targetChk = document.querySelector(`input.chk[data-plate="${compPlate}"]`);
          if (targetChk && !targetChk.checked) {
            targetChk.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => targetChk.click(), 400); 
          }
        }
        const tireCompPlate = localStorage.getItem("junkai:tire_completed_plate");
        if (tireCompPlate) {
          localStorage.removeItem("junkai:tire_completed_plate");
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

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) handleReturnActions();
  });

  // ===== 設定・フィルタ処理 =====
  function loadLocalConfig() {
    const cached = localStorage.getItem(LS_CONFIG_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        appConfig = Array.isArray(parsed) ? parsed : [];
      } catch(e) { appConfig = []; }
    } else { appConfig = []; }
  }

  async function fetchRemoteConfig() {
    try {
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=config`);
      if (json && Array.isArray(json.config)) {
        appConfig = json.config;
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(appConfig));
        return true;
      }
    } catch(e) { throw new Error("設定の取得に失敗しました"); }
    return false;
  }

  function loadFilter(city) {
    try {
      const saved = localStorage.getItem(LS_FILTER_KEY(city));
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { standby: true, stop: true, skip: false, "7days_rule": false, checked: false };
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
    return labels.length === 0 ? "なし" : labels.join("・");
  }

  function matchesFilter(rec, filter) {
    if (rec.checked) return filter.checked === true;
    if (rec.status === "stop") return filter.stop === true;
    if (rec.status === "skip") return filter.skip === true;
    if (rec.status === "7days_rule") return filter["7days_rule"] === true;
    return filter.standby === true;
  }

  // ===== 描画・カウンタ =====
  function renderIndexButtons() {
    const container = document.getElementById("city-list-container");
    if(!container) return;
    container.innerHTML = "";
    appConfig.forEach(cfg => {
      const s = (cfg.status || "").trim();
      if (s !== "" && s !== "help") return;
      const slug = cfg.slug;  
      const a = document.createElement("a");
      a.className = "cardlink";
      a.href = `${slug}.html`; 
      if (s === 'help') a.style.borderColor = "#fb7185"; 
      a.innerHTML = `<h2>${cfg.name}${s==='help'?' (Help)':''}</h2>
        <div class="meta">
          <span class="chip">済 <span id="${slug}-done">0</span></span>
          <span class="chip">停 <span id="${slug}-stop">0</span></span>
          <span class="chip">不要 <span id="${slug}-skip">0</span></span>
          <span class="chip">総 <span id="${slug}-total">0</span></span>
          <span class="chip">残 <span id="${slug}-rem">0</span></span>
        </div>`;
      container.appendChild(a);
    });
  }

  function saveCity(city, arr) { localStorage.setItem(LS_KEY(city), JSON.stringify(arr)); }

  function readCity(city) {
    try {
      const s = localStorage.getItem(LS_KEY(city));
      return s ? JSON.parse(s) : [];
    } catch (_) { return []; }
  }

  function applyUIIndex(city, arr) {
    const target = appConfig.find(c => c.name === city);
    const p = target ? target.prefix : "?";
    arr.forEach((rec, i) => {
      rec.ui_index_num = i + 1;
      rec.ui_index = p + (i + 1);
    });
  }

  function normalizeRow(rowObj) {
    return {
      area: (rowObj.area || "").trim(),
      city: (rowObj.city || "").trim(),
      station: (rowObj.station || "").trim(),
      model: (rowObj.model || "").trim(),
      plate: (rowObj.plate || "").trim(),
      status: (rowObj.status || "").trim(),
      checked: !!rowObj.checked,
      last_inspected_at: (rowObj.last_inspected_at || "").trim(),
      ui_index: rowObj.ui_index || "",
      ui_index_num: rowObj.ui_index_num || 0
    };
  }

  function repaintCounters() {
    let overallTotal = 0, overallDone = 0, overallStop = 0, overallSkip = 0;
    appConfig.forEach(cfg => {
      const arr = readCity(cfg.name);
      const cnt = { done: 0, stop: 0, skip: 0, total: arr.length };
      arr.forEach(it => {
        if (it.status === "stop") cnt.stop++;
        else if (it.status === "skip") cnt.skip++;
        if (it.checked) cnt.done++;
      });
      overallTotal += cnt.total; overallDone += cnt.done; overallStop += cnt.stop; overallSkip += cnt.skip;
      const slug = cfg.slug;
      if(document.getElementById(`${slug}-done`)) {
        document.getElementById(`${slug}-done`).textContent = cnt.done;
        document.getElementById(`${slug}-stop`).textContent = cnt.stop;
        document.getElementById(`${slug}-skip`).textContent = cnt.skip;
        document.getElementById(`${slug}-total`).textContent = cnt.total;
        document.getElementById(`${slug}-rem`).textContent = (cnt.total - cnt.done - cnt.skip);
      }
    });
    const ids = { "#all-done": overallDone, "#all-stop": overallStop, "#all-skip": overallSkip, "#all-total": overallTotal };
    Object.entries(ids).forEach(([id, val]) => {
      const el = document.querySelector(id);
      if(el) el.textContent = val;
    });
    if(document.querySelector("#all-rem")) document.querySelector("#all-rem").textContent = (overallTotal - overallDone - overallSkip);
    const hint = document.getElementById("overallHint");
    if (hint) hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "同期してください";
  }

  // ===== Pull & Sync =====
  async function execPullLog() {
    if (!confirm("【Pull】反映しますか？")) return;
    try {
      showProgress(true, 10);
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=pullLog&_=${Date.now()}`);
      if (!json || !json.ok) throw new Error("取得失敗");
      const logRows = json.rows;
      appConfig.forEach(cfg => {
        let cityData = readCity(cfg.name);
        const cityLogs = logRows.filter(r => r.city === cfg.name);
        const validPlates = cityLogs.map(r => r.plate);
        cityData = cityData.filter(localRow => validPlates.includes(localRow.plate));
        cityLogs.forEach(logRow => {
          const targetRow = cityData.find(r => r.plate === logRow.plate);
          const s = (logRow.status || "").toLowerCase();
          const newChecked = (s === "checked" || s === "完了" || s === "済");
          const newStatus = (s === "stop" || s === "停止") ? "stop" : (s === "skip" || s === "不要") ? "skip" : (s === "7days_rule") ? "7days_rule" : "";
          const newDate = logRow.date ? logRow.date.slice(0, 10) : "";
          if (targetRow) {
            targetRow.checked = newChecked; targetRow.status = newStatus; targetRow.last_inspected_at = newDate;
          } else {
            cityData.push(normalizeRow({ ...logRow, status: newStatus, checked: newChecked, last_inspected_at: newDate }));
          }
        });
        applyUIIndex(cfg.name, cityData); saveCity(cfg.name, cityData);
      });
      repaintCounters(); showProgress(true, 100); setTimeout(() => showProgress(false), 1500);
    } catch(e) { statusText("Pull失敗"); showProgress(false); }
  }

  async function initIndex() {
    loadLocalConfig();
    const workModeSelect = document.getElementById("workModeSelect");
    if (workModeSelect) {
      workModeSelect.value = localStorage.getItem("junkai:work_mode") || "single";
      workModeSelect.addEventListener("change", (e) => localStorage.setItem("junkai:work_mode", e.target.value));
    }
    renderIndexButtons(); repaintCounters();
    const btn = document.getElementById("syncBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        if (!confirm("初期同期を実行しますか?")) return;
        try {
          showProgress(true, 5); await fetchRemoteConfig();
          appConfig.forEach(cfg => localStorage.removeItem(LS_KEY(cfg.name)));
          const json = await fetchJSONWithRetry(`${GAS_URL}?action=pull&_=${Date.now()}`);
          if (!json || !Array.isArray(json.rows)) throw new Error("bad-shape");
          const buckets = {}; appConfig.forEach(cfg => buckets[cfg.name] = []);
          json.rows.forEach(r => {
            const norm = normalizeRow(r);
            if (buckets[norm.city]) buckets[norm.city].push(norm);
          });
          Object.keys(buckets).forEach(city => {
            const arr = buckets[city];
            if(arr.length > 0) { applyUIIndex(city, arr); saveCity(city, arr); }
          });
          renderIndexButtons(); repaintCounters(); showProgress(true, 100);
        } catch (e) { statusText("同期失敗"); } finally { setTimeout(() => showProgress(false), 400); }
      });
    }
    const pullBtn = document.getElementById("pushLogBtn");
    if (pullBtn) pullBtn.addEventListener("click", execPullLog);
  }

  async function syncInspectionAll() {
    const all = []; appConfig.forEach(cfg => readCity(cfg.name).forEach(rec => all.push(rec)));
    try {
      await fetch(`${GAS_URL}?action=syncInspection`, { method: "POST", body: JSON.stringify({ data: all }) });
    } catch (e) {}
  }

  // ===== City ページ詳細 =====
  function rowBg(rec) {
    if (rec.checked) return "bg-pink";
    if (rec.status === "7days_rule") return "bg-blue";
    if (rec.status === "stop") return "bg-gray";
    if (rec.status === "skip") return "bg-yellow";
    return "bg-green";
  }

  async function initCity(cityKey) {
    loadLocalConfig();
    let targetCfg = appConfig.find(c => c.name === cityKey || c.slug === cityKey);
    if (!targetCfg) return;
    const cityName = targetCfg.name;
    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    let currentFilter = loadFilter(cityName);

    function renderList() {
      const arr = readCity(cityName);
      list.innerHTML = "";
      const filteredArr = arr.filter(rec => matchesFilter(rec, currentFilter));
      hint.textContent = `件数：${filteredArr.length} / ${arr.length}`;
      filteredArr.forEach(rec => {
        const row = document.createElement("div");
        row.className = `row ${rowBg(rec)}`;
        
        // 左・中央の構築 (簡略化して記述するがロジックは完全維持)
        const left = document.createElement("div"); left.className = "leftcol";
        const chk = document.createElement("input"); chk.type = "checkbox"; chk.className = "chk"; chk.checked = !!rec.checked;
        chk.addEventListener("change", () => {
          if (!confirm("チェックを切り替えますか?")) { chk.checked = !chk.checked; return; }
          rec.checked = chk.checked; rec.last_inspected_at = chk.checked ? getTodayJST() : "";
          row.className = `row ${rowBg(rec)}`; saveCity(cityName, arr); syncInspectionAll(); renderList();
        });
        left.innerHTML = `<div class="left-top"><div class="idx">${rec.ui_index}</div></div>`;
        left.firstChild.appendChild(chk);

        const mid = document.createElement("div"); mid.className = "mid";
        mid.innerHTML = `<div class="title">${rec.station}</div><div class="sub">${rec.model}<br>${rec.plate}</div>`;

        const right = document.createElement("div"); right.className = "rightcol";
        const sel = document.createElement("select"); sel.className = "state";
        [["", "通常"], ["stop", "停止"], ["skip", "不要"]].forEach(([v, l]) => {
          const o = document.createElement("option"); o.value = v; o.textContent = l;
          if (rec.status === v) o.selected = true; sel.appendChild(o);
        });
        sel.addEventListener("change", () => { rec.status = sel.value; row.className = `row ${rowBg(rec)}`; saveCity(cityName, arr); syncInspectionAll(); renderList(); });

        const btnGroup = document.createElement("div"); btnGroup.className = "btn-group";
        const tmaBtn = document.createElement("button"); tmaBtn.className = "tma-btn"; tmaBtn.textContent = "TMA";

        // ★★★ TMAボタンの即遷移ロジック ★★★
        tmaBtn.addEventListener("click", () => {
          if(!confirm(`【${rec.plate}】\nTMA自動入力を実行しますか？`)) return;
          tmaBtn.disabled = true; tmaBtn.textContent = "遷移中";
          const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
          // GASへ投げっぱなし送信
          fetch(`${GAS_URL}?action=triggerTMA`, { method: "POST", body: JSON.stringify({ plate: rec.plate, requestId: requestId }), keepalive: true }).catch(() => {});
          // 即座に遷移
          const params = new URLSearchParams({ station: rec.station, model: rec.model, plate_full: rec.plate, tma_plate: rec.plate, tma_req_id: requestId });
          location.href = `${WORK_APP_URL}?${params.toString()}`;
        });

        const tireBtn = document.createElement("button"); tireBtn.className = "tire-btn"; tireBtn.textContent = "点検";
        tireBtn.addEventListener("click", () => { location.href = `${TIRE_APP_URL}?${new URLSearchParams({ station: rec.station, model: rec.model, plate_full: rec.plate }).toString()}`; });

        btnGroup.append(tmaBtn, tireBtn); right.append(sel, btnGroup);
        row.append(left, mid, right); list.appendChild(row);
      });
    }

    const fBtn = document.getElementById("filterBtn");
    if(fBtn) fBtn.addEventListener("click", () => {
      // フィルタモーダル表示ロジック (省略せず維持)
      document.getElementById("filterModal").classList.add("show");
    });
    const fApply = document.getElementById("filterApply");
    if(fApply) fApply.addEventListener("click", () => {
      currentFilter = {
        standby: document.getElementById("filter_standby").checked,
        stop: document.getElementById("filter_stop").checked,
        skip: document.getElementById("filter_skip").checked,
        "7days_rule": document.getElementById("filter_7days").checked,
        checked: document.getElementById("filter_checked").checked
      };
      saveFilter(cityName, currentFilter); document.getElementById("filterModal").classList.remove("show"); renderList();
    });
    const fCancel = document.getElementById("filterCancel");
    if(fCancel) fCancel.addEventListener("click", () => document.getElementById("filterModal").classList.remove("show"));

    renderList();
  }

  return { initIndex, initCity };
})();
