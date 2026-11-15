import { SHEET_TABS, TXN_TAB_PREFIX, V3_TRANSACTION_HEADERS, getSheetHeadersForVersion, sanitizeTabName } from '../config';
import { getLocator, putLocator } from './syncOutbox';
import { planImportRows } from './importBatch';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const headers = getSheetHeadersForVersion('3');
const column = (n) => { let result = ''; while (n) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); } return result; };
const quote = (title) => `'${title.replace(/'/g, "''")}'`;

async function request(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (response.status === 401) { const error = new Error('Google authentication expired'); error.auth = true; throw error; }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || `Sheets API error ${response.status}`);
  return response.json();
}

async function sheetProperties(workbookId, token) {
  const result = await request(`${BASE}/${workbookId}?fields=sheets.properties`, token);
  return (result.sheets || []).map((sheet) => sheet.properties);
}

async function readRows(workbookId, token, title) {
  const range = `${quote(title)}!A:Z`;
  const response = await request(`${BASE}/${workbookId}/values/${encodeURIComponent(range)}`, token);
  const [fields = [], ...values] = response.values || [];
  return { fields, rows: values.map((value, index) => ({ number: index + 2, data: Object.fromEntries(fields.map((field, i) => [field, value[i] ?? ''])) })) };
}

function sameRow(a, b, fields) {
  return fields.every((field) => String(a?.[field] ?? '') === String(b?.[field] ?? ''));
}

function tabForAccount(account, accounts) {
  const base = sanitizeTabName(account.name || 'Unnamed');
  const collision = accounts.filter((item) => sanitizeTabName(item.name || 'Unnamed') === base).length > 1;
  const suffix = ` (${account.id.slice(0, 4)})`;
  return `${TXN_TAB_PREFIX}${collision ? `${base.slice(0, 31 - TXN_TAB_PREFIX.length - suffix.length)}${suffix}` : base}`;
}

async function resolveTab(workbookId, token, change, accounts, properties) {
  if (change.tab !== 'transactions') return change.tab;
  const account = accounts.find((item) => item.id === (change.after || change.before).accountId);
  if (!account) throw new Error(`Account for transaction ${change.id} is missing`);
  const title = tabForAccount(account, accounts);
  if (!properties.some((sheet) => sheet.title === title)) {
    await request(`${BASE}/${workbookId}:batchUpdate`, token, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
    await request(`${BASE}/${workbookId}/values/${encodeURIComponent(`${quote(title)}!A1`) }?valueInputOption=RAW`, token, {
      method: 'PUT', body: JSON.stringify({ values: [V3_TRANSACTION_HEADERS] }),
    });
    properties.push({ title });
  }
  return title;
}

async function ensureAccountRegister(workbookId, token, account, accounts, properties) {
  const title = tabForAccount(account, accounts);
  if (properties.some((sheet) => sheet.title === title)) return;
  await request(`${BASE}/${workbookId}:batchUpdate`, token, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
  await request(`${BASE}/${workbookId}/values/${encodeURIComponent(`${quote(title)}!A1`)}?valueInputOption=RAW`, token, {
    method: 'PUT', body: JSON.stringify({ values: [V3_TRANSACTION_HEADERS] }),
  });
  properties.push({ title });
}

export async function applyChanges(workbookId, token, operation) {
  const { changes, accounts } = operation.payload;
  const properties = await sheetProperties(workbookId, token);
  if (operation.kind === 'IMPORT_TRANSACTIONS' && changes.every((change) => change.tab === 'transactions')) {
    const groups = new Map();
    for (const change of changes) {
      const title = await resolveTab(workbookId, token, change, accounts, properties);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(change);
    }
    const planned = [];
    for (const [title, group] of groups) {
      const sheet = await readRows(workbookId, token, title);
      const plan = planImportRows(sheet, group, operation.id, V3_TRANSACTION_HEADERS);
      planned.push({ title, ...plan });
    }
    const data = planned.flatMap(({ title, writes }) => writes.map(({ rowNumber, desired }) => ({
      range: `${quote(title)}!A${rowNumber}:${column(V3_TRANSACTION_HEADERS.length)}${rowNumber}`,
      values: [V3_TRANSACTION_HEADERS.map((field) => desired[field] ?? '')],
    })));
    if (data.length) {
      await request(`${BASE}/${workbookId}/values:batchUpdate`, token, {
        method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }),
      });
    }
    for (const { title, writes, locators } of planned) {
      if (writes.length) {
        const verified = await readRows(workbookId, token, title);
        for (const { id, rowNumber, desired } of writes) {
          if (!sameRow(verified.rows.find((row) => row.number === rowNumber)?.data, desired, V3_TRANSACTION_HEADERS)) {
            throw new Error(`Read-back mismatch for ${id} in ${title}`);
          }
        }
      }
      for (const locator of locators) {
        await putLocator({ id: `${workbookId}:${locator.id}`, title, rowNumber: locator.rowNumber, rowVersion: locator.rowVersion });
      }
    }
    return;
  }
  for (const change of changes) {
    if (change.tab === SHEET_TABS.ACCOUNTS && change.after && !change.before) {
      await ensureAccountRegister(workbookId, token, change.after, accounts, properties);
    }
    if (change.tab === SHEET_TABS.ACCOUNTS && change.before && change.after && change.before.name !== change.after.name) {
      const oldTitle = tabForAccount(change.before, accounts.map((account) => account.id === change.id ? change.before : account));
      const newTitle = tabForAccount(change.after, accounts);
      const oldSheet = properties.find((sheet) => sheet.title === oldTitle);
      if (oldSheet && oldTitle !== newTitle) {
        if (properties.some((sheet) => sheet.title === newTitle)) throw new Error(`Account register ${newTitle} already exists`);
        await request(`${BASE}/${workbookId}:batchUpdate`, token, { method: 'POST', body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: oldSheet.sheetId, title: newTitle }, fields: 'title' } }] }) });
        oldSheet.title = newTitle;
      }
    }
    const title = await resolveTab(workbookId, token, change, accounts, properties);
    const fields = change.tab === 'transactions' ? V3_TRANSACTION_HEADERS : headers[change.tab];
    const sheet = await readRows(workbookId, token, title);
    if (sheet.fields.join('|') !== fields.join('|')) throw new Error(`Unexpected columns in ${title}; sync stopped`);
    const matches = sheet.rows.filter((row) => row.data.id === change.id);
    if (matches.length > 1) throw new Error(`Duplicate ${change.id} in ${title}; sync stopped`);
    const existing = matches[0];
    if (!change.after && change.tab !== 'transactions' && !existing) continue;
    const locatorId = `${workbookId}:${change.id}`;
    const locator = await getLocator(locatorId);
    if (locator && existing && (locator.title !== title || locator.rowNumber !== existing.number)) {
      // The ID found in the sheet is authoritative. Refresh a stale cache.
      await putLocator({ id: locatorId, title, rowNumber: existing.number });
    }
    let desired = change.after || {};
    if (change.tab === 'transactions') {
      desired = desired ? { ...desired, deleted: 'FALSE', rowVersion: String(Number(existing?.data.rowVersion || 0) + 1), lastOperationId: operation.id } :
        { ...change.before, deleted: 'TRUE', deletedAt: operation.createdAt, deletedByOperationId: operation.id, rowVersion: String(Number(existing?.data.rowVersion || 0) + 1), lastOperationId: operation.id };
    }
    if (existing?.data.lastOperationId === operation.id) continue;
    if (existing && sameRow(existing.data, desired, fields)) continue;
    if (change.before && !existing) throw new Error(`Row ${change.id} disappeared from ${title}; sync stopped`);
    if (!change.before && existing) throw new Error(`Row ${change.id} already exists in ${title}; sync stopped`);
    if (existing && !sameRow(existing.data, change.before, fields.filter((field) => !['rowVersion', 'lastOperationId', 'deleted', 'deletedAt', 'deletedByOperationId'].includes(field)))) {
      throw new Error(`Row ${change.id} changed in ${title}; sync stopped`);
    }
    const rowNumber = existing?.number || sheet.rows.length + 2;
    const range = `${quote(title)}!A${rowNumber}:${column(fields.length)}${rowNumber}`;
    await request(`${BASE}/${workbookId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, token, {
      method: 'PUT', body: JSON.stringify({ values: [fields.map((field) => desired[field] ?? '')] }),
    });
    const verified = await readRows(workbookId, token, title);
    if (!sameRow(verified.rows.find((row) => row.number === rowNumber)?.data, desired, fields)) throw new Error(`Read-back mismatch for ${change.id} in ${title}`);
    await putLocator({ id: locatorId, title, rowNumber, rowVersion: desired.rowVersion || '' });
  }
}
