/* ======================================================================
   Junkai App Logic (s3g)
   Reflected GPT Feedback: Version Sync, JST Date, Delete-Sync, Config Whitelist
   ====================================================================== */

const APP_VERSION = 's3g'; // ★HTML側と一致させる
const DB_NAME = 'JunkaiDB';
const STORE_NAME = 'vehicles';

// --- JST Helper ---
// 日本時間の YYYY-MM-DD を返す (UTCズレ防止)
function getTodayJST() {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Tokyo'
  }).format(new Date()).replace(/\//g, '-');
}

// --- IDB Wrapper ---
const db = {
  open: () => new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    r.onsuccess = e => resolve(e.target.result);
    r.onerror = e => reject(e);
  }),
  put: (data) => db.open().then(d => new Promise((res, rej) => {
    const tx = d.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e);
    tx.objectStore(STORE_NAME).put(data);
  })),
  getAll: () => db.open().then(d => new Promise((res, rej) => {
    const tx = d.transaction(STORE_NAME, 'readonly');
    const s = tx.objectStore(STORE_NAME);
    const req = s.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  })),
  clear: () => db.open().then(d => new Promise((res, rej) => {
    const tx = d.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e);
    tx.objectStore(STORE_NAME).clear();
  }))
};

// --- App State ---
const app = {
  config: [],
  currentArea: null,
  data: [],

  init: async () => {
    app.showStatus('Init...');
    await app.loadConfig();
    app.showStatus('');
  },

  showStatus: (msg) => {
    document.getElementById('statusIndicator').textContent = msg;
  },

  toast: (msg) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
  },

  // --- 1. Config ---
  loadConfig: () => {
    app.showStatus('Loading Config...');
    fetch(`${GAS_API_URL}?action=config`)
      .then(r => r.json())
      .then(res => {
        app.config = res.config || [];
        app.renderHome();
        app.showStatus('');
      })
      .catch(e => {
        app.showStatus('Error');
        app.toast('Config Load Failed');
      });
  },

  renderHome: () => {
    const list = document.getElementById('configList');
    list.innerHTML = '';
    app.config.forEach(cfg => {
      // ★修正: 除外(stop以外)ではなく、許可(active)のみ表示する (ホワイトリスト方式)
      if (cfg.status === 'active') {
        const btn = document.createElement('button');
        btn.className = 'config-btn';
        btn.textContent = cfg.name;
        btn.onclick = () => app.selectArea(cfg);
        list.appendChild(btn);
      }
    });
  },

  selectArea: async (cfg) => {
    app.currentArea = cfg;
    document.getElementById('currentAreaName').textContent = cfg.name;
    document.getElementById('viewConfig').style.display = 'none';
    document.getElementById('viewList').style.display = 'block';
    
    // Load local data first
    const all = await db.getAll();
    // Filter by area prefix
    app.data = all.filter(d => d.city === cfg.slug || d.area === cfg.name);
    app.renderList();
  },

  showConfig: () => {
    document.getElementById('viewList').style.display = 'none';
    document.getElementById('viewConfig').style.display = 'block';
    app.currentArea = null;
  },

  // --- 2. List & Render ---
  renderList: () => {
    const container = document.getElementById('vehicleList');
    container.innerHTML = '';
    const term = document.getElementById('searchBox').value.toLowerCase();

    const filtered = app.data.filter(d => {
      const searchStr = (d.plate + d.station + d.model).toLowerCase();
      return searchStr.includes(term);
    });

    filtered.forEach(d => {
      const el = document.createElement('div');
      el.className = 'v-card';
      
      // ★修正: 色判定ロジックの統一
      // statusに '7days_rule' が入っているならそれを優先
      let statusClass = '';
      if (d.checked) statusClass = 'status-checked';
      else if (d.status === 'stopped' || d.status === 'stop') statusClass = 'status-stopped';
      else if (d.status === 'Unnecessary' || d.status === 'skip') statusClass = 'status-unnecessary';
      else if (d.status === '7days_rule') statusClass = 'status-7days';
      else statusClass = 'status-standby';

      el.classList.add(statusClass);

      el.innerHTML = `
        <div class="v-header">
          <span class="v-plate">${d.plate}</span>
          <span class="v-model">${d.model}</span>
        </div>
        <div class="v-info">${d.station}</div>
        <div class="v-date">最終: ${d.last_inspected_at || '--'}</div>
        <div class="v-check-area">
           <label class="check-label">
             <input type="checkbox" ${d.checked ? 'checked' : ''} onchange="app.toggleCheck('${d.plate}', this.checked)">
             CHECK
           </label>
        </div>
      `;
      container.appendChild(el);
    });
  },

  toggleCheck: (plate, isChecked) => {
    const target = app.data.find(d => d.plate === plate);
    if (target) {
      target.checked = isChecked;
      // ★修正: 日付をJSTで記録
      if (isChecked) {
        target.last_inspected_at = getTodayJST();
      }
      // Save locally
      db.put(target);
      app.renderList();
    }
  },

  // --- 3. Pull (Sync) ---
  pullData: () => {
    if (!confirm('データをサーバーから取得します。\n【注意】現在表示中の未送信データは上書き・削除される可能性があります。よろしいですか？')) return;
    
    app.showStatus('Pulling...');
    fetch(`${GAS_API_URL}?action=pull`)
      .then(r => r.json())
      .then(async res => {
        if (res.rows) {
          // ★修正: Pull時は「同期」なので、古いデータをクリアして削除を反映させる
          // まず全クリア (エリア運用ならエリア単位で消すべきだが、仕様上全体Pullしているので全クリアが安全)
          await db.clear();

          // 新規データを保存
          const saves = res.rows.map(r => {
             // ID生成 (plateをキーにする)
             r.id = r.plate;
             return db.put(r);
          });
          await Promise.all(saves);
          
          // 再読み込み
          if (app.currentArea) {
            const all = await db.getAll();
            app.data = all.filter(d => d.city === app.currentArea.slug || d.area === app.currentArea.name);
            app.renderList();
          }
          app.toast('Pull Complete (Sync)');
        }
        app.showStatus('');
      })
      .catch(e => {
        console.error(e);
        app.toast('Pull Failed');
        app.showStatus('');
      });
  },

  // --- 4. Push ---
  pushData: async () => {
    if (!confirm('現在の状態を送信しますか？')) return;
    app.showStatus('Pushing...');
    
    // 全データを送る (サーバー側でマッチング)
    const allData = await db.getAll();
    
    fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'syncInspection', data: allData })
    })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        app.toast('Push Success');
        // Push成功後、念のため再Pullして同期をとるのがベストだが、ここでは完了通知のみ
      } else {
        app.toast('Push Failed: ' + res.error);
      }
      app.showStatus('');
    })
    .catch(e => {
      app.toast('Push Network Error');
      app.showStatus('');
    });
  }
};

window.onload = app.init;
