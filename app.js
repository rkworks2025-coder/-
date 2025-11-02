const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec';

// 初期同期（全体管理データ取得）
async function initialSync() {
  try {
    showStatus("初期同期中…");

    const res = await fetch(GAS_URL + '?action=init');
    if (!res.ok) throw new Error('通信エラー');

    const data = await res.json();
    const list = data.data || data; // GAS出力の形式に両対応

    if (!Array.isArray(list) || list.length === 0) throw new Error('データが空でした');

    localStorage.setItem('masterData', JSON.stringify(list));
    showStatus("初期同期完了", true);
    console.log('初期同期完了', list.length, '件');

    // 振り分け処理を呼び出し
    distributeByArea(list);

  } catch (err) {
    showStatus("初期同期失敗：" + err.message, false);
    console.error(err);
  }
}

// 各エリアへの振り分け処理
function distributeByArea(list) {
  try {
    const yamato = [];
    const ebina = [];
    const chofu = [];

    list.forEach(d => {
      const city = d["市区町村"]; // ← 日本語ヘッダー対応
      if (city === "大和市") yamato.push(d);
      else if (city === "海老名市") ebina.push(d);
      else if (city === "調布市") chofu.push(d);
    });

    localStorage.setItem('yamato', JSON.stringify(yamato));
    localStorage.setItem('ebina', JSON.stringify(ebina));
    localStorage.setItem('chofu', JSON.stringify(chofu));

    console.log(`振り分け完了: 大和(${yamato.length})件 / 海老名(${ebina.length})件 / 調布(${chofu.length})件`);
    showStatus("エリア別データを振り分け完了", true);
  } catch (e) {
    console.error("振り分け処理エラー:", e);
    showStatus("振り分け処理でエラーが発生", false);
  }
}

// 同期ボタン（ステータス送信 → inspectionlog更新）
async function syncData() {
  try {
    showStatus("データ送信中…");

    const localData = JSON.parse(localStorage.getItem('masterData') || '[]');
   
