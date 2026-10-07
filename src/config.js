export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export const DISCOVERY_DOCS = [
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
];

export const AUTO_SAVE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
export const TOKEN_EXPIRY_WARNING_MS = 50 * 60 * 1000; // warn at 50 min (token expires at 60 min)
export const DIRTY_WARNING_MS = 10 * 60 * 1000;        // warn after 10 min of unsaved changes
// Pre-expiry safety save: if dirty + user idle this long + token is older than the threshold, force a save.
export const IDLE_THRESHOLD_MS = 2 * 60 * 1000;          // 2 minutes of no input = idle
export const TOKEN_PREEXPIRY_SAVE_MS = 55 * 60 * 1000;   // start pushing saves once token is >55 min old
export const IDLE_CHECK_INTERVAL_MS = 30 * 1000;         // re-evaluate every 30s
export const APP_TITLE = 'MyAccountTracker';
export const APP_VERSION = '2.15';
export const APP_BUILD_DATE = '2026-10-07';
export const CURRENT_SHEET_FORMAT_VERSION = '2';

export const SHEET_TABS = {
  META: '_meta',
  ACCOUNTS: 'accounts',
  PAYEES: 'payees',
  CATEGORIES: 'categories',
  RECONCILIATIONS: 'reconciliations',
  RECONCILE_DRAFTS: 'reconcile_drafts',
};

export const V2_LEDGER_TABS = {
  CHART_OF_ACCOUNTS: 'chart_of_accounts',
  JOURNAL_ENTRIES: 'journal_entries',
  POSTINGS: 'postings',
  CONVERSION_REPORT: 'conversion_report',
};

export const SHEET_HEADERS = {
  _meta: ['title', 'owner', 'lastSaved', 'version'],
  accounts: ['id', 'name', 'nickname', 'address', 'phone', 'webAddress', 'type', 'createdAt'],
  payees: ['id', 'name'],
  categories: ['id', 'name'],
  reconciliations: ['id', 'accountId', 'date', 'statementOpeningBalance', 'statementClosingBalance', 'transactionIds'],
  reconcile_drafts: ['id', 'accountId', 'activeStep', 'statementDate', 'statementOpeningBalance', 'statementClosingBalance', 'selectedTransactionIds', 'createdAt', 'updatedAt'],
};

export const V2_SHEET_HEADERS = {
  ...SHEET_HEADERS,
  _meta: ['title', 'owner', 'lastSaved', 'version', 'sourceSpreadsheetId', 'backupSpreadsheetId', 'migratedAt', 'appVersion'],
  chart_of_accounts: ['id', 'name', 'accountClass', 'subtype', 'normalBalance', 'sourceAccountId', 'active'],
  journal_entries: ['id', 'date', 'description', 'sourceTransactionIds', 'createdAt'],
  postings: ['id', 'journalEntryId', 'accountId', 'debit', 'credit', 'payee', 'category', 'sourceTransactionId', 'reconciliationId'],
  conversion_report: ['runAt', 'sourceSpreadsheetId', 'backupSpreadsheetId', 'sourceFormatVersion', 'targetFormatVersion', 'appVersion', 'status', 'details'],
};

export function getSheetTabsForVersion(version) {
  return version === CURRENT_SHEET_FORMAT_VERSION
    ? [...Object.values(SHEET_TABS), ...Object.values(V2_LEDGER_TABS)]
    : Object.values(SHEET_TABS);
}

export function getSheetHeadersForVersion(version) {
  return version === CURRENT_SHEET_FORMAT_VERSION ? V2_SHEET_HEADERS : SHEET_HEADERS;
}

export const TXN_TAB_PREFIX = 'txn_';

export const TRANSACTION_HEADERS = ['id', 'accountId', 'date', 'checkNum', 'payee', 'description', 'payment', 'deposit', 'category', 'cleared', 'reconciliationId', 'transferId', 'transferAccountId'];

export function sanitizeTabName(name) {
  const clean = name.replace(/[\\/*?[\]]/g, '');
  // Google Sheets allows longer titles, but downloads must also open in Excel,
  // which limits worksheet names to 31 characters.
  const maxNameLen = 31 - TXN_TAB_PREFIX.length;
  return clean.slice(0, maxNameLen);
}
