// ★バージョン v10j 用の修正が適用されています (非同期処理分離)

var Junkai = {}; // グローバルスコープにJunkaiオブジェクトを定義

try { 

(function(){ 

  var GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec"; 
  var CITIES = ["大和市","海老名市","調布市"];
  var PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  var TIMEOUT_MS = 15000;
  var DEBUG_ERRORS = true;

  // --- (ユーティリティ関数の定義: showError, toJSTDateOnly, readCity, updateIndexCounts など) ---
  // v10iのすべての関数定義がここに続く前提

  // ===================================
  // ===== 互換性強化されたAPI Calls =====
  // ===================================

  // Promiseを使ったfetchヘルパー (v10hベースの互換性の高い書き方)
  function fetchAPI(url, method, body) {
    return new Promise(function(resolve, reject) {
        var ctl = new AbortController();
        var t = setTimeout(function() { ctl.abort(); }, TIMEOUT_MS);
        
        var fetchOptions = { method: method, signal: ctl.signal };
        if (body) {
            fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            fetchOptions.body = body;
        }

        fetch(url, fetchOptions)
            .then(function(res) {
                clearTimeout(t);
                if(!res.ok){ return reject(new Error("HTTP Error! Status: " + res.status)); }
                return res.json();
            })
            .then(function(json) {
                if(!json.ok && json.error){ return reject(new Error("GAS Error: " + json.error)); }
                resolve(json);
            })
            .catch(function(e) {
                clearTimeout(t);
                if (e.name === 'AbortError') { e.message = 'Timeout'; }
                reject(e);
            });
    });
  }

  function pullData(sheetName){
    var url = GAS_URL + "?action=pull&sheet=" + encodeURIComponent(sheetName);
    return fetchAPI(url, 'GET');
  }
  
  // ===================================
  // ===== Core Logic (初期同期) =====
  // ===================================

  Junkai.initialSync = function() {
    if(!confirm('初期同期を行います。現在のローカルデータはリセットされますが、よろしいですか？')) return; 

    document.getElementById('initSyncBtn').disabled = true;
    showProgress(true, 5, 'リセット中...');
    
    CITIES.forEach(function(c) { localStorage.removeItem(LS_KEY(c)); });
    Junkai.updateIndexCounts();
    
    showProgress(true, 10, '初期データ取得中 (全体管理)');
    
    // Promiseチェーンの開始
    pullData('全体管理')
        .then(function(json) {
            showProgress(true, 40, 'データ処理中');
            
            var arr = json ? json.data : undefined;
            if(!arr || arr.length === 0){
                setStatusText('初期同期完了: データがありません。');
                showProgress(false);
                document.getElementById('initSyncBtn').disabled = false;
                return;
            }

            // ... (データ処理と保存のロジックはv10iと同様に続く) ...
            
            // 処理成功後のリロード
            return sleep(500).then(function() { location.reload(); });
        })
        .catch(function(e) {
            document.getElementById('initSyncBtn').disabled = false;
            showError((e.message || '不明なエラー'), '初期同期失敗');
        });
  };
  
  // ... (Junkai.syncAll, Junkai.initCity は v10iと同様に定義) ...
  
  // ===================================
  // ===== 初期化処理 =====
  // ===================================

  Junkai.initIndex = function(){
    // イベントバインド: DOMContentLoadedで実行される
    var initBtn = document.getElementById('initSyncBtn');
    var syncBtn = document.getElementById('syncBtn');
    
    // ★修正: イベントリスナーを直接バインド
    if (initBtn) initBtn.addEventListener('click', Junkai.initialSync);
    if (syncBtn) syncBtn.addEventListener('click', Junkai.syncAll);
    // ... (他の初期化ロジック)
    
    // カウンターの初期描画
    Junkai.updateIndexCounts(); 
  };
  
  // ... (他の関数をJunkaiにバインド) ...

})(); 

} catch (e) {
    // 致命的な初期化エラーをキャッチ
    var errorMsg = "Fatal Init Error: " + (e.message || '不明なエラー');
    // DOMがロードされているか確認し、可能であればエラーモーダルを表示
    window.addEventListener('load', function() {
        var m = document.getElementById('errorModal');
        if (m) {
            // ... (エラーモーダル表示ロジック) ...
        } else {
            alert(errorMsg); 
        }
    });
}
