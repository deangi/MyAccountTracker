function ensureTransactionNamesInMasterList(items = [], transactions = [], field, idPrefix) {
  const known = new Set(items.map((item) => item.name.trim().toLocaleLowerCase()));
  const additions = [];
  for (const transaction of transactions) {
    const name = String(transaction[field] || '').trim();
    const key = name.toLocaleLowerCase();
    if (name && !known.has(key)) {
      known.add(key);
      additions.push({ id: `${idPrefix}-${encodeURIComponent(key)}`, name });
    }
  }
  return [...items, ...additions].sort((a, b) => a.name.localeCompare(b.name));
}

export function reduceAppState(state, action, initialState, SHEET_TABS, V2_LEDGER_TABS) {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, isAuthenticated: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_SPREADSHEET':
      return { ...state, spreadsheetId: action.payload.id, spreadsheetTitle: action.payload.title };
    case 'LOAD_DATA':
      {
        const transactions = (action.payload.transactions || []).slice().sort((a, b) => a.date.localeCompare(b.date));
        const payees = ensureTransactionNamesInMasterList(action.payload[SHEET_TABS.PAYEES] || [], transactions, 'payee', 'recovered-payee');
        const categories = ensureTransactionNamesInMasterList(action.payload[SHEET_TABS.CATEGORIES] || [], transactions, 'category', 'recovered-category');
      return {
        ...state,
        meta: action.payload[SHEET_TABS.META]?.[0] || initialState.meta,
        accounts: action.payload[SHEET_TABS.ACCOUNTS] || [],
        transactions,
        payees,
        categories,
        reconciliations: action.payload[SHEET_TABS.RECONCILIATIONS] || [],
        reconcileDrafts: action.payload[SHEET_TABS.RECONCILE_DRAFTS] || [],
        chartOfAccounts: action.payload[V2_LEDGER_TABS.CHART_OF_ACCOUNTS] || [],
        journalEntries: action.payload[V2_LEDGER_TABS.JOURNAL_ENTRIES] || [],
        postings: action.payload[V2_LEDGER_TABS.POSTINGS] || [],
        loading: false,
      };
      }
    case 'CLEAR_DATA':
      return {
        ...state,
        meta: initialState.meta,
        accounts: [],
        transactions: [],
        payees: [],
        categories: [],
        reconciliations: [],
        reconcileDrafts: [],
        chartOfAccounts: [],
        journalEntries: [],
        postings: [],
        selectedAccountId: null,
        spreadsheetId: null,
        spreadsheetTitle: '',
      };
    case 'SELECT_ACCOUNT':
      return { ...state, selectedAccountId: action.payload };

    // Accounts
    case 'ADD_ACCOUNT':
      return { ...state, accounts: [...state.accounts, action.payload] };
    case 'IMPORT_ACCOUNTS':
      return { ...state, accounts: [...state.accounts, ...action.payload] };
    case 'UPDATE_ACCOUNT':
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.payload.id ? action.payload : a)) };
    case 'DELETE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.payload),
        transactions: state.transactions.filter((t) => t.accountId !== action.payload),
        reconcileDrafts: state.reconcileDrafts.filter((draft) => draft.accountId !== action.payload),
        selectedAccountId: state.selectedAccountId === action.payload ? null : state.selectedAccountId,
      };

    // Transactions
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload].sort((a, b) => a.date.localeCompare(b.date)) };
    case 'UPDATE_TRANSACTION':
      return { ...state, transactions: state.transactions.map((t) => (t.id === action.payload.id ? action.payload : t)).sort((a, b) => a.date.localeCompare(b.date)) };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.payload) };
    case 'IMPORT_TRANSACTIONS':
      return { ...state, transactions: [...state.transactions, ...action.payload].sort((a, b) => a.date.localeCompare(b.date)) };
    case 'ADD_TRANSFER':
      return {
        ...state,
        transactions: [...state.transactions, action.payload.source, action.payload.destination]
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    case 'UPDATE_TRANSFER': {
      const { transferId, source, destination } = action.payload;
      return {
        ...state,
        transactions: state.transactions
          .map((transaction) => transaction.transferId === transferId
            ? (transaction.id === source.id ? source : destination)
            : transaction)
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    }
    case 'DELETE_TRANSFER':
      return { ...state, transactions: state.transactions.filter((t) => t.transferId !== action.payload) };

    // Payees
    case 'ADD_PAYEE':
      return { ...state, payees: [...state.payees, action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
    case 'IMPORT_PAYEES':
      return { ...state, payees: [...state.payees, ...action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
    case 'DELETE_PAYEE':
      return { ...state, payees: state.payees.filter((p) => p.id !== action.payload) };

    // Categories
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
    case 'IMPORT_CATEGORIES':
      return { ...state, categories: [...state.categories, ...action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter((c) => c.id !== action.payload) };

    // Reconciliations
    case 'ADD_RECONCILIATION':
      return { ...state, reconciliations: [...state.reconciliations, action.payload] };
    case 'UPDATE_TRANSACTIONS_BATCH':
      return {
        ...state,
        transactions: state.transactions.map((t) => {
          const update = action.payload.find((u) => u.id === t.id);
          return update ? { ...t, ...update } : t;
        }),
      };
    case 'SAVE_RECONCILE_DRAFT':
      return {
        ...state,
        reconcileDrafts: state.reconcileDrafts.some((draft) => draft.id === action.payload.id)
          ? state.reconcileDrafts.map((draft) => draft.id === action.payload.id ? action.payload : draft)
          : [...state.reconcileDrafts, action.payload],
      };
    case 'DELETE_RECONCILE_DRAFT':
      return { ...state, reconcileDrafts: state.reconcileDrafts.filter((draft) => draft.id !== action.payload) };

    case 'SET_META':
      return { ...state, meta: { ...state.meta, ...action.payload } };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };

    default:
      return state;
  }
}

