// ✅ v6w版 app.js（2025.11.03修正版）
// ------------------------------------------------------
// ⚙️ 設定
const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";

// ------------------------------------------------------
// 🚀 初期同期（全体管理 → アプリ）
async function initialSync() {
  try {
    const response = await fetch(GAS_URL);
    const data = await response.json();

    // ✅ ここが重要：GAS側から返るJSON構造に対応
    const records = data.data || [];

    if (!Array.isArray(records) || records.length === 0) {
      alert('初期同期データが空です（0件）');
      console.log('返却データ:', data);
      return;
    }

    // ローカル保存
    localStorage.setItem('master', JSON.stringify(records));
    alert('初期同期が完了しました（' + records.length + '件）');

    console.log('同期データ', records.slice(0, 5)); // デバッグ表示（最初の5件）

  } catch (err) {
    console.error('初期同期エラー:', err);
    alert('初期同期に失敗しました。通信またはGAS設定を確認して下さい。');
  }
}

// ------------------------------------------------------
// 🔄 同期（アプリ → inspectionlog）
async function syncData() {
  try {
    const saved = localStorage.getItem('inspectionData');
    if (!saved) {
      alert('同期するデータがありません');
      return;
    }

    const data = JSON.parse(saved);
    if (!Array.isArray(data) || data.length === 0) {
      alert('同期データが空です');
      return;
    }

    const payload = { data: JSON.stringify(data) };

    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload)
    });

    const result = await res.json();
    console.log('同期結果:', result);

    if (result.ok) {
      alert('同期が完了しました（' + result.updated + '件更新）');
    } else {
      alert('同期に失敗しました: ' + (result.error || '不明なエラー'));
    }

  } catch (err) {
    console.error('同期エラー:', err);
    alert('同期に失敗しました（通信または構文エラー）');
  }
}

// ------------------------------------------------------
// 🧩 データ確認用ユーティリティ（必要に応じて使用）
function showMasterData() {
  const master = JSON.parse(localStorage.getItem('master') || '[]');
  console.log('ローカルマスターデータ:', master);
  alert('現在のローカルマスターデータ件数：' + master.length);
}

// ------------------------------------------------------
// 🧱 ボタン接続用
document.getElementById('btnSync').addEventListener('click', syncData);
document.getElementById('btnInit').addEventListener('click', initialSync);
