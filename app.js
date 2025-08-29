/* Drop-in replacement for sync logic. */
const GAS_URL = "https://script.google.com/macros/s/AKfycbyLPjIJOmYeC7kyZikkWcY-CmWlHYwL2NJDD0GL78x8XEN5UkBRfLY9EeCPyPZD34_aVw/exec";

async function syncFromGas() {
  const url = GAS_URL + (GAS_URL.includes("?") ? "&" : "?") + "action=pull";
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      headers: {"Accept":"application/json,text/plain;q=0.9,*/*;q=0.8"}
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const raw = await res.text();

    let json;
    if (contentType.includes("application/json")) {
      json = JSON.parse(raw);
    } else {
      try { json = JSON.parse(raw); }
      catch (e) { throw new Error("非JSON応答: " + raw.slice(0, 280)); }
    }

    if (!json || (json.ok === false)) { throw new Error("GAS 側エラー: " + (json && (json.error || json.message) || "unknown")); }

    const payload = json.payload || json.data || json;
    if (!payload) throw new Error("payload が空です");

    try {
      localStorage.setItem("巡回マスタ", JSON.stringify(payload));
      localStorage.setItem("巡回マスタ_timestamp", new Date().toISOString());
    } catch (e) { console.warn("localStorage 保存失敗", e); }

    if (typeof window.rebindAreasFromMaster === "function") { window.rebindAreasFromMaster(payload); }
    alert("同期OK: データ取得に成功しました");
    return payload;
  } catch (err) {
    alert("同期失敗: " + err.message + "\nURL: " + url);
    throw err;
  }
}

window.syncFromGas = syncFromGas;

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#syncBtn");
  if (btn) btn.addEventListener("click", syncFromGas);
});
