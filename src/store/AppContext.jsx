import { ensureTransactionNamesInMasterList, reduceAppState } from './appReducer';
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
  return reduceAppState(state, action, initialState, SHEET_TABS, V2_LEDGER_TABS);
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
      const transactions = data.transactions || [];
      const repairedPayees = ensureTransactionNamesInMasterList(data[SHEET_TABS.PAYEES] || [], transactions, 'payee', 'recovered-payee');
      const repairedCategories = ensureTransactionNamesInMasterList(data[SHEET_TABS.CATEGORIES] || [], transactions, 'category', 'recovered-category');
      const repaired = repairedPayees.length !== (data[SHEET_TABS.PAYEES] || []).length
        || repairedCategories.length !== (data[SHEET_TABS.CATEGORIES] || []).length;
      if (repaired) {
        data[SHEET_TABS.PAYEES] = repairedPayees;
        data[SHEET_TABS.CATEGORIES] = repairedCategories;
      }
      dispatch({ type: 'LOAD_DATA', payload: data });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id: sheetId, title: data[SHEET_TABS.META]?.[0]?.title || '' } });
      localStorage.setItem('defaultSpreadsheetId', sheetId);
      if (repaired) markDirty();
      else markClean();
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
      'ADD_PAYEE', 'IMPORT_PAYEES', 'DELETE_PAYEE',
      'ADD_CATEGORY', 'IMPORT_CATEGORIES', 'DELETE_CATEGORY',
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
