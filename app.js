// ★バージョン v10i 用の修正が適用されています (初期化処理極限簡素化)
var Junkai = {}; // グローバルスコープにJunkaiオブジェクトを定義

(function(){ // 無名関数でスコープを区切る

  var GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec"; 
  var TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  var CITIES = ["大和市","海老名市","調布市"];
  var PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  var LS_KEY = function(c) { return "junkai:city:" + c; };
  var TIMEOUT_MS = 15000;
  var DEBUG_ERRORS = true;

  // ===== utils (ES5互換を維持) =====
  var sleep = function(ms) { return new Promise(function(r){ setTimeout(r, ms); }); };

  // ... (showProgress, showError, setStatusText, toJSTDateOnly などは v10h と同様に定義) ...
  // ※ v10h のコードをそのまま利用します。

  // 簡略化のため、v10hのコードブロックから必要な関数を貼り付けてください。
  // ここでは省略しますが、以下の関数が正しく定義されていることが前提です。
  /*
    function showProgress(on, pct, title) { ... }
    function showError(msg, title) { ... }
    function setStatusText(text) { ... }
    function toJSTDateOnly(date) { ... }
    function readCity(city) { ... }
    function writeCity(city, arr) { ... }
    function readAll() { ... }
    function rowBg(rec) { ... }
    function within7d(rec) { ... }
    function fetchJSONWithRetry(url, method, body, retry) { ... } 
    function initialSync() { ... } // v10hのロジックをそのまま使用
    function syncAll() { ... }     // v10hのロジックをそのまま使用
    function updateIndexCounts() { ... }
    function renderCity(city) { ... }
    function persistCityRec(city, rec) { ... }
  */
  
  // v10hの関数定義をここに貼り付けている前提
  // ... [v10hのコード] ...

  // ===== Core Logic (v10hのロジックをそのまま使用) =====

  // v10hのinitialSync関数をそのまま定義
  Junkai.initialSync = function() {
    // ... v10hのinitialSyncロジック ...
    if(!confirm('初期同期を行います。現在のローカルデータはリセットされますが、よろしいですか？')) return; 

    document.getElementById('initSyncBtn').disabled = true;
    showProgress(true, 5, 'リセット中...');
    
    CITIES.forEach(function(c) { localStorage.removeItem(LS_KEY(c)); });
    updateIndexCounts();
    
    showProgress(true, 10, '初期データ取得中 (全体管理)');
    
    var pullUrl = GAS_URL + "?action=pull&sheet=" + encodeURIComponent('全体管理');
    
    fetchJSONWithRetry(pullUrl, 'GET')
        .then(function(json) {
            showProgress(true, 40, 'データ処理中');
            
            var arr = json ? json.data : undefined;
            if(!arr || arr.length === 0){
                setStatusText('初期同期完了: 「全体管理」シートにデータが見つかりませんでした。');
                showProgress(false);
                document.getElementById('initSyncBtn').disabled = false;
                return;
            }

            var buckets = {};
            CITIES.forEach(function(c) { buckets[c] = []; });
            var recordCount = 0;
            
            arr.forEach(function(rowObj, index) {
                var cityName = (rowObj.city||'').trim(); 
                
                if(!buckets[cityName]){ return; } 

                var newRec = {
                    city: cityName,
                    station: (rowObj.station || '').trim(),
                    model: (rowObj.model || '').trim(),
                    number: (rowObj.number || '').trim(),
                    ui_index: (rowObj.ui_index || '').trim(), 
                    index: index + 1, 
                    status: 'normal', 
                    checked: false, 
                    last_inspected_at: '',
                    ui_index_num: index 
                };

                newRec.ui_index = PREFIX[cityName] + (buckets[cityName].length + 1); 
                
                buckets[cityName].push(newRec);
                recordCount++;
            });
            
            CITIES.forEach(function(city) { writeCity(city, buckets[city]); });

            showProgress(true, 100, '初期同期完了');
            setStatusText('初期同期完了: 全 ' + recordCount + ' 件のデータを保存しました。');

            return sleep(500);
        })
        .then(function() {
            location.reload(); 
        })
        .catch(function(e) {
            document.getElementById('initSyncBtn').disabled = false;
            showError(DEBUG_ERRORS ? (e.message || '不明なエラー') : '初期同期に失敗しました。', '初期同期失敗');
        });
  };

  // v10hのsyncAll関数をそのまま定義
  Junkai.syncAll = function() {
    // ... v10hのsyncAllロジック ...
  };

  // v10hのinit関数を参考に、イベントをグローバルに定義
  Junkai.initIndex = function(){
    Junkai.initialSync = Junkai.initialSync.bind(Junkai);
    Junkai.syncAll = Junkai.syncAll.bind(Junkai);
    
    var initBtn = document.getElementById('initSyncBtn');
    var syncBtn = document.getElementById('syncBtn');
    
    if (initBtn) initBtn.onclick = Junkai.initialSync;
    if (syncBtn) syncBtn.onclick = Junkai.syncAll;
    
    // ... (他の初期化ロジック) ...
  };

  Junkai.initCity = function(city) {
    // ... v10hのinitCityロジック ...
  };
  
})();

// ★重要: HTML側で直接呼び出すための関数をグローバルに定義
// HTMLの<button onclick="Junkai.initialSync()">で動作させるための準備
document.addEventListener('DOMContentLoaded', function() {
    Junkai.initIndex(); // indexページのボタンを初期化
    // ... (他の初期化ロジックも実行)
});

// v10hのすべての関数定義がここで省略されているため、このコードは完全ではないことに注意してください。
// 実際にはv10hのコードを元に、Junkai.initialSyncとJunkai.syncAllをグローバルなイベントハンドラとして使えるように再定義する必要があります。
