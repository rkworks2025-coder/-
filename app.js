// v8z：v8k UIを完全維持しつつ、通信と振り分けだけを修正
var Junkai = (function(){

  var GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  var CITIES = ["大和市","海老名市","調布市"];
  function lsKey(city){ return "junkai:city:"+city; }

  var TIMEOUT_MS = 15000;

  function showProgress(show, pct){
    var modal = document.getElementById('progressModal');
    if(!modal) return;
    if(show){
      modal.classList.add('show');
      var bar = document.getElementById('progressBar');
      if(bar && typeof pct === 'number'){
        if(pct<0) pct=0; if(pct>100) pct=100;
        bar.style.width = pct+'%';
      }
    }else{
      modal.classList.remove('show');
      var bar2 = document.getElementById('progressBar');
      if(bar2) bar2.style.width = '0%';
    }
  }
  function status(s){
    var a = document.getElementById('statusText');
    var b = document.getElementById('statusTextModal');
    if(a) a.textContent = s;
    if(b) b.textContent = s;
  }
  function fetchJSON(url){
    var ctrl = new AbortController();
    var to = setTimeout(function(){ try{ctrl.abort('timeout');}catch(e){} }, TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal, cache:'no-store' })
      .then(function(res){
        clearTimeout(to);
        if(!res.ok) throw new Error('HTTP '+res.status);
        return res.json();
      });
  }
  function saveCity(city, arr){
    try{ localStorage.setItem(lsKey(city), JSON.stringify(arr||[])); }catch(e){}
  }
  function readCity(city){
    try{
      var s = localStorage.getItem(lsKey(city));
      return s ? JSON.parse(s) : [];
    }catch(e){ return []; }
  }

  function repaintCounters(){
    var sum = {done:0,stop:0,skip:0,total:0,rem:0};
    function fill(city, idprefix){
      var arr = readCity(city);
      var total = arr.length, done=0, stop=0, skip=0;
      for(var i=0;i<arr.length;i++){
        var r = arr[i]||{};
        if(r.status==='済') done++;
        else if(r.status==='停') stop++;
        else if(r.status==='不要') skip++;
      }
      var rem = Math.max(0, total - (done+stop+skip));
      var map = {done:'done', stop:'stop', skip:'skip', total:'total', rem:'rem'};
      for(var k in map){
        var el = document.getElementById(idprefix+'-'+map[k]);
        if(!el) continue;
        el.textContent = (k==='total'? total : (k==='rem'? rem : (k==='done'? done : (k==='stop'? stop : skip))));
      }
      sum.done+=done; sum.stop+=stop; sum.skip+=skip; sum.total+=total; sum.rem+=rem;
    }
    fill('大和市','yamato');
    fill('海老名市','ebina');
    fill('調布市','chofu');
    var setAll = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=String(v); };
    setAll('all-done', sum.done); setAll('all-stop', sum.stop);
    setAll('all-skip', sum.skip); setAll('all-total', sum.total); setAll('all-rem', sum.rem);
    var hint = document.getElementById('overallHint');
    if(hint) hint.textContent = sum.total>0 ? ('総件数：'+sum.total) : 'まだ同期されていません';
  }

  // ---- 正規化：全体管理（初期同期）からの1行 -> 内部レコード
  function normalizeFromAdminRow(o){
    // 期待：オブジェクト：{ステーション名, 市区町村, 車種(名), 登録番号, ...}
    var station = String(o['ステーション名']||'').trim();
    var city    = String(o['市区町村']||'').trim();
    var model   = String((o['車種名']!=null?o['車種名']:o['車種'])||'').trim();
    var plate   = String(o['登録番号']||'').trim();
    return {
      city: city,
      station: station,
      model: model,
      plate: plate,
      status: '',
      last_inspected: '',
      last_inspected_at: ''
    };
  }

  // ---- 正規化：InspectionLog からの1行 -> 内部レコード
  function normalizeFromLogRow(o){
    var station = String(o['ステーション名']||o['station']||'').trim();
    var city    = String(o['市区町村']||o['city']||'').trim();
    var model   = String((o['車種名']!=null?o['車種名']:o['車種']||o['model']||'')).trim();
    var plate   = String(o['登録番号']||o['plate']||'').trim();
    var status  = String(o['状態']||o['status']||'').trim();
    var last    = String(o['最終作業日']||o['last_inspected']||'').trim();
    var lastAt  = String(o['最終作業日時']||o['last_inspected_at']||'').trim();
    return {
      city: city,
      station: station,
      model: model,
      plate: plate,
      status: status,
      last_inspected: last,
      last_inspected_at: lastAt
    };
  }

  // ---- 初期同期：全体管理 GET → 市区町村で分配保存
  function doInitialSync(){
    status('初期同期開始…'); showProgress(true, 10);
    // リセット
    for(var i=0;i<CITIES.length;i++){ try{ localStorage.removeItem(lsKey(CITIES[i])); }catch(e){} }
    repaintCounters();

    var url = GAS_URL+'?action=pull&sheet='+encodeURIComponent('全体管理')+'&_='+(Date.now());
    status('全体管理 取得中…'); showProgress(true, 30);

    return fetchJSON(url).then(function(json){
      if(!Array.isArray(json)) throw new Error('invalid response (not array)');
      // 独立バケット（参照共有禁止）
      var buckets = { '大和市':[], '海老名市':[], '調布市':[] };
      for(var i=0;i<json.length;i++){
        var row = json[i];
        if(!row || typeof row!=='object') continue;
        var rec = normalizeFromAdminRow(row);
        if(buckets.hasOwnProperty(rec.city)) buckets[rec.city].push(rec);
      }
      // 保存
      saveCity('大和市',  buckets['大和市'].slice());
      saveCity('海老名市', buckets['海老名市'].slice());
      saveCity('調布市',  buckets['調布市'].slice());

      repaintCounters();
      status('初期同期完了'); showProgress(true, 95);
    }).catch(function(err){
      console.error(err);
      status('初期同期エラー');
    }).finally(function(){
      setTimeout(function(){ showProgress(false); }, 350);
    });
  }

  // ---- 同期：POST(push) → InspectionLog GET で反映
  function doSync(){
    status('データ送信中…'); showProgress(true, 18);
    // 全都市レコード結合
    var all = [];
    for(var i=0;i<CITIES.length;i++){
      var arr = readCity(CITIES[i]);
      if(Array.isArray(arr)) all = all.concat(arr);
    }
    // push
    var params = new URLSearchParams();
    params.append('action','push');
    params.append('data', JSON.stringify(all));

    return fetch(GAS_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: params.toString()
    }).catch(function(e){
      console.error('push error', e);
    }).then(function(){
      status('同期中…'); showProgress(true, 45);
      // pull InspectionLog
      var url = GAS_URL+'?action=pull&sheet='+encodeURIComponent('InspectionLog')+'&_='+(Date.now());
      return fetchJSON(url);
    }).then(function(json){
      if(!Array.isArray(json)) throw new Error('invalid response (log)');
      var buckets = { '大和市':[], '海老名市':[], '調布市':[] };
      for(var i=0;i<json.length;i++){
        var row = json[i];
        if(!row || typeof row!=='object') continue;
        var rec = normalizeFromLogRow(row);
        if(buckets.hasOwnProperty(rec.city)) buckets[rec.city].push(rec);
      }
      saveCity('大和市',  buckets['大和市'].slice());
      saveCity('海老名市', buckets['海老名市'].slice());
      saveCity('調布市',  buckets['調布市'].slice());
      repaintCounters();
      status('同期完了'); showProgress(true, 92);
    }).catch(function(err){
      console.error(err);
      status('同期エラー');
    }).finally(function(){
      setTimeout(function(){ showProgress(false); }, 350);
    });
  }

  // ---- 7日ルール（表示用）
  function within7d(iso){
    if(!iso) return false;
    var d = new Date(iso);
    if(!isFinite(d.getTime())) return false;
    var diff = (Date.now() - d.getTime())/86400000;
    return diff <= 7 + 1e-9;
  }

  // ---- Cityページ描画
  function persistCityRec(city, rec){
    var arr = readCity(city);
    var idx = -1;
    for(var i=0;i<arr.length;i++){ if(arr[i] && arr[i].plate===rec.plate){ idx=i; break; } }
    if(idx>=0) arr[idx]=rec; else arr.push(rec);
    saveCity(city, arr);
  }
  function mountCity(city){
    var list = document.getElementById('list');
    var hint = document.getElementById('hint');
    var arr = readCity(city);
    if(!Array.isArray(arr) || arr.length===0){
      if(hint) hint.textContent='同期後に表示されます。';
      return;
    }
    if(hint) hint.remove();

    for(var i=0;i<arr.length;i++){
      var rec = arr[i];

      var row = document.createElement('div'); row.className='row';

      var left = document.createElement('div'); left.className='leftcol';
      var leftTop = document.createElement('div'); leftTop.className='left-top';

      var idx = document.createElement('div'); idx.className='idx'; idx.textContent=String(i+1);
      var chk = document.createElement('input'); chk.type='checkbox'; chk.checked = rec.status==='済';
      chk.addEventListener('change', function(recCopy){
        return function(){
          recCopy.status = this.checked ? '済' : '';
          if(this.checked){
            var now = new Date();
            var yyyy = now.getFullYear();
            var mm = String(now.getMonth()+1).padStart(2,'0');
            var dd = String(now.getDate()).padStart(2,'0');
            recCopy.last_inspected = yyyy+'/'+mm+'/'+dd;
            recCopy.last_inspected_at = now.toISOString();
          }
          persistCityRec(city, recCopy);
        };
      }(rec));

      leftTop.appendChild(idx); leftTop.appendChild(chk); left.appendChild(leftTop);

      var mid = document.createElement('div'); mid.className='mid';
      var title = document.createElement('div'); title.className='title'; title.textContent = rec.station||'';
      var model = document.createElement('div'); model.className='model'; model.textContent = (rec.model||'')+'｜'+(rec.plate||'');
      mid.appendChild(title); mid.appendChild(model);

      var right = document.createElement('div'); right.className='rightcol';
      var btns = document.createElement('div'); btns.className='btns';

      var statusLine = document.createElement('div'); statusLine.className='statusline';
      var chip1 = document.createElement('span'); chip1.className='chip'; chip1.textContent = rec.status?('状態：'+rec.status):'状態：未';
      var chip2 = document.createElement('span'); chip2.className='chip'; chip2.textContent = within7d(rec.last_inspected_at)?'7日内':'7日超';
      statusLine.appendChild(chip1); statusLine.appendChild(chip2);

      var dtDiv = document.createElement('div'); dtDiv.className='datetime';
      if(rec.last_inspected_at){
        var d = new Date(rec.last_inspected_at);
        if(isFinite(d.getTime())){
          var yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
          dtDiv.innerHTML = yyyy+'<br>'+mm+'/'+dd;
        }
      }

      right.appendChild(btns);
      right.appendChild(statusLine);
      right.appendChild(dtDiv);

      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);

      list.appendChild(row);
    }
  }

  // ---- Index初期化
  function initIndex(){
    repaintCounters();

    var initBtn = document.getElementById('initSyncBtn');
    if(initBtn){
      initBtn.addEventListener('click', function(){
        doInitialSync();
      });
    }

    var syncBtn = document.getElementById('syncBtn');
    if(syncBtn){
      syncBtn.addEventListener('click', function(){
        doSync();
      });
    }
  }

  return {
    initIndex: initIndex,
    initCity: mountCity
  };
})();
