// 巡回アプリ app.js Version: s7a
var Junkai = (() => {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const WORK_APP_URL = "https://rkworks2025-coder.github.io/work/";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/Tire_Check/";
  const LS_CONFIG_KEY = "junkai:config";
  const TIMEOUT_MS = 15000;

  // (中略: loadLocalConfig, renderList 等の既存ロジック)

  // TMAボタンのイベントリスナー部分の修正
  // tmaBtn.addEventListener("click", () => { ... }) 内
  /* 修正内容:
     1. requestIdを生成
     2. GASへPOST(awaitしない)
     3. 即座にWORK_APP_URLへ遷移し、URLパラメータにtma_plateとrequestIdを含める
  */
  // 具体的な実装箇所:
  function setupTmaButton(tmaBtn, rec, cityName) {
    tmaBtn.addEventListener("click", () => {
      const msg = `【${rec.plate}】\nTMA自動入力を実行しますか？\n※このまま作業管理アプリへ遷移します。`;
      if(!confirm(msg)) return;
      
      tmaBtn.disabled = true;
      tmaBtn.textContent = "送信中";

      const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
      const payload = { plate: rec.plate, mode: "tma", requestId: requestId };

      // 1回目は投げっぱなしで送信を試みる
      fetch(GAS_URL + "?action=triggerTMA", {
        method: "POST",
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(e => console.warn("Initial trigger background error:", e));

      // 待たずに作業管理アプリへバトンタッチ
      const params = new URLSearchParams({
        station: rec.station || "",
        model: rec.model || "",
        plate_full: rec.plate || "",
        tma_plate: rec.plate,      // バトン
        tma_req_id: requestId      // 整理券番号
      });
      location.href = `${WORK_APP_URL}?${params.toString()}`;
    });
  }

  // (その他 initIndex, initCity 等の全体構造はs6gを継承)
  return { initIndex, initCity };
})();
