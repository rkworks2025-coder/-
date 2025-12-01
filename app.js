// 巡回アプリ app.js
// version: s1u（s1kベース＋inspectionlog連携：全データJSON丸投げ方式）
// 前提ヘッダー（全体管理タブの英語表記）
// A: area, B: city, C: address, D: station, E: model,
// F: plate, G: note, H: operator

const Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";

  const CITIES = ["大和市", "海老名市", "調布市"];
  const PREFIX = { "大和市": "Y", "海老名市": "E", "調布市": "C" };

  const LS_KEY = (c) => `junkai:city:${c}`;
  const TIMEOUT_MS = 15000;

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function showProgress(on, pct) {
    const m = document.getElementById("progressModal");
    const bar = document.getElementById("progressBar");
    if (!m) return;
    if (on) m.classList.add("show");
    else m.classList.remove("show");

    if (bar && typeof pct === "number") {
      const v = Math.max(0, Math.min(100, pct));
      bar.style.width = `${v}%`;
      bar.textContent = `${v}%`;
    }
  }

  async function fetchWithRetry(url, options = {}, retry = 3) {
    let lastErr = null;
    for (let i = 0; i < retry; i++) {
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(to);
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(300 * (i + 1));
          continue;
        }
        // JSON.parse 前に BOM を除去
        const raw = await res.text();
        const text = raw.replace(/^\ufeff/, ""); // BOM除去
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        lastErr = e;
        await sleep(400 * (i + 1));
      }
    }
    throw lastErr || new Error("fetch-fail");
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
    } catch (_) {
      return [];
    }
  }

  function applyUIIndex(city, arr) {
    const p = PREFIX[city] || "";
    for (let i = 0; i < arr.length; i++) {
      arr[i].ui_index = `${p}${String(i + 1).padStart(3, "0")}`;
    }
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
    const map = {
      "大和市":   { done: "#yamato-done", stop: "#yamato-stop", skip: "#yamato-skip", total: "#yamato-total", rem: "#yamato-rem" },
      "海老名市": { done: "#ebina-done",  stop: "#ebina-stop",  skip: "#ebina-skip",  total: "#ebina-total",  rem: "#ebina-rem" },
      "調布市":   { done: "#chofu-done",  stop: "#chofu-stop",  skip: "#chofu-skip",  total: "#chofu-total",  rem: "#chofu-rem" }
    };

    let overallTotal = 0, overallDone = 0, overallStop = 0, overallSkip = 0;

    for (const city of CITIES) {
      const arr = readCity(city);
      const cnt = countCity(arr);
      overallTotal += cnt.total;
      overallDone += cnt.done;
      overallStop += cnt.stop;
      overallSkip += cnt.skip;

      const m = map[city];
      for (const k of ["done", "stop", "skip", "total"]) {
        const el = document.querySelector(m[k]);
        if (!el) continue;
        el.textContent = String(cnt[k]);
      }
      const remEl = document.querySelector(m.rem);
      if (remEl) remEl.textContent = String(cnt.total - cnt.done - cnt.skip);
    }

    const allDoneEl  = document.getElementById("all-done");
    const allStopEl  = document.getElementById("all-stop");
    const allSkipEl  = document.getElementById("all-skip");
    const allTotalEl = document.getElementById("all-total");
    const allRemEl   = document.getElementById("all-rem");

    if (allDoneEl)  allDoneEl.textContent  = overallDone;
    if (allStopEl)  allStopEl.textContent  = overallStop;
    if (allSkipEl)  allSkipEl.textContent  = overallSkip;
    if (allTotalEl) allTotalEl.textContent = overallTotal;
    if (allRemEl)   allRemEl.textContent   = (overallTotal - overallDone - overallSkip);

    const hint = document.getElementById("overallHint");
    if (hint) {
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "まだ同期されていません";
    }
  }

  // ----- inspectionlog 連携（s1u用：全データ丸投げ）ここから -----
  async function syncInspectionAll() {
    try {
      // 全エリアのローカルデータを1本にまとめる
      const all = [];
      for (const city of CITIES) {
        const arr = readCity(city);
        if (!Array.isArray(arr) || !arr.length) continue;
        for (const rec of arr) {
          all.push(rec);
        }
      }
      if (!all.length) return;

      const res = await fetch(`${GAS_URL}?action=syncInspection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: all })
      });

      let json = null;
      try {
        json = await res.json();
      } catch (_) {
        // JSONじゃなければ無視
      }
      if (!res.ok || (json && json.ok === false)) {
        console.error("syncInspectionAll failed", res.status, json && json.error);
      }
    } catch (e) {
      console.error("syncInspectionAll error", e);
    }
  }
  // ----- inspectionlog 連携（s1u用：全データ丸投げ）ここまで -----

  // ===== index.html 用：初期同期のみ（リセット付き） =====
  async function initIndex() {
    repaintCounters();

    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!confirm("全エリアの最新リストを取得して、ローカルデータをリセットします。よろしいですか？")) {
        return;
      }

      try {
        showProgress(true, 0);
        btn.disabled = true;

        const url = `${GAS_URL}?action=init`;
        const data = await fetchWithRetry(url, { method: "GET" });

        if (!Array.isArray(data)) throw new Error("invalid data");

        // city ごとに分割
        const grouped = {};
        for (const c of CITIES) grouped[c] = [];

        for (const row of data) {
          const city = row.city;
          if (!CITIES.includes(city)) continue;
          grouped[city].push({
            area: row.area || "",
            city: row.city || "",
            address: row.address || "",
            station: row.station || "",
            model: row.model || "",
            plate: row.plate || "",
            note: row.note || "",
            operator: row.operator || "",
            status: row.status || "",
            checked: false,
            last_inspected_at: row.last_inspected_at || ""
          });
        }

        // UI index を振る + ローカル保存
        let processed = 0;
        const totalCity = CITIES.length;
        for (const city of CITIES) {
          const arr = grouped[city];
          applyUIIndex(city, arr);
          saveCity(city, arr);
          processed++;
          const pct = Math.round((processed / totalCity) * 100);
          showProgress(true, pct);
          await sleep(200);
        }

        repaintCounters();
        alert("初期同期が完了しました。");
      } catch (e) {
        console.error(e);
        alert("初期同期に失敗しました。ネットワークやGASの状態を確認してください。");
      } finally {
        showProgress(false);
        btn.disabled = false;
      }
    });
  }

  // ===== city ページ =====
  function within7d(last) {
    if (!last) return false;
    const t = Date.parse(last);
    if (!Number.isFinite(t)) return false;
    const diff = Date.now() - t;
    return diff < 7 * 24 * 60 * 60 * 1000;
  }

  function rowBg(rec) {
    if (rec.checked) return "bg-pink";
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

  function initCity() {
    const city = document.body.getAttribute("data-city") || "";
    if (!CITIES.includes(city)) {
      console.error("unknown city", city);
      return;
    }

    const list = document.getElementById("car-list");
    if (!list) return;

    let arr = readCity(city);
    if (!Array.isArray(arr)) arr = [];

    list.innerHTML = "";

    for (const rec of arr) {
      const row = document.createElement("div");
      row.className = `row ${rowBg(rec)}`;

      const left = document.createElement("div");
      left.className = "col left";
      left.innerHTML = `
        <div class="station">${rec.station || "-"}</div>
        <div class="model-plate">
          <span class="model">${rec.model || "-"}</span>
          <span class="plate">${rec.plate || "-"}</span>
        </div>
        <div class="ui-index">${rec.ui_index || ""}</div>
      `;

      const mid = document.createElement("div");
      mid.className = "col mid";

      const statusLabel = document.createElement("label");
      statusLabel.textContent = "ステータス：";

      const sel = document.createElement("select");
      const statusOptions = [
        ["",       "通常"],
        ["stop",   "稼働停止"],
        ["skip",   "不要"]
      ];

      const current = rec.status || "";
      for (const [value, label] of statusOptions) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        if (current === value) o.selected = true;
        sel.appendChild(o);
      }

      sel.addEventListener("change", () => {
        rec.status = sel.value;
        row.className = `row ${rowBg(rec)}`;
        persistCityRec(city, rec);
        // ★ ステータス変更も inspectionlog 同期トリガー
        syncInspectionAll();
      });

      const tireBtn = document.createElement("button");
      tireBtn.className = "tire-btn";
      tireBtn.textContent = "点検";
      tireBtn.addEventListener("click", () => {
        const params = new URLSearchParams({
          station:    rec.station || "",
          model:      rec.model   || "",
          plate_full: rec.plate   || ""   // タイヤアプリ側は plate_full
        });
        const url = `${TIRE_APP_URL}?${params.toString()}`;
        window.open(url, "_blank");
      });

      mid.appendChild(statusLabel);
      mid.appendChild(sel);
      mid.appendChild(tireBtn);

      const right = document.createElement("div");
      right.className = "col right";

      const lastLabel = document.createElement("div");
      lastLabel.className = "last-label";
      lastLabel.textContent = "最終点検日：";

      const lastValue = document.createElement("div");
      lastValue.className = "last-value";
      lastValue.textContent = rec.last_inspected_at || "-";

      const checkedWrap = document.createElement("label");
      checkedWrap.className = "checked-wrap";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!rec.checked;

      const chkText = document.createElement("span");
      chkText.textContent = "チェック済";

      chk.addEventListener("change", () => {
        rec.checked = chk.checked;
        row.className = `row ${rowBg(rec)}`;
        persistCityRec(city, rec);
        // ★ チェックON/OFFも inspectionlog 同期トリガー
        syncInspectionAll();
      });

      checkedWrap.appendChild(chk);
      checkedWrap.appendChild(chkText);

      right.appendChild(lastLabel);
      right.appendChild(lastValue);
      right.appendChild(checkedWrap);

      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);

      list.appendChild(row);
    }
  }

  // 公開API
  return {
    initIndex,
    initCity
  };

})();
