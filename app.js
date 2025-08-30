/* =========================
   巡回リスト app.js（フル版・同期修正版）
   - 二重マウント防止
   - 同期/再計算ボタン結線（既存DOMのみ使用）
   - 進捗モーダル表示（擬似バー）
   - GASへ ?action=pull で取得
   - 都市別カウント反映（大和市/海老名市/調布市）
   - フィールド名の表記ゆれを吸収
   ========================= */

(function () {
  // ---- 二重マウント防止 ----
  if (window.__JUNKAI_MOUNTED__) {
    console.warn('JunkaiApp already mounted. Skip.');
    return;
  }
  window.__JUNKAI_MOUNTED__ = true;

  // ---- 設定（あなたの本番URLを直書き）----
  // ※依頼どおり固定で組み込み
  const GAS_URL = 'https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec';

  // ---- DOM ヘルパ ----
  const $ = (sel, root = document) => root.querySelector(sel);

  // 進捗モーダル
  const modal = $('#progressModal');
  const bar   = $('#progressBar');
  const statusText = $('#statusText');

  // 都市カード（合計表示用）
  const cityEls = {
    yamato: { done: $('#yamato-done'), stop: $('#yamato-stop'), skip: $('#yamato-skip'), total: $('#yamato-total') },
    ebina : { done: $('#ebina-done'),  stop: $('#ebina-stop'),  skip: $('#ebina-skip'),  total: $('#ebina-total')  },
    chofu : { done: $('#chofu-done'),  stop: $('#chofu-stop'),  skip: $('#chofu-skip'),  total: $('#chofu-total')  },
  };

  // ---- 状態 ----
  let latestRows = []; // 直近同期データを保持（再計算で使用）

  // ---- 表記ゆれ吸収（1行→正規化）----
  function normalizeRow(r) {
    const city    = r.city ?? r.cityName ?? r['市区町村'] ?? r['City'] ?? '';
    const station = r.station ?? r.stationName ?? r['ステーション'] ?? r['Station'] ?? '';
    const model   = r.model ?? r['車種名'] ?? r['Model'] ?? '';
    const plate   = r.plate_full ?? r.plate ?? r['登録番号'] ?? r['Plate'] ?? '';
    return { city: String(city).trim(), station: String(station).trim(), model: String(model).trim(), plate: String(plate).trim() };
  }

  // ---- 集計（現状は総数のみ反映。done/stop/skip は将来拡張）----
  function computeCounts(rows) {
    const counts = {
      '大和市': { total: 0, done: 0, stop: 0, skip: 0 },
      '海老名市': { total: 0, done: 0, stop: 0, skip: 0 },
      '調布市': { total: 0, done: 0, stop: 0, skip: 0 },
    };
    for (const raw of rows) {
      const { city } = normalizeRow(raw);
      if (city in counts) {
        counts[city].total += 1;
        // 将来：raw の状態フィールドを見て done/stop/skip を振る
      }
    }
    return counts;
  }

  function renderCounts(counts) {
    // Yamato
    cityEls.yamato.total.textContent = counts['大和市']?.total ?? 0;
    cityEls.yamato.done.textContent  = counts['大和市']?.done  ?? 0;
    cityEls.yamato.stop.textContent  = counts['大和市']?.stop  ?? 0;
    cityEls.yamato.skip.textContent  = counts['大和市']?.skip  ?? 0;

    // Ebina
    cityEls.ebina.total.textContent = counts['海老名市']?.total ?? 0;
    cityEls.ebina.done.textContent  = counts['海老名市']?.done  ?? 0;
    cityEls.ebina.stop.textContent  = counts['海老名市']?.stop  ?? 0;
    cityEls.ebina.skip.textContent  = counts['海老名市']?.skip  ?? 0;

    // Chofu
    cityEls.chofu.total.textContent = counts['調布市']?.total ?? 0;
    cityEls.chofu.done.textContent  = counts['調布市']?.done  ?? 0;
    cityEls.chofu.stop.textContent  = counts['調布市']?.stop  ?? 0;
    cityEls.chofu.skip.textContent  = counts['調布市']?.skip  ?? 0;
  }

  // ---- モーダル制御（擬似プログレス）----
  let progTimer = null;
  function openProgress() {
    if (!modal || !bar) return;
    modal.classList.add('show');
    bar.style.width = '0%';
    let t = 0;
    progTimer = setInterval(() => {
      t = (t + 5) % 100;
      bar.style.width = `${t}%`;
    }, 80);
  }
  function closeProgress() {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    if (modal) modal.classList.remove('show');
  }

  // ---- 同期処理 ----
  async function doSync() {
    try {
      statusText && (statusText.textContent = '同期中…');
      openProgress();

      const res = await fetch(`${GAS_URL}?action=pull`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!Array.isArray(data)) {
        throw new Error('データ形式が不正です（配列ではありません）');
      }

      latestRows = data;
      const counts = computeCounts(latestRows);
      renderCounts(counts);

      statusText && (statusText.textContent = '同期完了！');
    } catch (err) {
      console.error(err);
      statusText && (statusText.textContent = `同期エラー：${err.message ?? err}`);
      // エラー時もUIは閉じる
    } finally {
      closeProgress();
    }
  }

  // ---- 再計算（サーバ通信なし）----
  function doRecalc() {
    const counts = computeCounts(latestRows || []);
    renderCounts(counts);
    statusText && (statusText.textContent = '再計算完了');
  }

  // ---- ボタンへ結線（既存DOMのみ）----
  function bindButtons() {
    const syncBtn   = $('#syncBtn');
    const recalcBtn = $('#recalcBtn');

    // 重複バインド防止
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
    // 初回は表示だけ整える（数値は0のままでOK）
    statusText && (statusText.textContent = 'GASと同期して各エリアに反映します。');
  }

  // グローバル公開（index 側で mountIndex を呼ぶ構成にも両対応）
  window.JunkaiApp = window.JunkaiApp || {};
  window.JunkaiApp.mountIndex = mountIndex;

  // 自動マウント（index 側が呼ばない場合の保険）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountIndex, { once: true });
  } else {
    mountIndex();
  }
})();