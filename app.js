const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec';

// 初期同期（全体管理データ取得）
async function initialSync() {
  try {
    showStatus("初期同期中…");

    const res = await fetch(GAS_URL + '?action=init');
    if (!res.ok) throw new Error('通信エラー');

    const data = await res.json();
    const list = data.data || data; // ← 修正箇所（GASが{data:[…]}でも配列でも両対応）

    if (!Array.isArray(list) || list.length === 0) throw new Error('データが空でした');

    localStorage.setItem('masterData', JSON.stringify(list));
    showStatus("初期同期完了", true);
    console.log('初期同期完了', list.length, '件');
  } catch (err) {
    showStatus("初期同期失敗：" + err.message, false);
    console.error(err);
  }
}

// 同期ボタン（ステータス送信 → inspectionlog更新）
async function syncData() {
  try {
    showStatus("データ送信中…");

    const localData = JSON.parse(localStorage.getItem('masterData') || '[]');
    if (localData.length === 0) throw new Error('送信データがありません');

    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=push&data=' + encodeURIComponent(JSON.stringify(localData))
    });

    if (!res.ok) throw new Error('送信エラー');
    const data = await res.json();
    console.log('push結果:', data);

    showStatus("データ送信完了、同期受信中…");

    // 最新inspectionlog取得
    const pullRes = await fetch(GAS_URL + '?action=pull&sheet=inspectionlog');
    if (!pullRes.ok) throw new Error('同期取得エラー');

    const pullData = await pullRes.json();
    const list = pullData.data || pullData; // ← 修正箇所（受け取りも両対応）

    if (!Array.isArray(list) || list.length === 0) throw new Error('同期失敗：データが空でした');

    localStorage.setItem('inspectionData', JSON.stringify(list));
    showStatus("同期完了", true);
    console.log('同期完了', list.length, '件');
  } catch (err) {
    showStatus("同期失敗：" + err.message, false);
    console.error(err);
  }
}

// ステータス表示
function showStatus(msg, success) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = success ? '#0a0' : '#c00';
}
