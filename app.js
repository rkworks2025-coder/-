// v8w - Classic UI / GET init, POST->GET sync
(() => {
  const GAS_URL =
    "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";

  const CITY_KEYS = ["yamato", "ebina", "chofu"];
  const LS = {
    city: (c) => `junkai:${c}:records`,
    status: (c) => `junkai:${c}:status`, // plate -> {state, ts}
  };

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    toast(msg) {
      const el = $("#toast");
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
      setTimeout(() => (el.hidden = true), 1800);
    },
    progress(on) {
      const el = $("#progress");
      if (!el) return;
      el.hidden = !on;
      if (!on) return;
      const bar = el.querySelector(".bar");
      let w = 5;
      bar.style.width = "5%";
      const id = setInterval(() => {
        w = Math.min(95, w + 7);
        bar.style.width = w + "%";
      }, 180);
      return () => {
        clearInterval(id);
        bar.style.width = "100%";
        setTimeout(() => (el.hidden = true), 150);
      };
    },
  };

  function saveJSON(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }
  function loadJSON(key, fallback) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  }

  // -------- GAS I/O --------
  async function pullCity(city) {
    const url = `${GAS_URL}?action=pull&city=${encodeURIComponent(
      city
    )}&_=${Date.now()}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await res.text();

    // 返却が JSON 文字列で来る想定（直叩きで確認した配列）
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      // もし余計な文字が混入しても配列っぽい部分を拾う
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start >= 0 && end > start) {
        data = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error("解析エラー");
      }
    }
    // 正規化
    const records = data.map((row) => normalizeRow(row));
    return records;
  }

  async function pushCity(city, payload) {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push", city, items: payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!out || out.ok === false) throw new Error("送信エラー");
    return out;
  }

  function normalizeRow(row) {
    // 返却キーの揺れ対策
    const station =
      row["ステーション名"] || row["station"] || row["ステーション"] || "";
    const plate =
      row["登録番号"] || row["plate"] || row["ナンバー"] || row["車両番号"] || "";
    const model = row["車種名"] || row["model"] || row["車種"] || "";
    const city =
      row["市区町村"] || row["city"] || row["エリア"] || row["TSエリア"] || "";
    const note = row["備考"] || row["note"] || "";
    return { station, plate, model, city, note };
  }

  // -------- Data helpers --------
  function getCityStatusMap(city) {
    return loadJSON(LS.status(city), {});
  }
  function setCityStatus(city, map) {
    saveJSON(LS.status(city), map);
  }

  function countSummary(city) {
    const recs = loadJSON(LS.city(city), []);
    const stat = getCityStatusMap(city);
    let ok = 0,
      stop = 0,
      skip = 0;
    for (const r of recs) {
      const s = stat[r.plate]?.state;
      if (s === "済") ok++;
      else if (s === "停") stop++;
      else if (s === "不要") skip++;
    }
    const total = recs.length;
    const remain = total - (ok + stop + skip);
    return { ok, stop, skip, total, remain };
  }

  // -------- UI mount --------
  function renderIndex() {
    const host = $("#cards");
    if (!host) return;
    host.innerHTML = "";
    const names = {
      yamato: "大和市",
      ebina: "海老名市",
      chofu: "調布市",
      all: "全エリア",
    };
    const mkCard = (cityKey, label) => {
      const s = countSummary(cityKey);
      const el = document.createElement("section");
      el.className = "card";
      el.innerHTML = `
        <h2>${label}</h2>
        <div class="row">
          <span class="chip">済 ${s.ok}</span>
          <span class="chip">停 ${s.stop}</span>
          <span class="chip">不要 ${s.skip}</span>
          <span class="chip">総 ${s.total}</span>
          <span class="chip">残 ${s.remain}</span>
        </div>
      `;
      el.addEventListener("click", () => {
        if (cityKey === "yamato") location.href = "./yamato.html";
        if (cityKey === "ebina") location.href = "./ebina.html";
        if (cityKey === "chofu") location.href = "./chofu.html";
      });
      return el;
    };
    host.appendChild(mkCard("yamato", names.yamato));
    host.appendChild(mkCard("ebina", names.ebina));
    host.appendChild(mkCard("chofu", names.chofu));
    host.appendChild(mkCard("yamato", names.all)); // 全体はタップで大和へ(ダッシュボード用途)
  }

  function renderCity(city) {
    const host = $("#list");
    if (!host) return;
    const recs = loadJSON(LS.city(city), []);
    const stat = getCityStatusMap(city);
    host.innerHTML = "";
    for (const r of recs) {
      const s = stat[r.plate]?.state || "";
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <h3>${r.station || "—"} / ${r.plate || "—"}</h3>
        <p>${r.model || ""}　${r.note ? "｜" + r.note : ""}</p>
        <div class="actions">
          <button class="done" data-state="済"${s==="済"?" disabled":""}>済</button>
          <button class="stop" data-state="停"${s==="停"?" disabled":""}>停</button>
          <button class="skip" data-state="不要"${s==="不要"?" disabled":""}>不要</button>
        </div>
      `;
      item.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const map = getCityStatusMap(city);
          map[r.plate] = { state: btn.dataset.state, ts: new Date().toISOString() };
          setCityStatus(city, map);
          renderCity(city);
        });
      });
      host.appendChild(item);
    }
  }

  // -------- Actions --------
  async function doInitial(pageCity) {
    const stopProg = ui.progress(true);
    try {
      if (pageCity) {
        const recs = await pullCity(pageCity);
        saveJSON(LS.city(pageCity), recs);
      } else {
        // index：全エリア順に実行
        for (const c of CITY_KEYS) {
          const recs = await pullCity(c);
          saveJSON(LS.city(c), recs);
        }
      }
      ui.toast("初期同期 完了");
      if (pageCity) renderCity(pageCity);
      else renderIndex();
    } catch (e) {
      console.error(e);
      ui.toast("通信または解析エラー");
    } finally {
      stopProg && stopProg();
    }
  }

  async function doSync(pageCity) {
    const stopProg = ui.progress(true);
    const cities = pageCity ? [pageCity] : CITY_KEYS;
    try {
      // 送信（POST）
      for (const c of cities) {
        const recs = loadJSON(LS.city(c), []);
        const stat = getCityStatusMap(c);
        const payload = recs.map((r) => ({
          plate: r.plate,
          station: r.station,
          model: r.model,
          state: stat[r.plate]?.state || "",
          ts: stat[r.plate]?.ts || "",
        }));
        await pushCity(c, payload);
      }
      // 受信（GET）で最新反映
      for (const c of cities) {
        const recs = await pullCity(c);
        saveJSON(LS.city(c), recs);
      }
      ui.toast("同期 完了");
      if (pageCity) renderCity(pageCity);
      else renderIndex();
    } catch (e) {
      console.error(e);
      ui.toast("通信または解析エラー");
    } finally {
      stopProg && stopProg();
    }
  }

  // -------- Boot --------
  window.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    const city = document.body.dataset.city || null;

    $("#btnInit")?.addEventListener("click", () => doInitial(city));
    $("#btnSync")?.addEventListener("click", () => doSync(city));

    if (page === "index") renderIndex();
    if (page === "city") renderCity(city);
  });
})();
