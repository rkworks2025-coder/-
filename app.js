// 巡回アプリ app.js
// version: s2q（初期同期専用／inspectionlog連携なし）
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
        const text = raw.replace(/^\ufeff/, ""); // BOM除去
        const json = JSON.parse(text);
        return json;
      } catch (e) {
              (()=>{const h=document.getElementById("hint");if(h){const o=h.textContent;h.textContent="送信失敗";setTimeout(()=>h.textContent=o,1000);}})();
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
      arr[i].ui_index_num = i + 1;
      arr[i].ui_index = p + (i + 1);
    }
  }

  // シート1行 → 内部形式
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

      // 初期同期フェーズでは status はシートと無関係なローカル専用。
      // デフォルトは空文字（"normal"は使わない）。
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
        if (el) el.textContent = cnt[k];
      }
      const remCount = cnt.total - cnt.done - cnt.skip;
      const remEl = document.querySelector(m.rem);
      if (remEl) remEl.textContent = remCount;
    }

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
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "まだ同期されていません";
    }
  }

  // ===== index.html 用：初期同期のみ（リセット付き） =====
  async function initIndex() {
    repaintCounters();

    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      // 確認ダイアログ＋リセット
      const ok = confirm("初期同期を実行します。現在の巡回データはリセットされます。よろしいですか？");
      if (!ok) return;

      // 各エリアのローカルデータをクリア
      for (const city of CITIES) {
        localStorage.removeItem(LS_KEY(city));
      }

try {
        showProgress(true, 5);
        statusText("開始…");

        const url = `${GAS_URL}?action=pull&_=${Date.now()}`;
        statusText("GASへ問い合わせ中…");
        showProgress(true, 30);

        const json = await fetchJSONWithRetry(url, 2);
        showProgress(true, 60);

        if (!json || !Array.isArray(json.rows)) {
          throw new Error("bad-shape");
        }

        // cityごとにバケツ分け
        const buckets = { "大和市": [], "海老名市": [], "調布市": [] }; // 👈 修正済み

        for (const r of json.rows) {
          if (!r || typeof r !== "object") continue;

          // 期待するキー：area, city, address, station, model, plate, note, operator
          const norm = normalizeRow(r);
          const cityName = norm.city;
          if (!buckets[cityName]) continue;

          buckets[cityName].push(norm);
        }

        let wrote = 0;
        for (const city of CITIES) {
          const arr = buckets[city];
          if (arr.length > 0) {
            applyUIIndex(city, arr);
            saveCity(city, arr);
            wrote++;
          }
        }

        if (wrote === 0) {
          statusText("同期失敗：データが空でした（既存データは保持されていません）");
          showProgress(false);
          return;
        }

        repaintCounters();
        showProgress(true, 100);
        statusText(
          `同期完了：大和${buckets["大和市"].length || 0} / ` +
          `海老名${buckets["海老名市"].length || 0} / ` +
          `調布${buckets["調布市"].length || 0}`
        );
      } catch (e) {
              (()=>{const h=document.getElementById("hint");if(h){const o=h.textContent;h.textContent="送信失敗";setTimeout(()=>h.textContent=o,1000);}})();
console.error("sync error", e);
        statusText("同期失敗：通信または解析エラー（既存データはリセット済み）");
      } finally {
        setTimeout(() => showProgress(false), 400);
      }
    });
  }

  // ===== city ページ =====
  
  // ===== inspectionlog sync =====
  async function syncInspectionAll() {
    const all = [];
    
    for (const city of CITIES) {
      const arr = readCity(city);
      for (const rec of arr) all.push(rec);
    }
    (()=>{const el=document.getElementById("hint");if(el){const old=el.textContent;el.textContent=`送信:${all.length}`;setTimeout(()=>el.textContent=old,1000);}})();
try {
      const res = await fetch(`${GAS_URL}?action=syncInspection`, {
        method: "POST",

        body: JSON.stringify({ data: all })
      });
      await res.json();
          (()=>{const h=document.getElementById("hint");if(h){const o=h.textContent;h.textContent="送信成功";setTimeout(()=>h.textContent=o,1000);}})();
} catch (e) {
            (()=>{const h=document.getElementById("hint");if(h){const o=h.textContent;h.textContent="送信失敗";setTimeout(()=>h.textContent=o,1000);}})();
console.error("syncInspectionAll error", e);
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

  function initCity(city) {
    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    if (!list || !hint) return;

    const arr = readCity(city);
    list.innerHTML = "";

    if (arr.length === 0) {
      hint.textContent = "まだ同期されていません（インデックスの同期を押してください）";
      return;
    }

    hint.textContent = `件数：${arr.length}`;

    for (const rec of arr) {
      const row = document.createElement("div");
      row.className = `row ${rowBg(rec)}`;

      // 左カラム（インデックス＆チェック）
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

      // ▼▼▼ 追加機能：日付修正用の隠しInput（iOS対応強化版） ▼▼▼
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      // 修正: iOSで認識させるため 0x0 ではなく 1px サイズを確保。操作無効(pointer-events:none)も削除。
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

      // 日付部分タップでカレンダー起動
      dtDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!rec.checked) return;

        // iOS/Android互換性のための二段構え起動
        try {
            // まずフォーカスを当ててみる
            dateInput.focus();
            
            // 最新の起動メソッドを試行
            if (typeof dateInput.showPicker === "function") {
                dateInput.showPicker();
            } else {
                // 古いiOS/Webviewなどはこっち
                dateInput.click();
            }
        } catch (err) {
            // セキュリティ制限などで失敗したらclickにフォールバック
            dateInput.click();
        }
      });

      // カレンダーで日付が変更された時の処理
      dateInput.addEventListener("change", () => {
        if (!dateInput.value) return; 

        if (confirm("日付を変更します。よろしいですか？")) {
          rec.last_inspected_at = dateInput.value;
          updateDateTime();
          persistCityRec(city, rec);
          syncInspectionAll(); 
        } else {
          updateDateTime(); // キャンセル時は戻す
        }
      });
      // ▲▲▲ 追加機能終了 ▲▲▲

      left.appendChild(topLeft);
      left.appendChild(dtDiv);
      left.appendChild(dateInput);

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
          rec.last_inspected_at = new Date().toISOString().slice(0, 10);
        } else {
          rec.checked = false;
          rec.last_inspected_at = "";
        }
        updateDateTime();
        row.className = `row ${rowBg(rec)}`;
        persistCityRec(city, rec);
        syncInspectionAll();
        syncInspectionAll();
      });

      // 中央（ステーション名／車種・ナンバー）
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

      // 右カラム（ステータス＆タイヤボタン）
      const right = document.createElement("div");
      right.className = "rightcol";

      const sel = document.createElement("select");
      sel.className = "state";

      const statusOptions = [
        ["",       "通常"],
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
        syncInspectionAll();
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
        // 現在のウィンドウでページを置き換える
        location.href = url; // 👈 最終修正
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
