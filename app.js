// 巡回アプリ app.js
// version: s1o（inspectionlog 全件送信・全件POST対応版）
// 前提ヘッダー（全体管理タブの英語表記）
// A: area, B: city, C: address, D: station, E: model,
// F: plate, G: note, H: operator

const Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbP...7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";

  const CITIES = ["大和市", "海老名市", "調布市"];
  const PREFIX = { "大和市": "Y", "海老名市": "E", "調布市": "C" };

  const LS_KEY = (c) => `junkai:city:${c}`;
  const TIMEOUT_MS = 15000;

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /**
   * 直近 7 日以内なら true を返す
   * @param {string} isoDate yyyy-mm-dd 形式
   */
  function within7d(isoDate) {
    if (!isoDate) return false;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const seven = 7 * 24 * 60 * 60 * 1000;
    return diff >= 0 && diff <= seven;
  }

  function showModal(on, pct) {
    const m = document.getElementById("modal");
    const bar = document.getElementById("modalBarInner");
    if (!m) return;
    if (on) m.classList.add("show");
    else m.classList.remove("show");
    if (bar && typeof pct === "number") {
      const v = Math.max(0, Math.min(100, pct));
      bar.style.width = v + "%";
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
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        if (i === retry) break;
        await sleep(500);
      }
    }
    throw lastErr;
  }

  function saveCity(city, rows) {
    try {
      localStorage.setItem(LS_KEY(city), JSON.stringify(rows || []));
    } catch (_) {
      // ignore
    }
  }

  function readCity(city) {
    try {
      const s = localStorage.getItem(LS_KEY(city));
      if (!s) return [];
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function clearAllCities() {
    for (const c of CITIES) {
      try {
        localStorage.removeItem(LS_KEY(c));
      } catch (_) {
      }
    }
  }

  function rowBg(rec) {
    if (rec.checked) return "bg-pink";
    if (rec.status === "stop") return "bg-gray";
    if (rec.status === "skip") return "bg-yellow";
    if (within7d(rec.last_inspected_at)) return "bg-blue";
    return "bg-green";
  }

  /**
   * 巡回状況に応じて inspectionlog へ送るステータス文字列を決定する。
   * 5種類の状態に対応させる。
   * - rec.checked === true           -> "checked"
   * - rec.status === "stop"         -> "stopped"
   * - rec.status === "skip"         -> "Unnecessary"
   * - within7d(rec.last_inspected_at) -> "7days_rule"
   * - 上記以外                       -> "standby"
   * @param {object} rec レコードオブジェクト
   * @returns {string} inspectionlog用のステータス
   */
  function mapStatusForLog(rec) {
    try {
      if (rec.checked) return "checked";
      if (rec.status === "stop") return "stopped";
      if (rec.status === "skip") return "Unnecessary";
      if (within7d(rec.last_inspected_at)) return "7days_rule";
      return "standby";
    } catch (_) {
      return "standby";
    }
  }

  /**
   * yyyy-mm-dd 形式の日付文字列を inspectionlog 用の yyyy/mm/dd に変換する。
   * 空文字列や不正な値の場合は空文字列を返す。
   * @param {string} s
   * @returns {string}
   */
  function formatCheckedAt(s) {
    if (!s) return "";
    const parts = s.split("-");
    if (parts.length !== 3) return "";
    const [y, m, d] = parts;
    if (!y || !m || !d) return "";
    return `${y}/${m}/${d}`;
  }

  /**
   * inspectionlog 用に、指定された city の全件データを GAS へ送信する。
   * 送信方式は POST (application/json) とし、URL パラメータ action=pushInspectionAll
   * で GAS 側の doPost(e) が処理する。
   * @param {string} city
   */
  async function pushInspectionAll(city) {
    try {
      const arr = readCity(city);
      if (!Array.isArray(arr) || arr.length === 0) return;

      const data = arr.map((rec) => {
        const status = mapStatusForLog(rec);
        const checkedAt = rec.checked ? formatCheckedAt(rec.last_inspected_at) : "";
        return {
          city: rec.city || city || "",
          station: rec.station || "",
          model: rec.model || "",
          plate: rec.plate || "",
          ui_index: rec.ui_index || "",
          status: status,
          checked_at: checkedAt
        };
      });

      const url = `${GAS_URL}?action=pushInspectionAll`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data })
      }).catch((e) => {
        // エラーはコンソールに出すだけでアプリの操作には影響させない
        console.error("pushInspectionAll error", e);
      });
    } catch (e) {
      console.error("pushInspectionAll error", e);
    }
  }

  function persistCityRec(city, rec) {
    const arr = readCity(city);
    if (!Array.isArray(arr) || !arr.length) return;

    const idx = arr.findIndex(r => String(r.ui_index) === String(rec.ui_index));
    if (idx >= 0) {
      arr[idx] = rec;
    }
    saveCity(city, arr);
  }

  // ===== index.html 用 =====
  async function initIndex() {
    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!confirm("シートから最新データを同期します。よろしいですか？")) return;

      statusText("同期中…");
      showModal(true, 0);

      try {
        clearAllCities();

        const url = `${GAS_URL}?action=pull`;
        const json = await fetchJSONWithRetry(url, 2);
        if (!json || !Array.isArray(json.rows)) {
          throw new Error("invalid response");
        }

        const rows = json.rows;

        const cityMap = {};
        for (const c of CITIES) cityMap[c] = [];

        for (const row of rows) {
          const city = row.city || "";
          if (!cityMap[city]) continue;

          cityMap[city].push({
            area: row.area || "",
            city: row.city || "",
            address: row.address || "",
            station: row.station || "",
            model: row.model || "",
            plate: row.plate || "",
            note: row.note || "",
            ui_index: row.ui_index || "",
            checked: false,
            last_inspected_at: "",
            status: ""
          });
        }

        for (const c of CITIES) {
          saveCity(c, cityMap[c] || []);
        }

        showModal(false);
        statusText("同期完了");
        alert("同期が完了しました。各エリアページを開き直してください。");
      } catch (e) {
        console.error(e);
        showModal(false);
        statusText("同期失敗");
        alert("同期に失敗しました。時間をおいて再度お試しください。");
      }
    });

    const yLink = document.getElementById("y-link");
    const eLink = document.getElementById("e-link");
    const cLink = document.getElementById("c-link");

    if (yLink) {
      yLink.addEventListener("click", () => {
        window.location.href = "yamato.html";
      });
    }
    if (eLink) {
      eLink.addEventListener("click", () => {
        window.location.href = "ebina.html";
      });
    }
    if (cLink) {
      cLink.addEventListener("click", () => {
        window.location.href = "chofu.html";
      });
    }
  }

  // ===== city ページ用 =====
  async function initCity(city) {
    const list = document.getElementById("carList");
    const headerCity = document.getElementById("headerCity");
    const backBtn = document.getElementById("backBtn");
    const progressText = document.getElementById("progressText");

    if (headerCity) headerCity.textContent = city;
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.location.href = "index.html";
      });
    }

    const rows = readCity(city);
    if (!Array.isArray(rows) || !rows.length) {
      if (list) list.innerHTML = "<p>同期データがありません。index から同期してください。</p>";
      return;
    }

    if (list) list.innerHTML = "";

    function updateProgress() {
      const total = rows.length;
      const done = rows.filter(r => r.checked).length;
      if (progressText) {
        progressText.textContent = `${done} / ${total}`;
      }
    }

    updateProgress();

    rows.sort((a, b) => {
      const pa = String(a.plate || "");
      const pb = String(b.plate || "");
      return pa.localeCompare(pb, "ja");
    });

    saveCity(city, rows);

    for (const rec of rows) {
      const row = document.createElement("div");
      row.className = `row ${rowBg(rec)}`;

      const left = document.createElement("div");
      left.className = "left";

      const topLeft = document.createElement("div");
      topLeft.className = "top-left";

      const idSpan = document.createElement("span");
      idSpan.className = "id";
      idSpan.textContent = (rec.ui_index || "").toString();

      const chkLabel = document.createElement("label");
      chkLabel.className = "chk-label";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!rec.checked;

      const chkMark = document.createElement("span");
      chkMark.className = "chk-mark";

      chkLabel.appendChild(chk);
      chkLabel.appendChild(chkMark);

      topLeft.appendChild(idSpan);
      topLeft.appendChild(chkLabel);

      const dtDiv = document.createElement("div");
      dtDiv.className = "datetime";

      const updateDateTime = () => {
        if (rec.last_inspected_at) {
          const ymd = rec.last_inspected_at;
          dtDiv.textContent = ymd;
          dtDiv.style.display = "block";
        } else {
          dtDiv.innerHTML = "";
          dtDiv.style.display = "none";
        }
      };
      updateDateTime();

      chk.addEventListener("change", () => {
        const msg = chk.checked
          ? "チェックを付けます。よろしいですか？"
          : "チェックを外します。よろしいですか？";
        if (!confirm(msg)) {
          chk.checked = !chk.checked;
          return;
        }
        if (chk.checked) {
          rec.checked = true;
          // 時刻は廃止し、日付のみ（yyyy-mm-dd）を保存
          rec.last_inspected_at = new Date().toISOString().slice(0, 10);
        } else {
          rec.checked = false;
          rec.last_inspected_at = "";
        }
        updateDateTime();
        row.className = `row ${rowBg(rec)}`;
        persistCityRec(city, rec);
        // チェックON/OFFに応じて、検査対象 city の全件を inspectionlog へ送信
        try {
          const _p = pushInspectionAll(city);
          if (_p && typeof _p.catch === "function") {
            _p.catch((e) => console.error(e));
          }
        } catch (e) {
          console.error(e);
        }
        updateProgress();
      });

      left.appendChild(topLeft);
      left.appendChild(dtDiv);

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

      const right = document.createElement("div");
      right.className = "right";

      const sel = document.createElement("select");
      sel.className = "status-select";

      const statusOptions = [
        ["",       "通常"],
        ["7days",  "7日ルール"],
        ["stop",   "停止"],
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
      });

      const tireBtn = document.createElement("button");
      tireBtn.className = "tire-btn";
      tireBtn.textContent = "点検";
      tireBtn.addEventListener("click", () => {
        const params = new URLSearchParams({
          station:    rec.station || "",
          model:      rec.model   || "",
          plate_full: rec.plate   || ""   // ★ ここだけ plate_full に変更
        });
        const url = `${TIRE_APP_URL}?${params.toString()}`;
        window.open(url, "_blank");
      });

      right.appendChild(sel);
      right.appendChild(tireBtn);

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
