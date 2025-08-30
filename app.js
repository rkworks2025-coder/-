/* =========================
   巡回リスト app.js（最終版・エラーハンドリング強化）
   - 二重マウント防止
   - 同期/再計算ボタン結線
   - 進捗モーダル表示（擬似バー）
   - GASへ ?action=pull で取得
   - 都市別カウント反映
   - フィールド名の表記ゆれを吸収
   - エラー詳細を画面に表示
   ========================= */

(function () {
  // ---- 二重マウント防止 ----
  if (window.__JUNKAI_MOUNTED__) {
    console.warn('JunkaiApp already mounted. Skip.');
    return;
  }
  window.__JUNKAI_MOUNTED__ = true;

  // ---- 設定（URLをHTMLから取得）----
  const appConfigEl = document.getElementById('app-config');
  if (!appConfigEl || !appConfigEl.dataset.gasUrl) {
    console.error('GAS URL not found. Please set it in a data attribute on the #app-config element in index.html.');
    return;
  }
  const GAS_URL = appConfigEl.dataset.gasUrl;
  console.log('GAS URL loaded:', GAS_URL);

  // ---- DOM ヘルパ ----
  const $ = (sel, root = document) => root.querySelector(sel);

  // 進捗モーダル
  const modal = $('#progressModal');
  const bar = $('#progressBar');
  const statusText = $('#statusText');

  // 都市カード（合計表示用）
  const cityEls = {
    yamato: { done: $('#yamato-done'), stop: $('#yamato-stop'), skip: $('#yamato-skip'), total: $('#yamato-total') },
    ebina: { done: $('#ebina-done'), stop: $('#ebina-stop'), skip: $('#ebina-skip'), total: $('#ebina-total') },
    chofu: { done: $('#chofu-done'), stop: $('#chofu-stop'), skip: $('#chofu-skip'), total: $('#chofu-total') },
  };

  // 全体合計（ヒント表示用）
  const overallHint = $('#overallHint');
  const totalCount = $('#overallTotal');

  // 最新データを保持（再計算用）
  let latestRows = [];

  // ---- 進捗UI表示/非表示 ----
  function showProgress(message) {
    if (modal) {
      modal.hidden = false;
      bar.style.width = '0%';
      if (statusText) statusText.textContent = message;
    }
  }

  function closeProgress() {
    if (modal) {
      setTimeout(() => {
        modal.hidden = true;
      }, 500); // 完了メッセージを少し表示させる
    }
  }

  // ---- カウント計算 ----
  function computeCounts(rows) {
    const counts = {
      yamato: { done: 0, stop: 0, skip: 0, total: 0 },
      ebina: { done: 0, stop: 0, skip: 0, total: 0 },
      chofu: { done: 0, stop: 0, skip: 0, total: 0 },
      overall: 0,
    };

    if (!Array.isArray(rows)) {
      console.warn('Expected array data for counting, but got:', rows);
      return counts;
    }

    for (const row of rows) {
      const city = row.city || row.City;
      const status = row.status || row.Status;

      if (city === '大和市' && counts.yamato) {
        counts.yamato.total++;
        if (status === '済') counts.yamato.done++;
        else if (status === '停') counts.yamato.stop++;
        else if (status === '不要') counts.yamato.skip++;
      } else if (city === '海老名市' && counts.ebina) {
        counts.ebina.total++;
        if (status === '済') counts.ebina.done++;
        else if (status === '停') counts.ebina.stop++;
        else if (status === '不要') counts.ebina.skip++;
      } else if (city === '調布市' && counts.chofu) {
        counts.chofu.total++;
        if (status === '済') counts.chofu.done++;
        else if (status === '停') counts.chofu.stop++;
        else if (status === '不要') counts.chofu.skip++;
      }
    }
    counts.overall = rows.length;
    return counts;
  }

  // ---- カウントUI更新 ----
  function renderCounts(counts) {
    for (const city in counts) {
      if (cityEls[city]) {
        cityEls[city].done.textContent = counts[city].done;
        cityEls[city].stop.textContent = counts[city].stop;
        cityEls[city].skip.textContent = counts[city].skip;
        cityEls[city].total.textContent = counts[city].total;
      }
    }
    if (totalCount) {
      totalCount.textContent = counts.overall;
      overallHint.classList.remove('empty');
    }
  }

  // ---- GASと同期 ----
  async function doSync() {
    showProgress('同期を開始しています...');
    bar.style.width = '30%';

    try {
      const resp = await fetch(GAS_URL + '?action=pull');
      bar.style.width = '70%';

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`HTTP Error! status: ${resp.status}, message: ${errorText}`);
      }

      const responseJson = await resp.json();
      if (responseJson.ok === false) {
        throw new Error(`GASエラー: ${responseJson.error}`);
      }
      
      const data = responseJson.data;
      if (!Array.isArray(data)) {
        throw new Error('返されたデータが配列ではありません。');
      }

      latestRows = data;
      const counts = computeCounts(latestRows);
      renderCounts(counts);
      if (statusText) statusText.textContent = '同期完了！';

    } catch (err) {
      console.error('同期処理エラー:', err);
      if (statusText) statusText.textContent = `同期エラー：${err.message ?? err}`;
      bar.style.width = '0%';
    } finally {
      closeProgress();
    }
  }

  // ---- 再計算（サーバ通信なし）----
  function doRecalc() {
    showProgress('再計算中...');
    const counts = computeCounts(latestRows || []);
    renderCounts(counts);
    if (statusText) statusText.textContent = '再計算完了';
    closeProgress();
  }

  // ---- ボタンへ結線（既存DOMのみ）----
  function bindButtons() {
    const syncBtn = $('#syncBtn');
    const recalcBtn = $('#recalcBtn');

    if (syncBtn && !syncBtn.dataset.bound) {
      syncBtn.addEventListener('click', doSync, { passive: true });
      syncBtn.dataset.bound = '1';
    }
    if (recalcBtn && !recalcBtn.dataset.bound) {
      recalcBtn.addEventListener('click', doRecalc, { passive: true });
      recalcBtn.dataset.bound = '1';
    }
  }

  // ---- 初期化 ----
  function mountIndex() {
    bindButtons();
    if (statusText) statusText.textContent = 'GASと同期して各エリアに反映します。';
  }

  if (document.title === '巡回リスト') {
    mountIndex();
  }
})();
