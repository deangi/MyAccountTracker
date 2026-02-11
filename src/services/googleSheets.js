import { getAccessToken } from './googleAuth';
import { GOOGLE_API_KEY, SHEET_HEADERS, SHEET_TABS, TXN_TAB_PREFIX, TRANSACTION_HEADERS, sanitizeTabName } from '../config';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsRequest(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Sheets API error: ${response.status}`);
  }
  return response.json();
}

export async function createSpreadsheet(title) {
  const sheets = Object.values(SHEET_TABS).map((tabName) => ({
    properties: { title: tabName },
  }));

  const body = {
    properties: { title },
    sheets,
  };

  const data = await sheetsRequest(SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const spreadsheetId = data.spreadsheetId;

  // Write headers to fixed tabs only (no transaction tabs yet)
  const headerRequests = Object.entries(SHEET_HEADERS).map(([tabName, headers]) => ({
    range: `'${tabName}'!A1:${columnLetter(headers.length)}1`,
    values: [headers],
  }));

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: headerRequests,
    }),
  });

  return spreadsheetId;
}

async function getSheetProperties(spreadsheetId) {
  const data = await sheetsRequest(
    `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`
  );
  return (data.sheets || []).map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
  }));
}

function parseRows(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });
}

export async function readAllTabs(spreadsheetId) {
  const sheetProps = await getSheetProperties(spreadsheetId);
  const txnTabNames = sheetProps
    .map((s) => s.title)
    .filter((t) => t.startsWith(TXN_TAB_PREFIX));

  const fixedTabs = Object.values(SHEET_TABS);
  const allTabs = [...fixedTabs, ...txnTabNames];

  const ranges = allTabs.map((tab) => `'${tab}'!A:Z`);
  const rangeParams = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${SHEETS_BASE}/${spreadsheetId}/values:batchGet?${rangeParams}`;

  const data = await sheetsRequest(url);

  const result = {};
  const allTransactions = [];

  data.valueRanges?.forEach((vr) => {
    const tabName = vr.range.split('!')[0].replace(/'/g, '');
    const rows = vr.values || [];

    if (tabName.startsWith(TXN_TAB_PREFIX)) {
      allTransactions.push(...parseRows(rows));
    } else {
      result[tabName] = parseRows(rows);
    }
  });

  result.transactions = allTransactions;
  return result;
}

function buildTxnTabNames(accounts) {
  const seen = new Map();
  const names = [];
  for (const acct of accounts) {
    const base = sanitizeTabName(acct.name || 'Unnamed');
    if (seen.has(base)) {
      // Disambiguate: rename the first occurrence too
      const firstIdx = seen.get(base);
      if (!names[firstIdx].endsWith(')')) {
        const firstAcct = accounts[firstIdx];
        names[firstIdx] = `${TXN_TAB_PREFIX}${base} (${firstAcct.id.slice(0, 4)})`;
      }
      names.push(`${TXN_TAB_PREFIX}${base} (${acct.id.slice(0, 4)})`);
    } else {
      seen.set(base, names.length);
      names.push(`${TXN_TAB_PREFIX}${base}`);
    }
  }
  return names;
}

export async function writeAllTabs(spreadsheetId, appData) {
  const accounts = appData.accounts || [];
  const transactions = appData.transactions || [];

  // 1. Discover existing tabs
  const sheetProps = await getSheetProperties(spreadsheetId);
  const existingTxnTabs = sheetProps.filter((s) => s.title.startsWith(TXN_TAB_PREFIX));

  // 2. Build batchUpdate: delete old txn tabs, add new ones
  const newTxnTabNames = buildTxnTabNames(accounts);

  const batchRequests = [];

  // Delete existing txn_* tabs
  for (const tab of existingTxnTabs) {
    batchRequests.push({ deleteSheet: { sheetId: tab.sheetId } });
  }

  // Add new txn_* tabs
  for (const tabName of newTxnTabNames) {
    batchRequests.push({
      addSheet: { properties: { title: tabName } },
    });
  }

  if (batchRequests.length > 0) {
    await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: batchRequests }),
    });
  }

  // 3. Clear fixed tabs
  const clearRanges = Object.values(SHEET_TABS).map((tab) => `'${tab}'!A:Z`);
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: clearRanges }),
  });

  // 4. Write fixed tabs
  const updateData = [];
  for (const [tabName, headers] of Object.entries(SHEET_HEADERS)) {
    const records = appData[tabName] || [];
    const rows = [headers];
    records.forEach((record) => {
      rows.push(headers.map((h) => record[h] ?? ''));
    });
    updateData.push({
      range: `'${tabName}'!A1:${columnLetter(headers.length)}${rows.length}`,
      values: rows,
    });
  }

  // 5. Write per-account transaction tabs
  const txnByAccount = new Map();
  for (const txn of transactions) {
    if (!txnByAccount.has(txn.accountId)) {
      txnByAccount.set(txn.accountId, []);
    }
    txnByAccount.get(txn.accountId).push(txn);
  }

  for (let i = 0; i < accounts.length; i++) {
    const acctTxns = txnByAccount.get(accounts[i].id) || [];
    const rows = [TRANSACTION_HEADERS];
    acctTxns.forEach((txn) => {
      rows.push(TRANSACTION_HEADERS.map((h) => txn[h] ?? ''));
    });
    updateData.push({
      range: `'${newTxnTabNames[i]}'!A1:${columnLetter(TRANSACTION_HEADERS.length)}${rows.length}`,
      values: rows,
    });
  }

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: updateData,
    }),
  });
}

export async function getSpreadsheetTitle(spreadsheetId) {
  const data = await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}?fields=properties.title`);
  return data.properties?.title || 'Untitled';
}

// Google Picker to select a spreadsheet
export function openPicker() {
  return new Promise((resolve, reject) => {
    const token = getAccessToken();
    if (!token) {
      reject(new Error('Not authenticated'));
      return;
    }

    const loadPicker = () => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS);
      view.setMimeTypes('application/vnd.google-apps.spreadsheet');

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            resolve(data.docs[0].id);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    };

    if (window.google?.picker) {
      loadPicker();
    } else {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', loadPicker);
      };
      script.onerror = () => reject(new Error('Failed to load Google Picker'));
      document.head.appendChild(script);
    }
  });
}

function columnLetter(num) {
  let letter = '';
  let n = num;
  while (n > 0) {
    n--;
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}
