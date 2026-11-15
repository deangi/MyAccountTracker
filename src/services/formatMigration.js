import { APP_VERSION, CURRENT_SHEET_FORMAT_VERSION, SHEET_TABS, V3_TRANSACTION_HEADERS, getSheetHeadersForVersion } from '../config';
import { assertNoPersistedLedgerTabs, buildV2LedgerData, createSpreadsheet, readAllTabs, renameSpreadsheet, writeAllTabs } from './googleSheets';

function moneyIsValid(value) {
  return value === '' || value == null || (Number.isFinite(Number(value)) && Number(value) >= 0);
}

function checkNumberIsValid(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === '' || ['DEP', 'EFT', 'TXFR'].includes(normalized) || /^\d+$/.test(normalized);
}

export function validateV1Data(data) {
  const errors = [];
  const warnings = [];
  const accountIds = new Set();
  const transactionIds = new Set();
  for (const account of data.accounts || []) {
    if (!account.id || accountIds.has(account.id)) errors.push(`Account ${account.name || '(unnamed)'} has a missing or duplicate ID.`);
    accountIds.add(account.id);
  }
  for (const transaction of data.transactions || []) {
    if (!transaction.id || transactionIds.has(transaction.id)) errors.push('A transaction has a missing or duplicate ID.');
    transactionIds.add(transaction.id);
    if (!accountIds.has(transaction.accountId)) errors.push(`Transaction ${transaction.id || '(unknown)'} references an unknown account.`);
    if (!moneyIsValid(transaction.payment) || !moneyIsValid(transaction.deposit)) errors.push(`Transaction ${transaction.id || '(unknown)'} has an invalid amount.`);
    if (!checkNumberIsValid(transaction.checkNum)) errors.push(`Transaction ${transaction.id || '(unknown)'} has an invalid check number.`);
  }
  const transfers = new Map();
  for (const transaction of data.transactions || []) {
    if (!transaction.transferId) continue;
    const pair = transfers.get(transaction.transferId) || [];
    pair.push(transaction);
    transfers.set(transaction.transferId, pair);
  }
  for (const [transferId, pair] of transfers) {
    const source = pair.find((item) => Number(item.payment) > 0);
    const destination = pair.find((item) => Number(item.deposit) > 0);
    if (pair.length !== 2 || !source || !destination || Number(source.payment) !== Number(destination.deposit)) {
      errors.push(`Linked transfer ${transferId} is incomplete or does not balance.`);
    }
  }
  for (const reconciliation of data.reconciliations || []) {
    for (const id of (reconciliation.transactionIds || '').split(',').filter(Boolean)) {
      if (!transactionIds.has(id)) errors.push(`Reconciliation ${reconciliation.id || '(unknown)'} references missing transaction ${id}.`);
    }
  }
  if ((data.transactions || []).some((transaction) => transaction.checkNum === 'TXFR' && !transaction.transferId)) {
    warnings.push('Some TXFR transactions are not linked transfers and will be posted to Conversion Review until categorized.');
  }
  return { errors, warnings };
}

export function validateV2Ledger(data) {
  const errors = [];
  const transactionIds = new Set((data.transactions || []).map((transaction) => transaction.id));
  const entries = data.journal_entries || [];
  const postings = data.postings || [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const totals = new Map();
  const cents = (value) => Math.round(Number(value || 0) * 100);

  for (const entry of entries) {
    for (const id of (entry.sourceTransactionIds || '').split(',').filter(Boolean)) {
      if (!transactionIds.has(id)) errors.push(`Journal entry ${entry.id} references missing transaction ${id}.`);
    }
  }
  for (const posting of postings) {
    if (!entryIds.has(posting.journalEntryId)) errors.push(`Posting ${posting.id} references a missing journal entry.`);
    if (!transactionIds.has(posting.sourceTransactionId)) errors.push(`Posting ${posting.id} references missing transaction ${posting.sourceTransactionId}.`);
    const debit = cents(posting.debit);
    const credit = cents(posting.credit);
    if ((debit === 0 && credit === 0) || (debit !== 0 && credit !== 0)) errors.push(`Posting ${posting.id} must have exactly one debit or credit amount.`);
    const total = totals.get(posting.journalEntryId) || { debit: 0, credit: 0 };
    total.debit += debit;
    total.credit += credit;
    totals.set(posting.journalEntryId, total);
  }
  for (const entry of entries) {
    const total = totals.get(entry.id);
    if (!total || total.debit !== total.credit) errors.push(`Journal entry ${entry.id} does not balance.`);
  }
  return { errors };
}

function compareLedgerRecords(before = [], after = [], fields) {
  const previous = new Map(before.map((record) => [record.id, record]));
  const current = new Map(after.map((record) => [record.id, record]));
  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const [id, record] of current) {
    const prior = previous.get(id);
    if (!prior) {
      added += 1;
    } else if (fields.some((field) => String(prior[field] ?? '') !== String(record[field] ?? ''))) {
      updated += 1;
    }
  }
  for (const id of previous.keys()) {
    if (!current.has(id)) removed += 1;
  }
  return { added, removed, updated };
}

export async function synchronizeAndValidateV2Ledger(spreadsheetId) {
  // Re-read the persisted register tabs before the final write so the ledger
  // is always derived from the same data the user will reopen.
  const canonicalData = await readAllTabs(spreadsheetId);
  const persistedLedgerValidation = validateV2Ledger(canonicalData);
  if (persistedLedgerValidation.errors.length) {
    throw new Error(`Format 2 ledger validation found persisted inconsistencies. No changes were saved:\n${persistedLedgerValidation.errors.join('\n')}`);
  }
  const sourceValidation = validateV1Data(canonicalData);
  if (sourceValidation.errors.length) {
    throw new Error(`Format 2 ledger validation failed before saving:\n${sourceValidation.errors.join('\n')}`);
  }
  await writeAllTabs(spreadsheetId, canonicalData);
  const validatedData = await readAllTabs(spreadsheetId);
  const validation = validateV2Ledger(validatedData);
  if (validation.errors.length) throw new Error(`Format 2 ledger validation failed:\n${validation.errors.join('\n')}`);
  const journalEntries = compareLedgerRecords(
    canonicalData.journal_entries,
    validatedData.journal_entries,
    ['date', 'description', 'sourceTransactionIds', 'createdAt'],
  );
  const postings = compareLedgerRecords(
    canonicalData.postings,
    validatedData.postings,
    ['journalEntryId', 'accountId', 'debit', 'credit', 'payee', 'category', 'sourceTransactionId', 'reconciliationId'],
  );
  return {
    validatedData,
    report: {
      transactionCount: validatedData.transactions.length,
      journalEntryCount: validatedData.journal_entries.length,
      postingCount: validatedData.postings.length,
      journalEntries,
      postings,
    },
  };
}

export async function migrateToV3({ spreadsheetId, data }) {
  const validation = validateV1Data(data);
  if (validation.errors.length) throw new Error(`Conversion validation failed:\n${validation.errors.join('\n')}`);
  const sourceFormatVersion = data[SHEET_TABS.META]?.[0]?.version || '1';
  if (!['1', '2'].includes(sourceFormatVersion)) throw new Error('Only Format 1 or Format 2 spreadsheets can be converted to Format 3.');

  const sourceTitle = data[SHEET_TABS.META]?.[0]?.title || 'MyAccountTracker';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTitle = `${sourceTitle} — Backup Before Format 3 Migration — ${timestamp}`;
  const snapshotName = downloadMigrationSnapshot(data, sourceTitle, timestamp, validation);
  // The original is the safest backup because it retains all user-managed
  // formatting and non-app content. Rename it only after the local snapshot
  // has been prepared and downloaded.
  await renameSpreadsheet(spreadsheetId, backupTitle);
  const backupId = spreadsheetId;
  const targetTitle = sourceTitle;
  let targetId;
  try {
    targetId = await createSpreadsheet(targetTitle);
  } catch (err) {
    throw new Error(`The original workbook was safely renamed to "${backupTitle}", but the new Format 3 workbook could not be created: ${err.message}`);
  }
  const migratedAt = new Date().toISOString();
  const migratedData = {
    ...data,
    transactions: (data.transactions || []).map((transaction) => ({
      ...transaction,
      deleted: 'FALSE',
      deletedAt: '',
      deletedByOperationId: '',
      rowVersion: transaction.rowVersion || '1',
      lastOperationId: '',
    })),
    [SHEET_TABS.META]: [{
      ...(data[SHEET_TABS.META]?.[0] || {}),
      title: targetTitle,
      version: CURRENT_SHEET_FORMAT_VERSION,
      sourceSpreadsheetId: spreadsheetId,
      backupSpreadsheetId: backupId,
      migratedAt,
      appVersion: APP_VERSION,
      lastSaved: migratedAt,
    }],
  };
  await writeAllTabs(targetId, migratedData);
  await assertNoPersistedLedgerTabs(targetId);
  const persistedData = await readAllTabs(targetId);
  assertExactCanonicalCopy(migratedData, persistedData);
  const ledger = buildV2LedgerData(migratedData);
  const ledgerValidation = validateV2Ledger({ ...migratedData, ...ledger });
  if (ledgerValidation.errors.length) throw new Error(`Format 3 ledger validation failed:\n${ledgerValidation.errors.join('\n')}`);
  return { targetId, targetTitle, backupId, backupTitle, snapshotName, warnings: validation.warnings };
}

function downloadMigrationSnapshot(data, sourceTitle, timestamp, validation) {
  if (typeof document === 'undefined') return '';
  const safeTitle = sourceTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'MyAccountTracker';
  const snapshotName = `${safeTitle}-before-format-3-migration-${timestamp}.json`;
  const snapshot = {
    ...data,
    migrationSnapshot: {
      createdAt: new Date().toISOString(),
      sourceFormatVersion: data[SHEET_TABS.META]?.[0]?.version || '1',
      targetFormatVersion: CURRENT_SHEET_FORMAT_VERSION,
      validation,
    },
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = snapshotName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return snapshotName;
}

function asFieldMap(records, fields, label) {
  const values = new Map();
  for (const record of records || []) {
    const id = record.id;
    if (!id) throw new Error(`Format 3 verification failed: ${label} has a record without an ID.`);
    values.set(id, fields.map((field) => String(record[field] ?? '')).join('\u0001'));
  }
  return values;
}

function assertSameFieldMap(expected, actual, label) {
  if (expected.size !== actual.size) {
    throw new Error(`Format 3 verification failed: expected ${expected.size} ${label} record(s), read back ${actual.size}.`);
  }
  for (const [id, fields] of expected) {
    if (!actual.has(id)) throw new Error(`Format 3 verification failed: ${label} ${id} is missing after write.`);
    if (actual.get(id) !== fields) throw new Error(`Format 3 verification failed: ${label} ${id} differs after write.`);
  }
}

export function assertExactCanonicalCopy(expectedData, actualData) {
  const headers = getSheetHeadersForVersion(CURRENT_SHEET_FORMAT_VERSION);
  for (const tab of Object.values(SHEET_TABS)) {
    const fields = headers[tab] || [];
    const expected = expectedData[tab] || [];
    const actual = actualData[tab] || [];
    if (tab === SHEET_TABS.META) {
      const expectedValue = fields.map((field) => String(expected[0]?.[field] ?? '')).join('\u0001');
      const actualValue = fields.map((field) => String(actual[0]?.[field] ?? '')).join('\u0001');
      if (expectedValue !== actualValue) throw new Error('Format 3 verification failed: file metadata differs after write.');
    } else {
      assertSameFieldMap(asFieldMap(expected, fields, tab), asFieldMap(actual, fields, tab), tab);
    }
  }
  assertSameFieldMap(
    asFieldMap(expectedData.transactions || [], V3_TRANSACTION_HEADERS, 'transaction'),
    asFieldMap(actualData.transactions || [], V3_TRANSACTION_HEADERS, 'transaction'),
    'transaction',
  );
}
