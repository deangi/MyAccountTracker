import { APP_VERSION, CURRENT_SHEET_FORMAT_VERSION, SHEET_TABS } from '../config';
import { createSpreadsheet, readAllTabs, renameSpreadsheet, writeAllTabs, writeConversionReport } from './googleSheets';

function moneyIsValid(value) {
  return value === '' || value == null || (Number.isFinite(Number(value)) && Number(value) >= 0);
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

export async function migrateV1ToV2({ spreadsheetId, data }) {
  const validation = validateV1Data(data);
  if (validation.errors.length) throw new Error(`Conversion validation failed:\n${validation.errors.join('\n')}`);
  if ((data[SHEET_TABS.META]?.[0]?.version || '1') !== '1') throw new Error('Only Format 1 spreadsheets can be converted to Format 2.');

  const sourceTitle = data[SHEET_TABS.META]?.[0]?.title || 'MyAccountTracker';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTitle = `${sourceTitle} — Backup Before Format 2 Migration — ${timestamp}`;
  // The original is the safest backup because it retains all user-managed
  // formatting and non-app content. Rename it before creating the V2 file.
  await renameSpreadsheet(spreadsheetId, backupTitle);
  const backupId = spreadsheetId;
  const targetTitle = sourceTitle;
  let targetId;
  try {
    targetId = await createSpreadsheet(targetTitle);
  } catch (err) {
    throw new Error(`The original workbook was safely renamed to "${backupTitle}", but the new Format 2 workbook could not be created: ${err.message}`);
  }
  const migratedAt = new Date().toISOString();
  const migratedData = {
    ...data,
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
  try {
    await synchronizeAndValidateV2Ledger(targetId);
  } catch (err) {
    await writeConversionReport(targetId, {
      runAt: migratedAt,
      sourceSpreadsheetId: spreadsheetId,
      backupSpreadsheetId: backupId,
      sourceFormatVersion: '1',
      targetFormatVersion: CURRENT_SHEET_FORMAT_VERSION,
      appVersion: APP_VERSION,
      status: 'failed_validation',
      details: err.message,
    });
    throw err;
  }
  await writeConversionReport(targetId, {
    runAt: migratedAt,
    sourceSpreadsheetId: spreadsheetId,
    backupSpreadsheetId: backupId,
    sourceFormatVersion: '1',
    targetFormatVersion: CURRENT_SHEET_FORMAT_VERSION,
    appVersion: APP_VERSION,
    status: validation.warnings.length ? 'completed_with_warnings' : 'completed',
    details: validation.warnings.join(' ') || 'Validated conversion completed.',
  });
  return { targetId, targetTitle, backupId, backupTitle, warnings: validation.warnings };
}
