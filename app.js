/** ========== 設定 ========== */
const SHEET_NAME = '全体管理';
const SHEET_LOG = 'inspectionlog';
const GAS_VERSION = 'v8k_standby_fix';

/** ========== 初期設定 ========== */
const recBase = {
  plate: '',
  status: 'standby', // ←★ ここを 'normal' から 'standby' に変更
  checked: false,
  last_inspected_at: '',
  pressure_f: '',
  pressure_r: '',
  groove_f: '',
  groove_r: '',
  memo: ''
};

/** ========== 関数群 ========== */
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action || '';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'sheet not found' }));
  if (action === 'init') {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const body = data.slice(1).map(row => {
      const record = {};
      headers.forEach((h, i) => (record[h] = row[i]));
      return record;
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: body, headers })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid action' }));
}

function doPost(e) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_LOG);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'sheet not found' }));

  let data;
  try {
    data = e.parameter.data ? JSON.parse(e.parameter.data) : JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid JSON' }));
  }

  const list = Array.isArray(data) ? data : [data];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const col = {};
  headers.forEach((h, i) => (col[h] = i + 1));

  let updated = 0;

  for (const d of list) {
    const plate = String(d.plate || '').trim();
    if (!plate) continue;

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (String(row[col['plate'] - 1]).trim() === plate) {
        if (col['status']) row[col['status'] - 1] = d.status || row[col['status'] - 1];
        if (col['checked_at']) row[col['checked_at'] - 1] = d.checked_at || row[col['checked_at'] - 1];
        sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
        updated++;
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, updated })).setMimeType(ContentService.MimeType.JSON);
}

/** ========== ステータス変換 ========== */
function mapStatus(statusEng, checkedAt) {
  const rec = Object.assign({}, recBase);
  switch (statusEng) {
    case 'Checked':
      rec.checked = true;
      rec.status = 'normal';
      rec.last_inspected_at = toISOChecked(checkedAt);
      break;
    case 'stopped':
      rec.status = 'stop';
      break;
    case 'Unnecessary':
      rec.status = 'skip';
      break;
    case '7days_rule':
    case '7 day rule':
      rec.status = '7days_rule';
      rec.checked = false;
      rec.last_inspected_at = toISOChecked(checkedAt);
      break;
    case 'standby': // ←★ ここを追加
      rec.status = 'standby';
      break;
    default:
      rec.status = 'normal';
  }
  return rec;
}

function toISOChecked(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d)) return '';
    return d.toISOString();
  } catch (e) {
    return '';
  }
}
