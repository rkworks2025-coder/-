// [前略: 変更のない定数・utility・設定処理などは省略せず維持]
// ★修正箇所: 541行目〜 executeTma 関数周辺

          function executeTma() {
            tmaBtn.disabled = true; tmaBtn.textContent = "遷移中";
            const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(-4);
            
            const params = new URLSearchParams({ 
              station: rec.station || "", 
              model: rec.model || "", 
              plate_full: rec.plate || "", 
              tma_plate: rec.plate, 
              tma_req_id: requestId 
            });

            // ★修正: パラメータにはPythonが期待する「短いURL」だけをセットして414エラーを回避
            const preloadedImgUrl = localStorage.getItem("junkai:preloaded_splash_url");
            if (preloadedImgUrl) {
              params.set("splash_img", preloadedImgUrl);
              // ★重要: ここでremoveItemをしない。遷移先のアプリが実体データを読み取れるようにするため。
            }

            location.href = `${WORK_APP_URL}?${params.toString()}`;
          }
// [後略: 変更のない tireBtn や init 処理などはそのまま維持]
