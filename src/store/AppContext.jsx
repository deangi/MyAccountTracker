import { ensureTransactionNamesInMasterList, reduceAppState } from './appReducer';
import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { buildV2LedgerData, copySpreadsheet, createSpreadsheet, getSpreadsheetTitle, readAllTabs, readWorkbookSnapshot, renameSpreadsheet, updateWorkbookMeta, writeAllTabs } from '../services/googleSheets';
import { assertWorkbookCopy } from '../utils/workbookCopy';
import { overlayPendingOperations } from '../utils/pendingOverlay';
import { assertExactCanonicalCopy, migrateToV3 as migrateSpreadsheetToV3, validateV1Data, validateV2Ledger } from '../services/formatMigration';
import { initAutoSave, markDirty, markClean, resetSaveStatus, getAutoSaveStatus, onStatusChange } from '../services/autoSave';
import { generateUUID } from '../utils/uuid';
import { prepareBackupRestore } from '../utils/backupRestore';
import { CURRENT_SHEET_FORMAT_VERSION, SHEET_TABS, V2_LEDGER_TABS, APP_TITLE } from '../config';
import { getAccessToken, renewAccessTokenSilently } from '../services/googleAuth';
import { exportAuditCsv, exportSyncRecovery, listOperations } from '../services/syncOutbox';
import { queueOperation } from '../services/syncOutbox';
import { changesForAction } from '../services/syncChanges';

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
  syncStatus: { pending: 0, failed: 0, conflict: false, lastSyncedAt: '', waitingForAuthentication: false },
};

function reducer(state, action) {
  return reduceAppState(state, action, initialState, SHEET_TABS, V2_LEDGER_TABS);
}

function compareLedgerRecords(before = [], after = [], fields) {
  const previous = new Map(before.map((record) => [record.id, record]));
  const current = new Map(after.map((record) => [record.id, record]));
  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const [id, record] of current) {
    const prior = previous.get(id);
    if (!prior) added += 1;
    else if (fields.some((field) => String(prior[field] ?? '') !== String(record[field] ?? ''))) updated += 1;
  }
  for (const id of previous.keys()) if (!current.has(id)) removed += 1;
  return { added, removed, updated };
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncWorkerRef = useRef(null);
  const projectedStateRef = useRef(null);
  const queueChainRef = useRef(Promise.resolve());
  const requiresFullSaveRef = useRef(false);
  const fileOperationRef = useRef(false);

  const waitForSyncIdle = useCallback(async (workbookId) => {
    await queueChainRef.current;
    syncWorkerRef.current?.postMessage({ type: 'retry' });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const pending = (await listOperations()).filter((item) => item.workbookId === workbookId && item.status !== 'acknowledged');
      if (!pending.length) return;
      const blocked = pending.find((item) => ['failed', 'conflict', 'waitingForAuthentication'].includes(item.status));
      if (blocked) throw new Error(`Sync is ${blocked.status}: ${blocked.error || 'sign in or retry the pending change before copying.'}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Timed out waiting for pending changes to sync. The source file was not copied.');
  }, []);

  useEffect(() => {
    if (!state.spreadsheetId || state.meta.version !== '3') return undefined;
    const workbookId = state.spreadsheetId;
    const worker = new Worker(new URL('../services/syncWorker.js', import.meta.url), { type: 'module' });
    syncWorkerRef.current = worker;
    worker.onmessage = async ({ data }) => {
      if (stateRef.current.spreadsheetId !== workbookId) return;
      if (data.type === 'status') {
        dispatch({ type: 'SET_SYNC_STATUS', payload: data });
        if (data.pending === 0 && !requiresFullSaveRef.current) markClean();
      }
      if (data.type === 'error') dispatch({ type: 'SET_ERROR', payload: data.message });
      if (data.type === 'authenticationRequired') {
        const renewed = await renewAccessTokenSilently();
        if (renewed) worker.postMessage({ type: 'token', token: getAccessToken() });
        else dispatch({ type: 'SET_ERROR', payload: 'Google sign-in is required to resume pending sheet updates.' });
      }
    };
    worker.postMessage({ type: 'open', workbookId, token: getAccessToken() });
    return () => { worker.terminate(); syncWorkerRef.current = null; };
  }, [state.spreadsheetId, state.meta.version]);

  useEffect(() => {
    if (state.isAuthenticated) syncWorkerRef.current?.postMessage({ type: 'token', token: getAccessToken() });
  }, [state.isAuthenticated]);

  const retrySync = useCallback(() => syncWorkerRef.current?.postMessage({ type: 'retry' }), []);

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

  const downloadSyncRecovery = useCallback(async () => {
    const s = stateRef.current;
    const recovery = await exportSyncRecovery(s.spreadsheetId, getAppData());
    const url = URL.createObjectURL(new Blob([JSON.stringify(recovery, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `MyAccountTracker-sync-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [getAppData]);

  const downloadSyncAudit = useCallback(async () => {
    const csv = await exportAuditCsv(stateRef.current.spreadsheetId);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `MyAccountTracker-sync-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const save = useCallback(async () => {
    if (fileOperationRef.current) return false;
    const s = stateRef.current;
    if (!s.isAuthenticated) return;
    await queueChainRef.current;
    const pending = (await listOperations()).filter((operation) => operation.workbookId === s.spreadsheetId && operation.status !== 'acknowledged');
    if (pending.length) throw new Error(`Wait for ${pending.length} pending sync operation(s) before saving.`);
    if (s.meta.version === '3' && s.spreadsheetId) {
      if (requiresFullSaveRef.current) throw new Error('These changes require a repair copy. Download a JSON recovery bundle, then use Repair from JSON Backup.');
      markClean();
      return true;
    }
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
      requiresFullSaveRef.current = false;
      markClean();
      dispatch({ type: 'SET_META', payload: { lastSaved: new Date().toISOString() } });
      return true;
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
      return false;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getAppData]);

  const load = useCallback(async (sheetId) => {
    if (fileOperationRef.current) throw new Error('Wait for the file operation to finish before opening another file.');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      let data = await readAllTabs(sheetId);
      const pending = (await listOperations()).filter((item) => item.workbookId === sheetId && item.status !== 'acknowledged');
      if (pending.length && data.formatVersion === '3') data = overlayPendingOperations(data, pending);
      let transactions = data.transactions || [];
      const hasMissingRegisters = transactions.length === 0
        && data[SHEET_TABS.META]?.[0]?.version === '2'
        && (data[V2_LEDGER_TABS.JOURNAL_ENTRIES] || []).length > 0
        && (data[V2_LEDGER_TABS.POSTINGS] || []).length > 0;
      if (hasMissingRegisters) throw new Error('This Format 2 file has an empty account register while its legacy ledger still has data. It cannot be opened safely because check numbers cannot be recovered. Restore a JSON backup or a Google Sheets version before converting to Format 3.');
      const repairedPayees = ensureTransactionNamesInMasterList(data[SHEET_TABS.PAYEES] || [], transactions, 'payee', 'recovered-payee');
      const repairedCategories = ensureTransactionNamesInMasterList(data[SHEET_TABS.CATEGORIES] || [], transactions, 'category', 'recovered-category');
      const repaired = repairedPayees.length !== (data[SHEET_TABS.PAYEES] || []).length
        || repairedCategories.length !== (data[SHEET_TABS.CATEGORIES] || []).length
        ;
      if (repaired) {
        data[SHEET_TABS.PAYEES] = repairedPayees;
        data[SHEET_TABS.CATEGORIES] = repairedCategories;
      }
      dispatch({ type: 'LOAD_DATA', payload: data });
      projectedStateRef.current = null;
      requiresFullSaveRef.current = false;
      dispatch({ type: 'SET_SPREADSHEET', payload: { id: sheetId, title: data[SHEET_TABS.META]?.[0]?.title || '' } });
      localStorage.setItem('defaultSpreadsheetId', sheetId);
      if (repaired || pending.length) markDirty();
      else markClean();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const close = useCallback(async () => {
    if (fileOperationRef.current) throw new Error('Wait for the file operation to finish before closing.');
    const s = stateRef.current;
    if (!s.spreadsheetId) return;
    if (s.meta.version === '1' && getAutoSaveStatus().hasUnsavedChanges) {
      const saved = await save();
      if (saved !== true) throw new Error('The workbook could not be saved. It remains open.');
    }
    fileOperationRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (s.meta.version === '3') {
        if (requiresFullSaveRef.current) throw new Error('Unsynced changes require repair before closing. Download a sync recovery bundle first.');
        await waitForSyncIdle(s.spreadsheetId);
      }
      localStorage.removeItem('defaultSpreadsheetId');
      projectedStateRef.current = null;
      requiresFullSaveRef.current = false;
      dispatch({ type: 'CLEAR_DATA' });
      resetSaveStatus();
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    } finally {
      fileOperationRef.current = false;
    }
  }, [save, waitForSyncIdle]);

  const createNew = useCallback(async (title, owner) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const meta = { title, owner, lastSaved: new Date().toISOString(), version: CURRENT_SHEET_FORMAT_VERSION };
      const id = await createSpreadsheet(title);
      dispatch({ type: 'CLEAR_DATA' });
      projectedStateRef.current = null;
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
    if (fileOperationRef.current) throw new Error('Another file operation is in progress.');
    fileOperationRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const source = stateRef.current;
      if (!source.spreadsheetId || source.meta.version !== '3') throw new Error('Save As requires an open Format 3 file.');
      if (requiresFullSaveRef.current) throw new Error('Unsynced changes require repair before Save As.');
      await waitForSyncIdle(source.spreadsheetId);
      const original = await readWorkbookSnapshot(source.spreadsheetId);
      const temporaryTitle = `${title} — Copy In Progress — ${new Date().toISOString()}`;
      const id = await copySpreadsheet(source.spreadsheetId, temporaryTitle);
      try {
        await updateWorkbookMeta(id, { title });
        assertWorkbookCopy(original, await readWorkbookSnapshot(id), title);
        if (JSON.stringify(original) !== JSON.stringify(await readWorkbookSnapshot(source.spreadsheetId))) {
          throw new Error('The source changed while it was being copied.');
        }
        await renameSpreadsheet(id, title);
        if (await getSpreadsheetTitle(id) !== title) throw new Error('The copied file name did not verify.');
        if ((await readAllTabs(id)).formatVersion !== CURRENT_SHEET_FORMAT_VERSION) throw new Error('The copy did not reopen as Format 3.');
      } catch (error) {
        throw new Error(`Copy verification failed. The source is unchanged. Inspect the incomplete copy (${id}): ${error.message}`);
      }
      dispatch({ type: 'SET_META', payload: { title } });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id, title } });
      projectedStateRef.current = null;
      localStorage.setItem('defaultSpreadsheetId', id);
      markClean();
      return { id, title };
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      fileOperationRef.current = false;
    }
  }, [waitForSyncIdle]);

  const migrateToV3 = useCallback(async () => {
    const s = stateRef.current;
    if (!s.spreadsheetId) throw new Error('Open a Format 1 or Format 2 spreadsheet before converting it.');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const result = await migrateSpreadsheetToV3({ spreadsheetId: s.spreadsheetId, data: getAppData() });
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
    if (!s.spreadsheetId || s.meta.version === '1') throw new Error('Open a Format 2 or Format 3 spreadsheet before validating its ledger.');
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      // Validation works from current in-memory registers. Corrections are
      // staged locally and become durable only through the normal Save path.
      const appData = getAppData();
      const sourceValidation = validateV1Data(appData);
      if (sourceValidation.errors.length) throw new Error(`Ledger validation failed:\n${sourceValidation.errors.join('\n')}`);
      const ledger = buildV2LedgerData(appData);
      const validation = validateV2Ledger({ ...appData, ...ledger });
      if (validation.errors.length) throw new Error(`Ledger validation failed:\n${validation.errors.join('\n')}`);
      const report = {
        transactionCount: appData.transactions.length,
        journalEntryCount: ledger.journal_entries.length,
        postingCount: ledger.postings.length,
        journalEntries: s.meta.version === '3' ? { added: 0, removed: 0, updated: 0 }
          : compareLedgerRecords(s.journalEntries, ledger.journal_entries, ['date', 'description', 'sourceTransactionIds', 'createdAt']),
        postings: s.meta.version === '3' ? { added: 0, removed: 0, updated: 0 }
          : compareLedgerRecords(s.postings, ledger.postings, ['journalEntryId', 'accountId', 'debit', 'credit', 'payee', 'category', 'sourceTransactionId', 'reconciliationId']),
      };
      return report;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getAppData]);

  const restoreBackup = useCallback((backup) => {
    const s = stateRef.current;
    if (!s.spreadsheetId) throw new Error('Open the Google Sheet you want to restore before selecting a backup.');
    const restored = prepareBackupRestore(backup, s.meta);
    dispatch({ type: 'LOAD_DATA', payload: restored.data });
    dispatch({ type: 'SET_SPREADSHEET', payload: { id: s.spreadsheetId, title: s.spreadsheetTitle } });
    // Deliberately stage only. The user must inspect the restored data and
    // choose Save before writeAllTabs changes the selected Google Sheet.
    markDirty();
    return restored;
  }, []);

  const repairFromBackup = useCallback(async (backupFile) => {
    if (fileOperationRef.current) throw new Error('Another file operation is in progress.');
    const source = stateRef.current;
    if (!source.spreadsheetId || source.meta.version !== '3') throw new Error('Open a Format 3 file before repairing it.');
    const backup = backupFile?.currentState || backupFile;
    const restored = prepareBackupRestore(backup, source.meta);
    const prepared = {
      ...restored.data,
      transactions: restored.data.transactions.map((transaction) => ({
        ...transaction, deleted: 'FALSE', deletedAt: '', deletedByOperationId: '',
        rowVersion: transaction.rowVersion || '1', lastOperationId: transaction.lastOperationId || '',
      })),
    };
    fileOperationRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // Repair changes only a copied workbook. The source and its queued
      // operations remain available if the rebuild or read-back fails.
      const title = `${source.meta.title || source.spreadsheetTitle} — Repaired`;
      const temporaryTitle = `${title} — In Progress — ${new Date().toISOString()}`;
      const id = await copySpreadsheet(source.spreadsheetId, temporaryTitle);
      try {
        prepared[SHEET_TABS.META] = [{ ...prepared[SHEET_TABS.META][0], title, lastSaved: new Date().toISOString() }];
        await writeAllTabs(id, prepared);
        assertExactCanonicalCopy(prepared, await readAllTabs(id));
        await renameSpreadsheet(id, title);
        if (await getSpreadsheetTitle(id) !== title) throw new Error('The repaired file name did not verify.');
      } catch (error) {
        throw new Error(`Repair verification failed. The original is unchanged. Inspect the incomplete copy (${id}): ${error.message}`);
      }
      dispatch({ type: 'LOAD_DATA', payload: prepared });
      dispatch({ type: 'SET_SPREADSHEET', payload: { id, title } });
      projectedStateRef.current = null;
      requiresFullSaveRef.current = false;
      localStorage.setItem('defaultSpreadsheetId', id);
      markClean();
      return { id, title, ...restored };
    } finally {
      fileOperationRef.current = false;
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Wrap dispatch to mark dirty on data changes
  const dispatchWithDirty = useCallback(async (action) => {
    if (fileOperationRef.current) {
      dispatch({ type: 'SET_ERROR', payload: 'Wait for the file operation to finish before editing.' });
      return false;
    }
    const dataActions = [
      'ADD_ACCOUNT', 'IMPORT_ACCOUNTS', 'UPDATE_ACCOUNT', 'DELETE_ACCOUNT',
      'ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'IMPORT_TRANSACTIONS',
      'ADD_TRANSFER', 'UPDATE_TRANSFER', 'DELETE_TRANSFER',
      'ADD_PAYEE', 'IMPORT_PAYEES', 'DELETE_PAYEE',
      'ADD_CATEGORY', 'IMPORT_CATEGORIES', 'DELETE_CATEGORY',
      'ADD_RECONCILIATION', 'UPDATE_TRANSACTIONS_BATCH', 'SAVE_RECONCILE_DRAFT', 'DELETE_RECONCILE_DRAFT', 'SET_META',
      'COMPLETE_RECONCILIATION',
    ];
    const s = projectedStateRef.current || stateRef.current;
    const incremental = ['ADD_ACCOUNT', 'IMPORT_ACCOUNTS', 'UPDATE_ACCOUNT',
      'ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'IMPORT_TRANSACTIONS',
      'ADD_TRANSFER', 'UPDATE_TRANSFER', 'DELETE_TRANSFER',
      'ADD_PAYEE', 'IMPORT_PAYEES', 'ADD_CATEGORY', 'IMPORT_CATEGORIES',
      'SAVE_RECONCILE_DRAFT', 'DELETE_RECONCILE_DRAFT', 'COMPLETE_RECONCILIATION'];
    if (incremental.includes(action.type) && s.spreadsheetId && s.meta.version === '3') {
      const next = reduceAppState(s, action, initialState, SHEET_TABS, V2_LEDGER_TABS);
      const payload = changesForAction(s, next, action);
      projectedStateRef.current = next;
      if (payload.changes.length) {
        queueChainRef.current = queueChainRef.current.then(async () => {
          await queueOperation(s.spreadsheetId, action.type, { ...payload, accounts: next.accounts }, payload.changes.map((change) => change.id));
          dispatch(action);
          syncWorkerRef.current?.postMessage({ type: 'retry' });
        }).catch((error) => {
          projectedStateRef.current = null;
          dispatch({ type: 'SET_ERROR', payload: `The change was not applied: ${error.message}` });
          return false;
        });
        markDirty();
        return queueChainRef.current;
      }
    }
    dispatch(action);
    if (dataActions.includes(action.type)) {
      if (s.spreadsheetId && s.meta.version === '3' && !incremental.includes(action.type)) requiresFullSaveRef.current = true;
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
    close,
    createNew,
    saveAs,
    migrateToV3,
    rebuildV2Ledger,
    restoreBackup,
    repairFromBackup,
    retrySync,
    downloadSyncRecovery,
    downloadSyncAudit,
    generateUUID,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
