// 巡回アプリ app.js
// version: s3b（マスタ設定連動型）

const Junkai = (() => {

  // ===== 設定 =====
  // 以前の固定リスト(CITIES/PREFIX)は廃止し、GASからロードします
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const LS_CONFIG_KEY = "junkai:config";
  const TIMEOUT_MS = 15000;

  // 実行時にGASから取得した設定を保持する変数
  let appConfig = []; 

  // ===== utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const LS_KEY = (c) => `junkai:city:${c}`; // キーは日本語名のまま維持(互換性のため)

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

  // ===== 設定ロード処理 =====
  async function loadConfig() {
    // まずローカルキャッシュを確認
    const cached = localStorage.getItem(LS_CONFIG_KEY);
    if (cached) {
      try {
        appConfig = JSON.parse(cached);
      } catch(e) { appConfig = []; }
    }

    // 画面更新(キャッシュ分で先行表示)
    if(appConfig.length > 0 && document.getElementById("city-list-container")) {
       renderIndexButtons();
       repaintCounters();
    }

    // GASから最新設定を取得
    try {
      if(document.getElementById("statusText")) statusText("設定を確認中...");
      const json = await fetchJSONWithRetry(`${GAS_URL}?action=config`);
      if (json && Array.isArray(json.config)) {
        appConfig = json.config;
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(appConfig));
        // 更新があれば再描画
        if(document.getElementById("city-list-container")) renderIndexButtons();
        repaintCounters();
      }
    } catch(e) {
      console.warn("Config fetch failed, using cache", e);
    }
  }

  // ===== インデックス画面構築 =====
  function renderIndexButtons() {
    const container = document.getElementById("city-list-container");
    if(!container) return;
    container.innerHTML = "";

    appConfig.forEach(cfg => {
      // stopステータスなら表示しない
      if (cfg.status === 'stop') return;

      const slug = cfg.slug;  // yamato
      const name = cfg.name;  // 大和市
      
      // カード生成
      const a = document.createElement("a");
      a.className = "cardlink";
      a.href = `${slug}.html`; // リンク先: slug.html
      
      // ヘルプ担当等の場合、色を変えるなどのクラス付与も可能
      if (cfg.status === 'help') {
        a.style.borderColor = "#fb7185"; // ピンク枠などで区別(任意)
      }

      const h2 = document.createElement("h2");
      h2.textContent = name + (cfg.status === 'help' ? " (Help)" : "");

      const meta = document.createElement("div");
      meta.className = "meta";
      
      // カウンターID: slug-done, slug-stop...
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

  // UI Indexの割当 (設定からPrefixを取得)
  function applyUIIndex(city, arr) {
    // 設定からPrefixを探す
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

    // Configにある都市のみ集計
    appConfig.forEach(cfg => {
      const city = cfg.name; // 大和市
      const slug = cfg.slug; // yamato

      const arr = readCity(city);
      const cnt = countCity(arr);
      overallTotal += cnt.total;
      overallDone += cnt.done;
      overallStop += cnt.stop;
      overallSkip += cnt.skip;

      // ID: slug-done
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
      hint.textContent = overallTotal > 0 ? `総件数：${overallTotal}` : "まだ同期されていません";
    }
  }

  // ===== index.html 用：初期同期 =====
  async function initIndex() {
    // 1. 設定ロード & ボタン描画
    await loadConfig();
    statusText("設定完了。同期可能です。");

    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const ok = confirm("初期同期を実行します。現在の巡回データはリセットされます。よろしいですか？");
      if (!ok) return;

      // Configにある都市のデータのみクリア
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

        // バケツ分け
        const buckets = {};
        // Configにある都市名のバケツを用意
        appConfig.forEach(cfg => buckets[cfg.name] = []);

        for (const r of json.rows) {
          if (!r || typeof r !== "object") continue;
          const norm = normalizeRow(r);
          const cityName = norm.city;
          
          if (buckets[cityName]) {
            buckets[cityName].push(norm);
          } else {
            // Configにない都市がGASから来た場合（無視するか、あるいは保存するか。今回は無視）
            // console.warn("Unknown city:", cityName);
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

  // ★変更：initCityは都市名(日本語)ではなく、ConfigのSlugを受け取れるようにする
  // しかし既存HTMLとの互換性のため、第1引数が日本語ならそのまま、英字なら変換するロジックを入れる
  async function initCity(cityKey) {
    await loadConfig(); // 設定がないと始まらない

    // cityKeyが "yamato" (slug) か "大和市" (name) か判定して name に統一
    let cityName = cityKey;
    let targetCfg = appConfig.find(c => c.name === cityKey);
    if (!targetCfg) {
       // Slugで検索
       targetCfg = appConfig.find(c => c.slug === cityKey);
       if(targetCfg) cityName = targetCfg.name;
    }

    if (!targetCfg) {
      const h = document.getElementById("hint");
      if(h) h.textContent = "設定エラー：このエリアはConfigに存在しません";
      return;
    }

    const list = document.getElementById("list");
    const hint = document.getElementById("hint");
    if (!list || !hint) return;

    const arr = readCity(cityName);
    list.innerHTML = "";

    if (arr.length === 0) {
      hint.textContent = "データなし（トップページで同期してください）";
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
          rec.last_inspected_at = new Date().toISOString().slice(0, 10);
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
