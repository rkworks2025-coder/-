// 巡回アプリ app.js
// version: s9d (チェック操作のオリジナルモーダル化)

var Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/TireCheck/";
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

  // ===== 戻り時の自動アクション (強化版) =====
  function handleReturnActions() {
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
    if (!tireCompPlate) return;

    const workMode = localStorage.getItem("junkai:work_mode") || "single";
    if (workMode === "continuous") {
      localStorage.removeItem("junkai:tire_completed_plate");
      return;
    }

    let retryCount = 0;
    const maxRetries = 30;
    const monitorInterval = setInterval(() => {
      const targetChk = document.querySelector(`input.chk[data-plate="${tireCompPlate}"]`);
      if (targetChk) {
        const row = targetChk.closest('.row');
        if (row) {
          const tmaBtn = row.querySelector('.tma-btn');
          if (tmaBtn && !tmaBtn.disabled) {
            clearInterval(monitorInterval);
            localStorage.removeItem("junkai:tire_completed_plate");
            tmaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => tmaBtn.click(), 400);
            return;
          }
        }
      }
      retryCount++;
      if (retryCount >= maxRetries) {
        clearInterval(monitorInterval);
        localStorage.removeItem("junkai:tire_completed_plate");
      }
    }, 100);
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) handleReturnActions();
  });

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
    } catch(e) { console.warn("Config fetch failed", e); throw new Error("設定の取得に失敗しました"); }
    return false;
  }

  function getDefaultFilter() {
    return { standby: true, stop: true, skip: false, "7days_rule": false, checked: false };
  }

  function loadFilter(city) {
    try {
      const saved = localStorage.getItem(LS_FILTER_KEY(city));
      if (saved) return JSON.parse(saved);
    } catch(e) {}
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
    return labels.length === 0 ? "なし" : labels.join("・");
  }

  function matchesFilter(rec, filter) {
    if (rec.checked) return filter.checked === true;
    const status = rec.status || "";
    if (status === "stop") return filter.stop === true;
    if (status === "skip") return filter.skip === true;
    if (status === "7days_rule") return filter["7days_rule"] === true;
    return filter.standby === true;
  }

  function renderIndexButtons() {
    const container = document.getElementById("city-list-container");
    if(!container) return;
    container.innerHTML = "";
    appConfig.forEach(cfg => {
      const s = (cfg.status || "").trim();
      if (s !== "" && s !== "help") return;
      const slug = cfg.slug;  
      const name = cfg.name;  
      const a = document.createElement("a");
      a.className = "cardlink";
      a.href = `area.html?city=${slug}`; 
      if (s === 'help') a.style.borderColor = "#fb7185"; 
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
      area: (rowObj.area || "").trim(),
      city: (rowObj.city || "").trim(),
      address: (rowObj.address || "").trim(),
      station: (rowObj.station || "").trim(),
      model: (rowObj.model || "").trim(),
      plate: (rowObj.plate || "").trim(),
      note: (rowObj.note || "").trim(),
      operator: (rowObj.operator || "").trim(),
      status: (rowObj.status || "").trim(),
      checked: !!rowObj.checked,
      last_inspected_at: (rowObj.last_inspected_at || "").trim(),
      index: Number.isFinite(+rowObj.index) ? parseInt(rowObj.index, 10) : 0,
      ui_index: rowObj.ui_index || "",
      ui_index_num: rowObj.ui_index_num || 0
    };
  }

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
    if (allDoneEl) allDoneEl.textContent = overallDone;
    if (allStopEl) allStopEl.textContent = overallStop;
    if (allSkipEl) allSkipEl.textContent = overallSkip;
    if (allTotalEl) allTotalEl.textContent = overallTotal;
    if (allRemEl) allRemEl.textContent = (overallTotal - overallDone - overallSkip);
  }

  async function execPullLog() {
    const ok = confirm("【Pull】inspectionlogの内容をアプリに反映しますか？");
    if (!ok) return;
    try {
      showProgress(true, 10);
      statusText("ログを取得中...");
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=pullLog&_=${Date.now()}`, 2);
      showProgress(true, 50);
      if (!json || !json.ok || !Array.isArray(json.rows)) throw new Error("ログ取得失敗");
      statusText("データ反映中...");
      const logRows = json.rows;
      for (const cfg of appConfig) {
        let cityData = readCity(cfg.name);
        let isCityModified = false;
        const cityLogs = logRows.filter(r => r.city === cfg.name);
        const validPlates = cityLogs.map(r => r.plate);
        const preCount = cityData.length;
        cityData = cityData.filter(localRow => validPlates.includes(localRow.plate));
        if (preCount !== cityData.length) isCityModified = true;
        cityLogs.forEach(logRow => {
          const targetRow = cityData.find(r => r.plate === logRow.plate);
          let newChecked = false, newStatus = ""; 
          const s = (logRow.status || "").toLowerCase();
          if (s === "checked" || s === "完了" || s === "済") newChecked = true;
          else if (s === "stop" || s === "停止") newStatus = "stop";
          else if (s === "skip" || s === "不要") newStatus = "skip";
          else if (s === "7days_rule") newStatus = "7days_rule"; 
          let newDate = logRow.date ? logRow.date.slice(0, 10) : "";
          if (targetRow) {
            if (targetRow.checked !== newChecked || targetRow.status !== newStatus || targetRow.last_inspected_at !== newDate) {
                targetRow.checked = newChecked; targetRow.status = newStatus; targetRow.last_inspected_at = newDate;
                isCityModified = true;
            }
          } else {
            cityData.push(normalizeRow({ city: cfg.name, station: logRow.station, model: logRow.model, plate: logRow.plate, status: newStatus, checked: newChecked, last_inspected_at: newDate }));
            isCityModified = true;
          }
        });
        if (isCityModified) { applyUIIndex(cfg.name, cityData); saveCity(cfg.name, cityData); }
      }
      repaintCounters(); showProgress(true, 100); statusText("Pull完了");
      setTimeout(() => showProgress(false), 2000);
    } catch(e) { statusText("Pull失敗：" + e.message); showProgress(false); }
  }

  async function initIndex() {
    loadLocalConfig();
    const workModeSelect = document.getElementById("workModeSelect");
    if (workModeSelect) {
      workModeSelect.value = localStorage.getItem("junkai:work_mode") || "single";
      workModeSelect.addEventListener("change", (e) => localStorage.setItem("junkai:work_mode", e.target.value));
    }
    if(document.getElementById("city-list-container")) { renderIndexButtons(); repaintCounters(); }
    const btn = document.getElementById("syncBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        if (!confirm("初期同期を実行しますか?")) return;
        try {
          showProgress(true, 5); statusText("同期中…");
          await fetchRemoteConfig();
          appConfig.forEach(cfg => localStorage.removeItem(LS_KEY(cfg.name)));
          const json = await fetchJSONWithRetry(`${GAS_URL}?action=pull&_=${Date.now()}`, 2);
          const buckets = {}; appConfig.forEach(cfg => buckets[cfg.name] = []);
          for (const r of json.rows) {
            const norm = normalizeRow(r);
            if (buckets[norm.city]) buckets[norm.city].push(norm);
          }
          for (const cfg of appConfig) {
            const arr = buckets[cfg.name];
            if (arr && arr.length > 0) { applyUIIndex(cfg.name, arr); saveCity(cfg.name, arr); }
          }
          renderIndexButtons(); repaintCounters();
          showProgress(true, 100); statusText("同期完了");
        } catch (e) { statusText("同期失敗：" + e.message); }
        finally { setTimeout(() => showProgress(false), 400); }
      });
    }
    const pushLogBtn = document.getElementById("pushLogBtn");
    if (pushLogBtn) { pushLogBtn.textContent = "Pull"; pushLogBtn.addEventListener("click", execPullLog); }
  }

  async function syncInspectionAll() {
    const all = []; appConfig.forEach(cfg => all.push(...readCity(cfg.name)));
    try {
      await fetch(`${GAS_URL}?action=syncInspection`, { method: "POST", body: JSON.stringify({ data: all }) });
    } catch (e) {}
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
    const idx = arr.findIndex(r => r.ui_index === rec.ui_index);
    if (idx !== -1) { arr[idx] = rec; saveCity(city, arr); repaintCounters(); }
  }

  async function initCity(cityKey) {
    loadLocalConfig(); 
    let targetCfg = appConfig.find(c => c.name === cityKey) || appConfig.find(c => c.slug === cityKey);
    if (!targetCfg) return;
    const cityName = targetCfg.name;
    if (document.getElementById("pageTitle")) document.getElementById("pageTitle").textContent = cityName;
    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    let currentFilter = loadFilter(cityName);

    function renderList() {
      const arr = readCity(cityName);
      list.innerHTML = "";
      const filteredArr = arr.filter(rec => matchesFilter(rec, currentFilter));
      hint.textContent = `件数：${filteredArr.length} / ${arr.length}`;
      for (const rec of filteredArr) {
        const row = document.createElement("div");
        row.className = `row ${rowBg(rec)}`;
        const left = document.createElement("div"); left.className = "leftcol";
        const chk = document.createElement("input"); chk.type = "checkbox"; chk.className = "chk"; chk.checked = !!rec.checked; chk.dataset.plate = rec.plate;
        chk.addEventListener("change", () => {
          rec.checked = chk.checked; rec.last_inspected_at = chk.checked ? getTodayJST() : "";
          persistCityRec(cityName, rec); syncInspectionAll(); renderList();
        });
        const idxDiv = document.createElement("div"); idxDiv.className = "idx"; idxDiv.textContent = rec.ui_index || "";
        left.appendChild(idxDiv); left.appendChild(chk);
        const mid = document.createElement("div"); mid.className = "mid";
        mid.innerHTML = `<div class="title">${rec.station || ""}</div><div class="sub">${rec.model || ""}<br>${rec.plate || ""}</div>`;
        const right = document.createElement("div"); right.className = "rightcol";
        const tmaBtn = document.createElement("button"); tmaBtn.className = "tma-btn"; tmaBtn.textContent = "TMA";
        tmaBtn.addEventListener("click", () => {
          const tmaModal = document.getElementById('tmaModal');
          const tmaModalTitle = document.getElementById('tmaModalTitle');
          const tmaModalModel = document.getElementById('tmaModalModel');
          const btnOk = document.getElementById('tmaModalOk');
          if (!tmaModal || !tmaModalTitle || !btnOk) {
            if(!confirm(`【${rec.plate}】\nTMA自動入力を実行しますか？`)) return;
            executeTma(); return;
          }
          tmaModalTitle.textContent = `【${rec.plate}】`;
          if (tmaModalModel) tmaModalModel.textContent = rec.model || "";
          tmaModal.classList.add('show');
          btnOk.onclick = () => { tmaModal.classList.remove('show'); executeTma(); };
          document.getElementById('tmaModalCancel').onclick = () => tmaModal.classList.remove('show');
          function executeTma() {
            tmaBtn.disabled = true; tmaBtn.textContent = "遷移中";
            const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
            const params = new URLSearchParams({ station: rec.station, model: rec.model, plate_full: rec.plate, tma_plate: rec.plate, tma_req_id: requestId });
            
            // ★Python連携のため、パラメータには「短いURL」だけをセットして414エラーを回避
            const preloadedImgUrl = localStorage.getItem("junkai:preloaded_splash_url");
            if (preloadedImgUrl) params.set("splash_img", preloadedImgUrl);
            
            // ★重要: 遷移先のアプリがlocalStorageの実体データを読み取れるようにするため、ここでは消去しない
            location.href = `${WORK_APP_URL}?${params.toString()}`;
          }
        });
        const tireBtn = document.createElement("button"); tireBtn.className = "tire-btn"; tireBtn.textContent = "点検";
        tireBtn.addEventListener("click", () => {
          location.href = `${TIRE_APP_URL}?${new URLSearchParams({ station: rec.station, model: rec.model, plate_full: rec.plate }).toString()}`;
        });
        right.appendChild(tmaBtn); right.appendChild(tireBtn);
        row.appendChild(left); row.appendChild(mid); row.appendChild(right);
        list.appendChild(row);
      }
      handleReturnActions();
    }
    renderList();
  }

  async function initAreaPage() {
    const params = new URLSearchParams(window.location.search);
    const cityKey = params.get('city');
    if (cityKey) await initCity(cityKey);
  }

  return { initIndex, initCity, initAreaPage };
})();
