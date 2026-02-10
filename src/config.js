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
export const APP_TITLE = 'MyAccountTracker';

export const SHEET_TABS = {
  META: '_meta',
  ACCOUNTS: 'accounts',
  TRANSACTIONS: 'transactions',
  PAYEES: 'payees',
  CATEGORIES: 'categories',
  RECONCILIATIONS: 'reconciliations',
};

export const SHEET_HEADERS = {
  _meta: ['title', 'owner', 'lastSaved', 'version'],
  accounts: ['id', 'name', 'nickname', 'address', 'phone', 'webAddress', 'type', 'createdAt'],
  transactions: ['id', 'accountId', 'date', 'payee', 'description', 'payment', 'deposit', 'category', 'cleared', 'reconciliationId'],
  payees: ['id', 'name'],
  categories: ['id', 'name'],
  reconciliations: ['id', 'accountId', 'date', 'statementOpeningBalance', 'statementClosingBalance', 'transactionIds'],
};
