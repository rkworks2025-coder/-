// 巡回アプリ app.js
// version: s1k（初期同期専用／inspectionlog連携なし）
// 前提ヘッダー（全体管理タブの英語表記）
// A: area, B: city, C: address, D: station, E: model,
// F: plate, G: note, H: operator

const Junkai = (() => {

  // ===== 設定 =====
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";

  // 対応する city 一覧（index.html 側で使う）
  const CITIES = ["大和市", "海老名市", "調布市"];

  // city ごとの表示用プレフィックス
  const PREFIX = {
    "大和市": "Y",
    "海老名市": "E",
    "調布市": "C"
  };

  // localStorage キー
  function lsKey(city) {
    return `junkai:${city}`;
  }

  // ===== 共通ユーティリティ =====

  // JSON safe parse
  function safeParse(jsonText, fallback) {
    try {
      const v = JSON.parse(jsonText);
      return v;
    } catch (e) {
      return fallback;
    }
  }

  // city データ読込
  function readCity(city) {
    const raw = localStorage.getItem(lsKey(city));
    if (!raw) return [];
    const arr = safeParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  // city データ保存
  function saveCity(city, arr) {
    localStorage.setItem(lsKey(city), JSON.stringify(arr));
  }

  // UI index 振り直し
  function applyUiIndex(city, arr) {
    const prefix = PREFIX[city] || "";
    arr.forEach((rec, idx) => {
      const n = idx + 1;
      rec.ui_index = `${prefix}${String(n).padStart(3, "0")}`;
    });
  }

  // 7日以内判定
  function within7days(lastInspected) {
    if (!lastInspected) return false;
    const t = Date.parse(lastInspected);
    if (!Number.isFinite(t)) return false;

    const now = Date.now();
    const diff = now - t;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return diff <= sevenDays;
  }

  // 行背景色
  function rowBg(rec) {
    if (rec.status === "stop") {
      return "bg-gray";
    }
    if (rec.status === "skip") {
      return "bg-yellow";
    }
    if (rec.checked) {
      return "bg-pink";
    }
    if (within7days(rec.last_inspected_at)) {
      return "bg-blue";
    }
    return "bg-none";
  }

  // ===== 進捗カウンタ =====

  // city ごとのカウント
  function countCity(arr) {
    let done = 0;
    let stop = 0;
    let skip = 0;
    let total = arr.length;

    for (const rec of arr) {
      if (rec.status === "stop") {
        stop++;
      } else if (rec.status === "skip") {
        skip++;
      }
      if (rec.checked) {
        done++;
      }
    }
    return { done, stop, skip, total };
  }

  // 全体再計算
  function repaintCounters() {
    const map = {
      "大和市":   { done: "yamatoDone", stop: "yamatoStop", skip: "yamatoSkip", total: "yamatoTotal", rem: "yamatoRem" },
      "海老名市": { done: "ebinaDone",  stop: "ebinaStop",  skip: "ebinaSkip",  total: "ebinaTotal",  rem: "ebinaRem"  },
      "調布市":   { done: "chofuDone",  stop: "chofuStop",  skip: "chofuSkip",  total: "chofuTotal",  rem: "chofuRem"  }
    };

    let overallTotal = 0;
    let overallDone  = 0;
    let overallStop  = 0;
    let overallSkip  = 0;

    for (const city of CITIES) {
      const arr = readCity(city);
      const cnt = countCity(arr);

      overallTotal += cnt.total;
      overallDone  += cnt.done;
      overallStop  += cnt.stop;
      overallSkip  += cnt.skip;

      const m = map[city];
      document.getElementById(m.done).textContent  = cnt.done;
      document.getElementById(m.stop).textContent  = cnt.stop;
      document.getElementById(m.skip).textContent  = cnt.skip;
      document.getElementById(m.total).textContent = cnt.total;
      document.getElementById(m.rem).textContent   = (cnt.total - cnt.done - cnt.skip);
    }

    document.getElementById("allDone").textContent  = overallDone;
    document.getElementById("allStop").textContent  = overallStop;
    document.getElementById("allSkip").textContent  = overallSkip;
    document.getElementById("allTotal").textContent = overallTotal;
    document.getElementById("allRem").textContent   = (overallTotal - overallDone - overallSkip);

    const hint = document.getElementById("overallHint");
    if (hint) {
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "まだ同期されていません";
    }
  }

  // ----- inspectionlog 連携（s1u用）ここから -----
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

      // ここでは「送れたかどうか」だけ軽くログに出しておく
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
  // ----- inspectionlog 連携（s1u用）ここまで -----

  // ===== index.html 用：初期同期のみ（リセット付き） =====
  async function initIndex() {
    repaintCounters();

    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!confirm("全エリアの最新リストを取得し、ローカルデータをリセットします。よろしいですか？")) {
        return;
      }

      btn.disabled = true;
      btn.textContent = "同期中…";

      try {
        const url = `${GAS_URL}?action=init`;
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) {
          alert("初期同期に失敗しました（HTTP エラー）。");
          return;
        }

        const text = await res.text();
        const data = safeParse(text, null);
        if (!Array.isArray(data)) {
          alert("初期同期に失敗しました（データ形式エラー）。");
          return;
        }

        // city ごとに分割
        const grouped = {};
        for (const city of CITIES) {
          grouped[city] = [];
        }

        for (const row of data) {
          const city = row.city;
          if (!CITIES.includes(city)) continue;

          grouped[city].push({
            area:      row.area      || "",
            city:      row.city      || "",
            address:   row.address   || "",
            station:   row.station   || "",
            model:     row.model     || "",
            plate:     row.plate     || "",
            note:      row.note      || "",
            operator:  row.operator  || "",
            status:    row.status    || "",
            checked:   !!row.checked,
            last_inspected_at: row.last_inspected_at || ""
          });
        }

        // UI index を振ってローカル保存
        for (const city of CITIES) {
          const arr = grouped[city];
          applyUiIndex(city, arr);
          saveCity(city, arr);
        }

        repaintCounters();
        alert("初期同期が完了しました。");
      } catch (e) {
        console.error(e);
        alert("初期同期に失敗しました（通信エラー）。");
      } finally {
        btn.disabled = false;
        btn.textContent = "初期同期";
      }
    });
  }

  // ===== city ページ用：リスト描画 =====

  // 最終点検日ラベル更新（city ページ用）
  function updateDateTime() {
    const city = document.body.dataset.city;
    if (!city) return;

    const list = document.getElementById("carList");
    if (!list) return;

    const arr = readCity(city);
    const items = list.querySelectorAll(".car-row");

    for (const row of items) {
      const ui = row.dataset.uiIndex;
      if (!ui) continue;

      const rec = arr.find(r => r.ui_index === ui);
      if (!rec) continue;

      const dateEl = row.querySelector(".last-inspected");
      if (dateEl) {
        dateEl.textContent = rec.last_inspected_at || "";
      }
      row.className = `car-row ${rowBg(rec)}`;
    }

    repaintCounters();
  }

  function initCity() {
    const city = document.body.dataset.city;
    if (!city) return;

    const list = document.getElementById("carList");
    if (!list) return;

    const arr = readCity(city);

    list.innerHTML = "";

    for (const rec of arr) {
      const row = document.createElement("div");
      row.className = `car-row ${rowBg(rec)}`;
      row.dataset.uiIndex = rec.ui_index || "";

      // 左カラム（station / model / plate / 日付）
      const left = document.createElement("div");
      left.className = "left";

      const topLeft = document.createElement("div");
      topLeft.className = "top-left";

      const st = document.createElement("div");
      st.className = "station";
      st.textContent = rec.station || "";

      const mp = document.createElement("div");
      mp.className = "model-plate";
      const mSpan = document.createElement("span");
      mSpan.className = "model";
      mSpan.textContent = rec.model || "";
      const pSpan = document.createElement("span");
      pSpan.className = "plate";
      pSpan.textContent = rec.plate || "";
      mp.appendChild(mSpan);
      mp.appendChild(pSpan);

      const uiSpan = document.createElement("span");
      uiSpan.className = "ui-index";
      uiSpan.textContent = rec.ui_index || "";

      topLeft.appendChild(st);
      topLeft.appendChild(mp);
      topLeft.appendChild(uiSpan);

      const dtDiv = document.createElement("div");
      dtDiv.className = "date-wrapper";

      const dtLabel = document.createElement("span");
      dtLabel.className = "date-label";
      dtLabel.textContent = "最終点検日：";

      const dtValue = document.createElement("span");
      dtValue.className = "last-inspected";
      dtValue.textContent = rec.last_inspected_at || "";

      dtDiv.appendChild(dtLabel);
      dtDiv.appendChild(dtValue);

      // 最初の描画時に「7日ルール」による色を反映
      if (rec.last_inspected_at) {
        const last = Date.parse(rec.last_inspected_at);
        if (Number.isFinite(last)) {
          const diff = Date.now() - last;
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (diff > sevenDays) {
            // 7日を超えていたら、背景色は「未点検扱い」（bg-none）に戻す
            row.className = "car-row bg-none";
          }
        }
      }

      // 右上のチェックボックス
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!rec.checked;
      chk.className = "check";

      const chkLabel = document.createElement("label");
      chkLabel.className = "check-label";
      chkLabel.appendChild(chk);
      chkLabel.appendChild(document.createTextNode("チェック済"));

      // 上段まとめ
      left.appendChild(topLeft);
      left.appendChild(dtDiv);

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
        row.className = `car-row ${rowBg(rec)}`;
        persistCityRec(city, rec);

        syncInspectionAll();   // ★ inspectionlog 連携（全エリア同期）
      });

      // 中央（ステーション名／車種・ナンバー）
      const mid = document.createElement("div");
      mid.className = "mid";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = rec.station || "";

      const modelLine = document.createElement("div");
      modelLine.className = "model-line";
      modelLine.textContent = `${rec.model || ""} ／ ${rec.plate || ""}`;

      mid.appendChild(title);
      mid.appendChild(modelLine);

      // 右（status + タイヤボタン）
      const right = document.createElement("div");
      right.className = "right";

      const statusLabel = document.createElement("div");
      statusLabel.className = "status-label";
      statusLabel.textContent = "ステータス：";

      const sel = document.createElement("select");
      sel.className = "status-select";

      const statusOptions = [
        { value: "",      label: "通常" },
        { value: "stop",  label: "稼働停止" },
        { value: "skip",  label: "巡回不要" }
      ];

      const current = rec.status || "";
      for (const { value, label } of statusOptions) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        if (current === value) o.selected = true;
        sel.appendChild(o);
      }

      sel.addEventListener("change", () => {
        rec.status = sel.value || "";
        updateDateTime();
        row.className = `car-row ${rowBg(rec)}`;
        persistCityRec(city, rec);
        syncInspectionAll();   // ★ status変更もinspectionlogへ反映
      });

      const tireBtn = document.createElement("button");
      tireBtn.className = "tire-btn";
      tireBtn.textContent = "タイヤ点検へ";

      tireBtn.addEventListener("click", () => {
        const params = new URLSearchParams({
          station:    rec.station || "",
          model:      rec.model   || "",
          plate_full: rec.plate   || ""
        });
        const url = `${TIRE_APP_URL}?${params.toString()}`;
        window.open(url, "_blank");
      });

      right.appendChild(statusLabel);
      right.appendChild(sel);
      right.appendChild(tireBtn);

      row.appendChild(left);
      row.appendChild(chkLabel);
      row.appendChild(mid);
      row.appendChild(right);

      list.appendChild(row);
    }

    repaintCounters();
  }

  // city ページでのレコード保存（チェックやステータス変更時）
  function persistCityRec(city, rec) {
    const arr = readCity(city);
    if (!Array.isArray(arr)) return;

    const idx = arr.findIndex(r => r.ui_index === rec.ui_index);
    if (idx === -1) return;

    arr[idx] = rec;
    saveCity(city, arr);
  }

  // 公開 API
  return {
    initIndex,
    initCity
  };

})();
