[cite_start]// 巡回アプリ app.js Version: s7a [cite: 1]
var Junkai = (() => {
  [cite_start]const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec"; // [cite: 1]
  const WORK_APP_URL = "https://rkworks2025-coder.github.io/work/"; [cite_start]// [cite: 1]

  [cite_start]// (中略: loadLocalConfig, renderList 等の既存ロジックを保持 [cite: 1, 123])

  // ★TMAボタンのクリック処理を改修
  function setupTmaButton(tmaBtn, rec) {
    tmaBtn.addEventListener("click", () => {
      [cite_start]if(!confirm(`【${rec.plate}】\nTMA自動入力を実行しますか？`)) return; // [cite: 148]
      
      tmaBtn.disabled = true;
      tmaBtn.textContent = "遷移中";

      // 整理券番号を生成
      const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
      
      // 1. GASへ「投げっぱなし」で送信
      fetch(`${GAS_URL}?action=triggerTMA`, {
        method: "POST",
        body: JSON.stringify({ plate: rec.plate, requestId: requestId }),
        keepalive: true
      }).catch(e => console.warn("Background trigger error:", e));

      // 2. 待たずに作業管理アプリへ遷移 (整理券番号をバトンタッチ)
      const params = new URLSearchParams({
        station:    rec.station || "",
        model:      rec.model   || "",
        plate_full: rec.plate   || "",
        tma_plate:  rec.plate,      // 自動入力対象
        tma_req_id: requestId       // 整理券番号
      });
      location.href = `${WORK_APP_URL}?${params.toString()}`; [cite_start]// [cite: 150]
    });
  }
  
  [cite_start]// (以降、initCityなどの初期化ロジック内で setupTmaButton を呼び出すように構成 [cite: 160])
  return { initIndex, initCity };
})();
