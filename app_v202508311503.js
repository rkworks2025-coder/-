// versioned app
const GAS_URL = "https://script.google.com/macros/s/AKfycby9RpFiUbYu6YX6JW9XfwbDx36_4AIlGEQMOxR3SnxgNdoRUJKfyxvF3b1SEYwuHb3X/exec";
const $ = (id)=>document.getElementById(id);
const setStatus=(t)=>{ const el=$('status'); if(el) el.textContent=t; };
function syncNow(){ setStatus('同期完了（UIテスト版）'); }
