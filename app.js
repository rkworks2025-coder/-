window.JunkaiApp = {
  mountIndex: function(ctx){
    const { syncBtn, recalcBtn, statusText, progressModal, progressBar, cityCards, yamato, ebina, chofu } = ctx.els;
    const API = "https://script.google.com/macros/s/AKfycbzPYLa_qkxjqsW42IY5xIVjmZR-fCfgovr-jFiifQC9qKkMQ-I0TE8R2e4F1wAKzzlpYQ/exec";

    async function sync(){
      progressModal.classList.add("show");
      progressTitle.textContent = "同期中…";
      progressBar.style.width = "0%";
      try {
        const res = await fetch(API + "?action=pull");
        const json = await res.json();
        if(json.ok){
          let yamatoCount=0, ebinaCount=0, chofuCount=0;
          json.data.forEach(row=>{
            const city=row[0];
            if(city==="大和市") yamatoCount++;
            else if(city==="海老名市") ebinaCount++;
            else if(city==="調布市") chofuCount++;
          });
          document.querySelector(yamato.total).textContent = yamatoCount;
          document.querySelector(ebina.total).textContent  = ebinaCount;
          document.querySelector(chofu.total).textContent  = chofuCount;
          statusText.textContent = "同期完了";
        } else {
          statusText.textContent = "同期失敗";
        }
      }catch(e){
        statusText.textContent = "エラー: "+e;
      }
      progressModal.classList.remove("show");
    }

    if(syncBtn) syncBtn.addEventListener("click", sync);
    if(recalcBtn) recalcBtn.addEventListener("click", ()=>{ statusText.textContent="再計算しました"; });
  }
};