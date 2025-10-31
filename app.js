/* 巡回アプリ v8v  通信安定＆7日ルール基準版
   - 初期同期: GET /?action=pull
   - 同期:     POST /?action=push  -> 成功後に GET /?action=pull
   - GAS_URL: 最新デプロイURL（リュウ指定）
*/
const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";

const Junkai = (() => {
  const LS_KEY = "junkai:vehicles";
  const LS_TS  = "junkai:ts";

  // --- Util ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const now = () => Date.now();

  function saveLocal(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data || []));
    localStorage.setItem(LS_TS, String(now()));
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
    catch(e){ return []; }
  }

  // 表記ゆれ吸収：日本語/英語/ケース違い対応
  function val(obj, keys) {
    for (const k of keys) {
      if (k in obj) return obj[k];
      const hit = Object.keys(obj).find(x => x.toLowerCase() === k.toLowerCase());
      if (hit) return obj[hit];
    }
    return "";
  }

  // 7日ルール（JSTでOK）
  function within7d(iso) {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    return (now() - t) < (7*24*60*60*1000);
  }

  // ISO生成はJST日付入力から安全に
  function toISOFromYYYYMMDD(yyyy_mm_dd) {
    // "2025-11-01" -> JST 00:00
    if (!yyyy_mm_dd) return "";
    const [y,m,d] = yyyy_mm_dd.split("-").map(s=>parseInt(s,10));
    if (!y || !m || !d) return "";
    // ローカル(JST)の 00:00 として作る
    const dt = new Date(y, m-1, d, 0, 0, 0, 0);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0,0,0,0).toISOString();
  }

  // --- 通信 ---
  async function httpGet(params) {
    const url = new URL(GAS_URL);
    Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, v));
    url.searchParams.set("_", String(now())); // cache bust
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return await res.json();
  }

  async function httpPost(params, body) {
    const url = new URL(GAS_URL);
    Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, v));
    url.searchParams.set("_", String(now()));
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) throw new Error(`POST ${res.status}`);
    return await res.json();
  }

  // GASのpull結果を内部形式に正規化
  function normalizeRecords(arr) {
    return (arr || []).map(row => {
      const station = val(row, ["ステーション名","station","ステーション","station_name"]);
      const car     = val(row, ["車番","plate","車両番号","car","number"]);
      const city    = val(row, ["エリア","area","地域","city"]);
      const lastRaw = val(row, ["last_inspected_at","最終点検日時","最終点検","last"]);
      const last    = lastRaw && /^\d{4}-\d{2}-\d{2}/.test(lastRaw)
        ? toISOFromYYYYMMDD(lastRaw.slice(0,10))
        : (lastRaw || ""); // すでにISOの可能性も許容

      const status  = val(row, ["status","ステータス","状態"]);
      return {
        station: String(station || "").trim(),
        plate:   String(car || "").trim(),
        city:    String(city || "").trim(),
        last_inspected_at: last,
        status:  String(status || "").trim()
      };
    });
  }

  // --- UI ---
  function qs(id){ return document.querySelector(id); }
  function setStatus(msg){ const el = qs("#syncStatus"); if (el) el.textContent = msg || ""; }

  function formatDateYMD(iso){
    if (!iso) return "-";
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd= String(d.getDate()).padStart(2,"0");
    return `${y}/${m}/${dd}`;
  }

  function renderList(records) {
    const host = qs("#list");
    if (!host) return;
    host.innerHTML = "";
    for (const r of records) {
      const ok = within7d(r.last_inspected_at);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row">
          <div class="title">${r.plate || "不明"}</div>
          <span class="badge ${ok ? "ok":"warn"}">${ok ? "7日以内":"要巡回"}</span>
        </div>
        <div class="meta">${r.station || ""} / ${r.city || ""}</div>
        <div class="meta">最終点検: ${formatDateYMD(r.last_inspected_at)}</div>
      `;
      host.appendChild(card);
    }
  }

  function calcSummary(records){
    const total = records.length;
    const within = records.filter(r => within7d(r.last_inspected_at)).length;
    const over = total - within;
    const a = id => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(id==="sumTotal"?total:id==="sumWithin"?within:over);
    };
    a("sumTotal"); a("sumWithin"); a("sumOver");
  }

  // --- Public Views ---
  async function runInitialSync() {
    try {
      setStatus("初期同期中…");
      // 全体管理から必要最小項目のみpull（GAS側で不要列も返るが問題ない）
      const json = await httpGet({ action: "pull" });
      const items = Array.isArray(json?.data) ? json.data : [];
      const norm = normalizeRecords(items);
      saveLocal(norm);
      calcSummary(norm);
      renderList(norm);
      setStatus("初期同期完了");
    } catch (e) {
      console.error(e);
      setStatus("通信または解析エラー");
    }
  }

  async function runSync() {
    try {
      setStatus("同期中…");
      const local = loadLocal();

      // 送信用に最小フィールドをPOST（GAS側でinspectionlogへ反映）
      const payload = local.map(r => ({
        plate: r.plate,
        last_inspected_at: r.last_inspected_at,
        status: r.status
      }));

      await httpPost({ action: "push" }, { rows: payload });

      // 直後にfresh pullで整合
      const fresh = await httpGet({ action: "pull" });
      const norm = normalizeRecords(Array.isArray(fresh?.data) ? fresh.data : []);
      saveLocal(norm);
      calcSummary(norm);
      renderList(norm);
      setStatus("同期完了");
    } catch (e) {
      console.error(e);
      setStatus("通信または解析エラー");
    }
  }

  function mountIndex(){
    const data = loadLocal();
    calcSummary(data);
    renderList(data);
  }
  function mountCity(cityName){
    const data = loadLocal().filter(r => (r.city||"") === cityName);
    renderList(data);
  }

  return {
    runInitialSync,
    runSync,
    mountIndex,
    mountCity
  };
})();
