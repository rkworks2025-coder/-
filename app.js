// v6w app.js（純正ベース）— GASの“項目→値”交互形式に対応＆エリア振り分けのみ修正
// 先回り改良・簡素化・POST系の追加は一切なし。同期(GET)と振り分けだけを実装。

(() => {
  'use strict';

  // ★ 現在のGAS URL（リュウ指定）
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec';

  // ★ v6wの同期対象シート名（全体管理）
  const SHEET_NAME = '全体管理';

  // ---------- ユーティリティ ----------
  const $ = sel => document.querySelector(sel);
  const byId = id => document.getElementById(id);
  const nowBust = () => `&_=${Date.now()}`;

  // 候補見出し（v6w時代の列名ゆらぎ吸収）
  const ALIAS = {
    area:     ['エリア', '地域', '管轄', '市区町村', 'エリア名', 'area'],
    station:  ['ステーション名', 'ステーション', 'station'],
    plate:    ['車番', 'ナンバー', 'plate', '車両番号'],
    model:    ['車種', '型式', 'model'],
  };

  const pick = (obj, names) => {
    for (const n of names) {
      if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] !== '' && obj[n] != null) {
        return String(obj[n]);
      }
    }
    return '';
  };

  // GAS応答を v6w が期待する「headers + rows[]（オブジェクト行）」へ正規化
  function normalizePayload(payload) {
    let headers = [];
    const rows = [];

    // パターンA: {status:'ok', headers:[...], data:[ ... ]}
    if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
      if (Array.isArray(payload.headers) && payload.headers.length) {
        headers = payload.headers.map(String);
      }
      for (const rec of payload.data) {
        if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
          // 既にオブジェクト
          rows.push(rec);
        } else if (Array.isArray(rec)) {
          if (headers.length && rec.length === headers.length) {
            const o = {};
            headers.forEach((h, i) => { o[String(h)] = rec[i]; });
            rows.push(o);
          } else if (rec.length % 2 === 0) {
            // 交互形式: [key, val, key, val, ...]
            const o = {};
            for (let i = 0; i < rec.length; i += 2) {
              o[String(rec[i])] = rec[i + 1];
            }
            rows.push(o);
          }
        }
      }
      if (!headers.length && rows.length) headers = Object.keys(rows[0]);
      return { headers, rows };
    }

    // パターンB: 直配列
    if (Array.isArray(payload)) {
      for (const rec of payload) {
        if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
          rows.push(rec);
        } else if (Array.isArray(rec) && rec.length % 2 === 0) {
          const o = {};
          for (let i = 0; i < rec.length; i += 2) {
            o[String(rec[i])] = rec[i + 1];
          }
          rows.push(o);
        }
      }
      if (!headers.length && rows.length) headers = Object.keys(rows[0]);
      return { headers, rows };
    }

    // パターンC: {rows:[...]} など
    if (payload && typeof payload === 'object' && Array.isArray(payload.rows)) {
      for (const rec of payload.rows) {
        if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
          rows.push(rec);
        } else if (Array.isArray(rec) && rec.length % 2 === 0) {
          const o = {};
          for (let i = 0; i < rec.length; i += 2) {
            o[String(rec[i])] = rec[i + 1];
          }
          rows.push(o);
        }
      }
      if (!headers.length && rows.length) headers = Object.keys(rows[0]);
      return { headers, rows };
    }

    return { headers: [], rows: [] };
  }

  // エリア振り分け（大和／海老名／調布）
  function routeCity(rec) {
    const area = pick(rec, ALIAS.area);
    const station = pick(rec, ALIAS.station);
    const text = `${area} ${station}`;

    if (text.includes('大和')) return 'yamato';
    if (text.includes('海老名')) return 'ebina';
    if (text.includes('調布')) return 'chofu';
    return 'other';
  }

  function saveBuckets(headers, rows) {
    const buckets = { yamato: [], ebina: [], chofu: [], other: [] };
    for (const r of rows) {
      const key = routeCity(r);
      buckets[key].push(r);
    }
    localStorage.setItem('headers', JSON.stringify(headers));
    Object.keys(buckets).forEach(k => {
      localStorage.setItem(k, JSON.stringify(buckets[k]));
    });
    // 総数も保持（v6wのカウンタ想定）
    localStorage.setItem('count-total', String((buckets.yamato.length + buckets.ebina.length + buckets.chofu.length)));
  }

  function getCount(key) {
    try { return (JSON.parse(localStorage.getItem(key)) || []).length; } catch { return 0; }
  }

  function updateCountsQuiet() {
    const set = (id, v) => { const el = byId(id); if (el) el.textContent = String(v); };
    const y = getCount('yamato');
    const e = getCount('ebina');
    const c = getCount('chofu');
    set('count-yamato', y);
    set('count-ebina', e);
    set('count-chofu', c);
    set('count-total', y + e + c);
  }

  // ---------- 同期（GET：全体管理→アプリ） ----------
  async function pullAll() {
    const url = `${GAS_URL}?action=pull&sheet=${encodeURIComponent(SHEET_NAME)}${nowBust()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // {status:'ok'} を尊重しつつ、dataが空ならエラー扱い
    if (json && typeof json === 'object' && 'status' in json && String(json.status).toLowerCase() !== 'ok') {
      throw new Error('status not ok');
    }

    const { headers, rows } = normalizePayload(json);
    if (!rows.length) throw new Error('empty rows');

    saveBuckets(headers, rows);
    updateCountsQuiet();
    return rows.length;
  }

  // ---------- ボタン紐づけ（v6w系のid想定を幅広く捕捉。存在しなくても無害） ----------
  function bindSyncButton() {
    const candidates = ['sync', 'syncBtn', 'btn-sync', 'button-sync'];
    candidates.forEach(id => {
      const el = byId(id);
      if (el && !el.__v6wBound) {
        el.__v6wBound = true;
        el.addEventListener('click', async () => {
          try {
            // v6wのUIは変更しない：進捗バーやトーストは既存側に委譲
            await pullAll();
            // 既存UIが結果を描く前提。ここでは静かに成功。
            console.log('[v6w] pullAll: ok');
          } catch (err) {
            console.error('[v6w] pullAll: error', err);
            // 既存UI側の「通信または解析エラー」表示ロジックに委譲
          }
        }, { passive: true });
      }
    });
  }

  // ---------- 起動 ----------
  document.addEventListener('DOMContentLoaded', () => {
    bindSyncButton();
    updateCountsQuiet(); // 既存データがあればカウンタだけ反映
  });
})();
