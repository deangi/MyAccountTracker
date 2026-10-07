import { getAccessToken } from './googleAuth';
import { GOOGLE_API_KEY, APP_VERSION, CURRENT_SHEET_FORMAT_VERSION, SHEET_HEADERS, SHEET_TABS, TRANSACTION_HEADERS, TXN_TAB_PREFIX, V2_LEDGER_TABS, getSheetHeadersForVersion, getSheetTabsForVersion, sanitizeTabName } from '../config';

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

export async function createSpreadsheet(title, formatVersion = CURRENT_SHEET_FORMAT_VERSION) {
  // A newly-created account file is always initialized with its format marker.
  // This makes a partially interrupted first save recognizably Format 2 instead
  // of falling back to the legacy, unversioned Format 1 behavior on reopen.
  const initialMeta = {
    title,
    owner: '',
    lastSaved: new Date().toISOString(),
    version: formatVersion,
    appVersion: APP_VERSION,
  };
  const sheets = getSheetTabsForVersion(formatVersion).map((tabName) => ({
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
  const headerRequests = Object.entries(getSheetHeadersForVersion(formatVersion)).map(([tabName, headers]) => {
    const isMeta = tabName === SHEET_TABS.META;
    return {
      range: `'${tabName}'!A1:${columnLetter(headers.length)}${isMeta ? 2 : 1}`,
      values: isMeta ? [headers, headers.map((header) => initialMeta[header] ?? '')] : [headers],
    };
  });

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: headerRequests,
    }),
  });

  return spreadsheetId;
}

export async function createReportSpreadsheet(title, sheetName, rows) {
  const data = await sheetsRequest(SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: sheetName } }] }),
  });
  const spreadsheetId = data.spreadsheetId;
  const widestRow = Math.max(...rows.map((row) => row.length), 1);
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [{ range: `'${sheetName}'!A1:${columnLetter(widestRow)}${rows.length}`, values: rows }],
    }),
  });
  return spreadsheetId;
}

export async function createMultiSheetReportSpreadsheet(title, sheets) {
  const data = await sheetsRequest(SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((sheet) => ({ properties: { title: sheet.name } })),
    }),
  });
  const spreadsheetId = data.spreadsheetId;
  const updateData = sheets.map((sheet) => {
    const widestRow = Math.max(...sheet.rows.map((row) => row.length), 1);
    return {
      range: `'${sheet.name}'!A1:${columnLetter(widestRow)}${sheet.rows.length}`,
      values: sheet.rows,
    };
  });
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: updateData }),
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

// Older account files predate newly-added fixed tabs. Add only missing tabs so
// opening an existing file remains backward compatible.
async function ensureFixedTabs(spreadsheetId, formatVersion) {
  const headersByTab = getSheetHeadersForVersion(formatVersion);
  const sheetProps = await getSheetProperties(spreadsheetId);
  const existing = new Set(sheetProps.map((sheet) => sheet.title));
  const missing = getSheetTabsForVersion(formatVersion).filter((tab) => !existing.has(tab));

  if (missing.length === 0) return sheetProps;

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });

  const headerData = missing.map((tabName) => ({
    range: `'${tabName}'!A1:${columnLetter(headersByTab[tabName].length)}1`,
    values: [headersByTab[tabName]],
  }));
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: headerData }),
  });

  return getSheetProperties(spreadsheetId);
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
  const metaResponse = await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent("'_meta'!A:Z")}`);
  const meta = parseRows(metaResponse.values || [])[0] || {};
  const formatVersion = meta.version || '1';
  const sheetProps = await ensureFixedTabs(spreadsheetId, formatVersion);
  const txnTabNames = sheetProps
    .map((s) => s.title)
    .filter((t) => t.startsWith(TXN_TAB_PREFIX));

  const fixedTabs = getSheetTabsForVersion(formatVersion);
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
  result.formatVersion = formatVersion;
  return result;
}

function buildTxnTabNames(accounts) {
  const maxTabNameLength = 31;
  const bases = accounts.map((account) => sanitizeTabName(account.name || 'Unnamed'));
  const counts = new Map();
  for (const base of bases) counts.set(base, (counts.get(base) || 0) + 1);

  return accounts.map((account, index) => {
    const base = bases[index];
    if (counts.get(base) === 1) return `${TXN_TAB_PREFIX}${base}`;
    const suffix = ` (${account.id.slice(0, 4)})`;
    const availableBaseLength = maxTabNameLength - TXN_TAB_PREFIX.length - suffix.length;
    return `${TXN_TAB_PREFIX}${base.slice(0, availableBaseLength)}${suffix}`;
  });
}

function assertTransactionsBelongToAccounts(accounts, transactions) {
  const accountIds = new Set(accounts.map((account) => account.id));
  const invalid = transactions.filter((transaction) => !accountIds.has(transaction.accountId));
  if (invalid.length) {
    throw new Error(`Cannot save: ${invalid.length} transaction(s) belong to an account that is no longer in the account list. Restore or reassign those transactions before saving.`);
  }
}

function sameIds(actual, expected) {
  return actual.size === expected.size && [...expected].every((id) => actual.has(id));
}

async function verifyPersistedWorkbook(spreadsheetId, accounts, transactions, expectedTxnTabNames) {
  const expectedAccountIds = new Set(accounts.map((account) => account.id));
  const expectedTransactionIds = new Set(transactions.map((transaction) => transaction.id));
  let lastProblem = 'The saved workbook could not be read back.';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const sheetProperties = await getSheetProperties(spreadsheetId);
    const persistedTxnTabs = new Set(sheetProperties.map((sheet) => sheet.title).filter((title) => title.startsWith(TXN_TAB_PREFIX)));
    const persisted = await readAllTabs(spreadsheetId);
    const persistedAccountIds = new Set((persisted[SHEET_TABS.ACCOUNTS] || []).map((account) => account.id));
    const persistedTransactionIds = new Set((persisted.transactions || []).map((transaction) => transaction.id));

    if (sameIds(persistedTxnTabs, new Set(expectedTxnTabNames))
      && sameIds(persistedAccountIds, expectedAccountIds)
      && sameIds(persistedTransactionIds, expectedTransactionIds)) {
      return persisted;
    }
    lastProblem = `Expected ${expectedTxnTabNames.length} account registers and ${expectedTransactionIds.size} transactions, but Google Sheets returned ${persistedTxnTabs.size} registers and ${persistedTransactionIds.size} transactions.`;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Save verification failed. ${lastProblem} The sheet was not marked as saved.`);
}

export async function writeAllTabs(spreadsheetId, appData) {
  const accounts = appData.accounts || [];
  const transactions = appData.transactions || [];
  assertTransactionsBelongToAccounts(accounts, transactions);
  const formatVersion = appData[SHEET_TABS.META]?.[0]?.version || '1';
  const headersByTab = getSheetHeadersForVersion(formatVersion);
  const fixedTabs = getSheetTabsForVersion(formatVersion);

  // 1. Discover existing tabs
  const sheetProps = await ensureFixedTabs(spreadsheetId, formatVersion);
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
  const writableTabs = fixedTabs.filter((tab) => tab !== V2_LEDGER_TABS.CONVERSION_REPORT);
  const clearRanges = writableTabs.map((tab) => `'${tab}'!A:Z`);
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: clearRanges }),
  });

  // 4. Write fixed tabs
  const updateData = [];
  const ledgerData = formatVersion === CURRENT_SHEET_FORMAT_VERSION ? buildLedgerData(appData) : {};
  for (const [tabName, headers] of Object.entries(headersByTab)) {
    if (tabName === V2_LEDGER_TABS.CONVERSION_REPORT) continue;
    let records = ledgerData[tabName] || appData[tabName] || [];
    if (tabName === SHEET_TABS.PAYEES || tabName === SHEET_TABS.CATEGORIES) {
      records = records.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (tabName === SHEET_TABS.RECONCILIATIONS) {
      records = records.slice().sort((a, b) => b.date.localeCompare(a.date));
    }
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
    const acctTxns = (txnByAccount.get(accounts[i].id) || []).slice().sort((a, b) => b.date.localeCompare(a.date));
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

  return verifyPersistedWorkbook(spreadsheetId, accounts, transactions, newTxnTabNames);
}

export async function getSpreadsheetTitle(spreadsheetId) {
  const data = await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}?fields=properties.title`);
  return data.properties?.title || 'Untitled';
}

export async function renameSpreadsheet(spreadsheetId, title) {
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        updateSpreadsheetProperties: {
          properties: { title },
          fields: 'title',
        },
      }],
    }),
  });
}

export async function writeConversionReport(spreadsheetId, report) {
  const headers = getSheetHeadersForVersion(CURRENT_SHEET_FORMAT_VERSION)[V2_LEDGER_TABS.CONVERSION_REPORT];
  const rows = [headers, headers.map((header) => report[header] ?? '')];
  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [{ range: `'${V2_LEDGER_TABS.CONVERSION_REPORT}'!A1:${columnLetter(headers.length)}${rows.length}`, values: rows }],
    }),
  });
}

function buildLedgerData(appData) {
  const accounts = appData.accounts || [];
  const transactions = appData.transactions || [];
  const chartAccounts = accounts.map((account) => ({
    id: account.id,
    name: account.nickname || account.name,
    accountClass: accountClassFor(account.type),
    subtype: account.type || 'checking',
    normalBalance: accountClassFor(account.type) === 'liability' || accountClassFor(account.type) === 'equity' ? 'credit' : 'debit',
    sourceAccountId: account.id,
    active: 'TRUE',
  }));
  const categories = new Map();
  const entries = [];
  const postings = [];
  const seenTransfers = new Set();

  const addPosting = (entryId, accountId, debit, credit, transaction) => {
    postings.push({
      id: `posting-${entryId}-${postings.length + 1}`,
      journalEntryId: entryId,
      accountId,
      debit: debit ? Number(debit).toFixed(2) : '',
      credit: credit ? Number(credit).toFixed(2) : '',
      payee: transaction.payee || '',
      category: transaction.category || '',
      sourceTransactionId: transaction.id,
      reconciliationId: transaction.reconciliationId || '',
    });
  };
  const categoryAccount = (transaction, kind) => {
    const name = transaction.category || 'Conversion Review';
    const id = `${kind}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!categories.has(id)) {
      categories.set(id, {
        id,
        name: `${kind === 'income' ? 'Income' : 'Expense'}: ${name}`,
        accountClass: kind,
        subtype: transaction.category ? 'category' : 'conversion-review',
        normalBalance: kind === 'income' ? 'credit' : 'debit',
        sourceAccountId: '',
        active: 'TRUE',
      });
    }
    return id;
  };

  for (const transaction of transactions) {
    if (transaction.transferId) {
      if (seenTransfers.has(transaction.transferId)) continue;
      const pair = transactions.filter((item) => item.transferId === transaction.transferId);
      const source = pair.find((item) => Number(item.payment) > 0);
      const destination = pair.find((item) => Number(item.deposit) > 0);
      if (source && destination && Number(source.payment) === Number(destination.deposit)) {
        const entryId = `entry-${transaction.transferId}`;
        entries.push({ id: entryId, date: source.date, description: source.description || source.payee, sourceTransactionIds: `${source.id},${destination.id}`, createdAt: '' });
        addPosting(entryId, destination.accountId, source.payment, '', destination);
        addPosting(entryId, source.accountId, '', source.payment, source);
        seenTransfers.add(transaction.transferId);
        continue;
      }
    }
    const amount = Number(transaction.payment || transaction.deposit || 0);
    if (!amount) continue;
    const entryId = `entry-${transaction.id}`;
    entries.push({ id: entryId, date: transaction.date, description: transaction.description || transaction.payee, sourceTransactionIds: transaction.id, createdAt: '' });
    if (Number(transaction.payment) > 0) {
      addPosting(entryId, categoryAccount(transaction, 'expense'), amount, '', transaction);
      addPosting(entryId, transaction.accountId, '', amount, transaction);
    } else {
      addPosting(entryId, transaction.accountId, amount, '', transaction);
      addPosting(entryId, categoryAccount(transaction, 'income'), '', amount, transaction);
    }
  }
  return {
    [V2_LEDGER_TABS.CHART_OF_ACCOUNTS]: [...chartAccounts, ...categories.values()],
    [V2_LEDGER_TABS.JOURNAL_ENTRIES]: entries,
    [V2_LEDGER_TABS.POSTINGS]: postings,
  };
}

function accountClassFor(type = '') {
  const normalized = type.toLowerCase();
  if (['credit card', 'credit-card', 'loan', 'mortgage', 'liability'].includes(normalized)) return 'liability';
  if (normalized === 'equity') return 'equity';
  return 'asset';
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
