
// GAS URL（現行）
const GAS_URL = "https://script.google.com/macros/s/AKfycby9RpFiUbYu6YX6JW9XfwbDx36_4AIlGEQMOxR3SnxgNdoRUJKfyxvF3b1SEYwuHb3X/exec";

// 簡易ステータス更新
const $ = (id)=>document.getElementById(id);
const setStatus=(t)=>{ const el = $('status'); if(el) el.textContent=t; };

// 同期ダミー（UI検証用）
function syncNow(){ setStatus('同期完了（UIテスト版）'); }

// 将来、本実装でGASへアクセスする処理を戻す
