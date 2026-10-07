import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { readAllTabs, writeAllTabs, createSpreadsheet } from '../services/googleSheets';
import { migrateV1ToV2, synchronizeAndValidateV2Ledger } from '../services/formatMigration';
import { initAutoSave, markDirty, markClean, getAutoSaveStatus, onStatusChange } from '../services/autoSave';
import { generateUUID } from '../utils/uuid';
import { CURRENT_SHEET_FORMAT_VERSION, SHEET_TABS, V2_LEDGER_TABS, APP_TITLE } from '../config';

const AppContext = createContext(null);

const initialState = {
  isAuthenticated: false,
  spreadsheetId: localStorage.getItem('defaultSpreadsheetId') || null,
  spreadsheetTitle: '',
  meta: { title: '', owner: '', lastSaved: '', version: CURRENT_SHEET_FORMAT_VERSION },
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
  loading: false,
  error: null,
  saveStatus: getAutoSaveStatus(),
};

function reducer(state, action) {
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
      return {
        ...state,
        meta: action.payload[SHEET_TABS.META]?.[0] || initialState.meta,
        accounts: action.payload[SHEET_TABS.ACCOUNTS] || [],
        transactions: (action.payload.transactions || []).slice().sort((a, b) => a.date.localeCompare(b.date)),
        payees: (action.payload[SHEET_TABS.PAYEES] || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        categories: (action.payload[SHEET_TABS.CATEGORIES] || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        reconciliations: action.payload[SHEET_TABS.RECONCILIATIONS] || [],
        reconcileDrafts: action.payload[SHEET_TABS.RECONCILE_DRAFTS] || [],
        chartOfAccounts: action.payload[V2_LEDGER_TABS.CHART_OF_ACCOUNTS] || [],
        journalEntries: action.payload[V2_LEDGER_TABS.JOURNAL_ENTRIES] || [],
        postings: action.payload[V2_LEDGER_TABS.POSTINGS] || [],
        loading: false,
      };
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
    case 'DELETE_PAYEE':
      return { ...state, payees: state.payees.filter((p) => p.id !== action.payload) };

    // Categories
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
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

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const getAppData = useCallback(() => {
    const s = stateRef.current;
    return {
      [SHEET_TABS.META]: [{ ...s.meta, lastSaved: new Date().toISOString() }],
      [SHEET_TABS.ACCOUNTS]: s.accounts,
      transactions: s.transactions,
      [SHEET_TABS.PAYEES]: s.payees,
      [SHEET_TABS.CATEGORIES]: s.categories,
      [SHEET_TABS.RECONCILIATIONS]: s.reconciliations,
      [SHEET_TABS.RECONCILE_DRAFTS]: s.reconcileDrafts,
    };
  }, []);

  const save = useCallback(async () => {
    const s = stateRef.current;
    if (!s.isAuthenticated) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      let id = s.spreadsheetId;
      if (!id) {
        const title = s.meta.title || APP_TITLE;
        id = await createSpreadsheet(title);
        dispatch({ type: 'SET_SPREADSHEET', payload: { id, title } });
        dispatch({ type: 'SET_META', payload: { title } });
        localStorage.setItem('defaultSpreadsheetId', id);
      }
      await writeAllTabs(id, getAppData());
      markClean();
      dispatch({ type: 'SET_META', payload: { lastSaved: new Date().toISOString() } });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      // Save failed — offer a local JSON download so no changes are lost
      try {
        const data = getAppData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MyAccountTracker-backup-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch { /* ignore download errors */ }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getAppData]);

  const load = useCallback(async (sheetId) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const data = await readAllTabs(sheetId);
      dispatch({ type: 'LOAD_DATA', payload: data });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id: sheetId, title: data[SHEET_TABS.META]?.[0]?.title || '' } });
      localStorage.setItem('defaultSpreadsheetId', sheetId);
      markClean();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const createNew = useCallback(async (title, owner) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const meta = { title, owner, lastSaved: new Date().toISOString(), version: CURRENT_SHEET_FORMAT_VERSION };
      const id = await createSpreadsheet(title);
      dispatch({ type: 'CLEAR_DATA' });
      dispatch({ type: 'SET_META', payload: meta });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id, title } });
      localStorage.setItem('defaultSpreadsheetId', id);

      // Write initial meta
      const created = await writeAllTabs(id, {
        [SHEET_TABS.META]: [meta],
        [SHEET_TABS.ACCOUNTS]: [],
        transactions: [],
        [SHEET_TABS.PAYEES]: [],
        [SHEET_TABS.CATEGORIES]: [],
        [SHEET_TABS.RECONCILIATIONS]: [],
        [SHEET_TABS.RECONCILE_DRAFTS]: [],
      });
      if (created.formatVersion !== CURRENT_SHEET_FORMAT_VERSION) {
        throw new Error(`New file was created with Format ${created.formatVersion || 'unknown'} instead of Format ${CURRENT_SHEET_FORMAT_VERSION}.`);
      }
      markClean();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const saveAs = useCallback(async (title) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const id = await createSpreadsheet(title);
      dispatch({ type: 'SET_META', payload: { title, lastSaved: new Date().toISOString(), version: CURRENT_SHEET_FORMAT_VERSION } });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id, title } });
      localStorage.setItem('defaultSpreadsheetId', id);
      const saved = await writeAllTabs(id, {
        ...getAppData(),
        [SHEET_TABS.META]: [{ ...stateRef.current.meta, title, lastSaved: new Date().toISOString(), version: CURRENT_SHEET_FORMAT_VERSION }],
      });
      if (saved.formatVersion !== CURRENT_SHEET_FORMAT_VERSION) {
        throw new Error(`Save As created a Format ${saved.formatVersion || 'unknown'} file instead of Format ${CURRENT_SHEET_FORMAT_VERSION}.`);
      }
      markClean();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getAppData]);

  const migrateToV2 = useCallback(async () => {
    const s = stateRef.current;
    if (!s.spreadsheetId) throw new Error('Open a Format 1 spreadsheet before converting it.');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const result = await migrateV1ToV2({ spreadsheetId: s.spreadsheetId, data: getAppData() });
      await load(result.targetId);
      return result;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getAppData, load]);

  const rebuildV2Ledger = useCallback(async () => {
    const s = stateRef.current;
    if (!s.spreadsheetId || s.meta.version !== CURRENT_SHEET_FORMAT_VERSION) throw new Error('Open a Format 2 spreadsheet before rebuilding its ledger.');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const result = await synchronizeAndValidateV2Ledger(s.spreadsheetId);
      await load(s.spreadsheetId);
      return result.report;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [load]);

  // Wrap dispatch to mark dirty on data changes
  const dispatchWithDirty = useCallback((action) => {
    dispatch(action);
    const dataActions = [
      'ADD_ACCOUNT', 'IMPORT_ACCOUNTS', 'UPDATE_ACCOUNT', 'DELETE_ACCOUNT',
      'ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'IMPORT_TRANSACTIONS',
      'ADD_TRANSFER', 'UPDATE_TRANSFER', 'DELETE_TRANSFER',
      'ADD_PAYEE', 'DELETE_PAYEE',
      'ADD_CATEGORY', 'DELETE_CATEGORY',
      'ADD_RECONCILIATION', 'UPDATE_TRANSACTIONS_BATCH', 'SAVE_RECONCILE_DRAFT', 'DELETE_RECONCILE_DRAFT', 'SET_META',
    ];
    if (dataActions.includes(action.type)) {
      markDirty();
    }
  }, []);

  // Auto-save setup
  useEffect(() => {
    const cleanup = initAutoSave(save);
    const unsubscribe = onStatusChange((status) => {
      dispatch({ type: 'SET_SAVE_STATUS', payload: status });
    });
    return () => {
      cleanup();
      unsubscribe();
    };
  }, [save]);

  const value = {
    state,
    dispatch: dispatchWithDirty,
    save,
    load,
    createNew,
    saveAs,
    migrateToV2,
    rebuildV2Ledger,
    generateUUID,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
