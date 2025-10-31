// v8u 巡回アプリ / JST基準・初期同期=GET / 同期=POST→GET
(() => {
  "use strict";

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const APP_VERSION = "v8u";
  const LS_KEY_DATA = "junkai:data";
  const LS_KEY_PENDING = "junkai:pending"; // 送信待ち変更

  const qs = (s, r=document) => r.querySelector(s);

  function jstTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`; // JST日付のみ
  }

  function within7d(dateStr) {
    if (!dateStr) return false;
    const parts = dateStr.split(/[-/]/).map(Number);
    const d = new Date(parts[0], (parts[1]-1), parts[2]);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const diff = now - d; // JSTローカル
    return diff < 7*24*60*60*1000;
  }

  function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  function loadLS(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def; }catch(_){ return def; } }

  async function getJSON(url){
    const res = await fetch(url + (url.includes("?")?"&":"?") + `_=${Date.now()}`, { cache:"no-store" });
    if(!res.ok) throw new Error("GET failed");
    return await res.json();
  }

  async function postJSON(url, body){
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error("POST failed");
    return await res.json().catch(()=> ({}));
  }

  function normalizeRecord(raw){
    // できる限り柔軟にキーを拾う（日本語/英語混在対策）
    const r = {};
    const g = (keys, def="") => {
      for(const k of keys){ if (k in raw && raw[k] != null && `${raw[k]}`.trim() !== "") return String(raw[k]); }
      return def;
    };
    r.id       = g(["id","ID","車両ID","plate_id","plate_full"]);
    r.station  = g(["ステーション","station","ステーション名","Station"]);
    r.city     = g(["市区町村","city","所在地","エリア"]);
    r.model    = g(["車種","model","車名"]);
    r.note     = g(["備考","note","備考欄"]);
    r.status   = g(["status","ステータス"], ""); // "", "checked"等
    r.last     = g(["last_inspected_at","最終点検日","last","last_at","date"], "");
    // 日付を YYYY-MM-DD に揃える（JST）
    if (r.last && /^\d{4}-\d{2}-\d{2}$/.test(r.last) === false) {
      const m = r.last.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m) {
        const y = m[1], mo = m[2].padStart(2,"0"), d = m[3].padStart(2,"0");
        r.last = `${y}-${mo}-${d}`;
      } else {
        r.last = "";
      }
    }
    return r;
  }

  function cityMatch(rec, page){
    if (page === "index") return true;
    // cityが無ければ station/所在地から推測
    const label = (rec.city || rec.station || "").toString();
    if (page === "yamato") return /大和/.test(label);
    if (page === "ebina")  return /海老名/.test(label);
    if (page === "chofu")  return /調布/.test(label);
    return true;
  }

  function render(list, page){
    const wrap = qs("#list");
    wrap.innerHTML = "";
    const frag = document.createDocumentFragment();
    for(const rec of list){
      if (!cityMatch(rec, page)) continue;
      const card = document.createElement("article");
      card.className = "card";
      const ok = rec.status === "checked" && within7d(rec.last);
      const bdgClass = ok ? "badge ok" : (within7d(rec.last) ? "badge warn" : "badge");
      const lastLabel = rec.last ? rec.last.replaceAll("/","-") : "—";

      card.innerHTML = `
        <div class="row">
          <div>
            <div><strong>${rec.station || "-"}</strong></div>
            <div class="note">${rec.model || ""} / ${rec.id || ""}</div>
          </div>
          <div class="${bdgClass}">${within7d(rec.last) ? "7日以内" : "要確認"}</div>
        </div>
        <div class="row" style="margin-top:8px">
          <div class="note">最終点検日: <span>${lastLabel}</span></div>
          <div>
            <label style="font-size:13px">
              <input type="checkbox" data-id="${rec.id}" ${rec.status==="checked"?"checked":""}/>
              チェック済みにする
            </label>
          </div>
        </div>
      `;
      frag.appendChild(card);
    }
    wrap.appendChild(frag);

    wrap.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
      chk.addEventListener('change', (e)=>{
        const id = e.currentTarget.getAttribute("data-id");
        toggleChecked(id, e.currentTarget.checked);
      });
    });
  }

  function toggleChecked(id, checked){
    const data = loadLS(LS_KEY_DATA, []);
    const rec = data.find(r => r.id === id);
    if (!rec) return;
    if (checked){
      rec.status = "checked";
      rec.last = jstTodayStr();
    } else {
      rec.status = "";
    }
    saveLS(LS_KEY_DATA, data);
    // pending に記録
    const pend = loadLS(LS_KEY_PENDING, {});
    pend[id] = { id, status: rec.status, last: rec.last };
    saveLS(LS_KEY_PENDING, pend);
    // 画面更新（現在ページで再描画）
    const page = document.body.getAttribute("data-page") || "index";
    render(data, page);
  }

  async function initialSync(page){
    setStatus("初期同期中…"); progress(10);
    try{
      const json = await getJSON(GAS_URL); // GETのみ
      progress(50);
      const list = Array.isArray(json) ? json.map(normalizeRecord) :
                   Array.isArray(json?.rows) ? json.rows.map(normalizeRecord) : [];
      saveLS(LS_KEY_DATA, list);
      saveLS(LS_KEY_PENDING, {});
      progress(100);
      render(list, page);
      setStatus("初期同期完了");
    } catch(e){
      console.error(e);
      setStatus("通信または解析エラー");
      progress(0,true);
    }
  }

  async function syncNow(page){
    setStatus("同期中…"); progress(20);
    const pend = loadLS(LS_KEY_PENDING, {});
    const changes = Object.values(pend);
    try{
      // POST → 受領後 GET
      await postJSON(GAS_URL + "?action=push", { changes, ts: Date.now() });
      progress(60);
      const json = await getJSON(GAS_URL);
      const list = Array.isArray(json) ? json.map(normalizeRecord) :
                   Array.isArray(json?.rows) ? json.rows.map(normalizeRecord) : [];
      saveLS(LS_KEY_DATA, list);
      saveLS(LS_KEY_PENDING, {});
      progress(100);
      render(list, page);
      setStatus("同期完了");
    }catch(e){
      console.error(e);
      setStatus("通信または解析エラー");
      progress(0,true);
    }
  }

  function setStatus(s){ const el = qs("#status"); if (el) el.textContent = s; }
  function progress(p, hide){
    const wrap = qs(".progress-wrap"); const bar = qs("#progress");
    if (!wrap || !bar) return;
    if (hide){ wrap.hidden = false; bar.style.width = "0%"; wrap.hidden = true; return; }
    wrap.hidden = false; bar.style.width = `${Math.max(0,Math.min(100,p))}%`;
    if (p >= 100){ setTimeout(()=>{ wrap.hidden = true; bar.style.width="0%"; }, 400); }
  }

  function wire(page){
    qs("#version")?.replaceChildren(APP_VERSION);
    qs("#btn-init")?.addEventListener("click", ()=> initialSync(page));
    qs("#btn-sync")?.addEventListener("click", ()=> syncNow(page));
  }

  window.Junkai = {
    init(page){
      wire(page);
      // 起動時はローカル表示（無ければ空）
      const list = loadLS(LS_KEY_DATA, []);
      render(list, page);
    }
  };
})();
