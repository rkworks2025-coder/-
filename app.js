window.JunkaiApp = {
  mountIndex: function(ctx){
    const { syncBtn, recalcBtn, statusText, progressModal, progressBar } = ctx.els;
    const progressTitle = document.getElementById("progressTitle");
    const yamSel = ctx.els.yamato; const ebiSel = ctx.els.ebina; const choSel = ctx.els.chofu;

    // ★現行のGAS Web App URL（ユーザー報告の最新版）
    const API = "https://script.google.com/macros/s/AKfycbzPYLa_qkxjqsW42IY5xIVjmZR-fCfgovr-jFiifQC9qKkMQ-I0TE8R2e4F1wAKzzlpYQ/exec";

    async function sync(){
      try {
        if (progressModal) progressModal.classList.add("show");
        if (progressTitle) progressTitle.textContent = "同期中…";
        if (progressBar) progressBar.style.width = "15%";
        const res = await fetch(API + "?action=pull", { cache: "no-store" });
        if (progressBar) progressBar.style.width = "55%";
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          let yamatoCount=0, ebinaCount=0, chofuCount=0;
          for (const row of json.data) {
            const city = (row[0]||"").trim();
            if (city === "大和市") yamatoCount++;
            else if (city === "海老名市") ebinaCount++;
            else if (city === "調布市") chofuCount++;
          }
          document.querySelector(yamSel.total).textContent = yamatoCount;
          document.querySelector(ebiSel.total).textContent  = ebinaCount;
          document.querySelector(choSel.total).textContent  = chofuCount;
          if (statusText) statusText.textContent = "同期完了";
        } else {
          if (statusText) statusText.textContent = "同期失敗（データ形式）";
        }
      } catch (e) {
        if (statusText) statusText.textContent = "同期エラー: " + e;
      } finally {
        if (progressBar) progressBar.style.width = "100%";
        setTimeout(()=>{ if (progressModal) progressModal.classList.remove("show"); }, 300);
      }
    }

    if (syncBtn) syncBtn.addEventListener("click", sync);
    if (recalcBtn) recalcBtn.addEventListener("click", ()=>{ if(statusText) statusText.textContent="再計算しました"; });
  }
};
