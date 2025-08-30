async function runSyncFromGAS() {
  try {
    showProgress('同期中…'); // 既存のプログレス表示をそのまま使う想定
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);

    const res = await fetch(`${GAS_URL}?action=pull`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    });
    clearTimeout(timer);

    const json = await res.json();
    if (!json || json.ok !== true || !Array.isArray(json.data)) {
      throw new Error('JSON形式不正');
    }

    // ← 既にある取り込み関数に

   
