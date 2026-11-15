const DB_NAME = 'myaccounttracker-sync-v1';
const DB_VERSION = 1;
let lastSequence = 0;

export function openSyncDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audit')) db.createObjectStore('audit', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('locators')) db.createObjectStore('locators', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workbooks')) db.createObjectStore('workbooks', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withStore(name, mode, action) {
  const db = await openSyncDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      const request = action(transaction.objectStore(name));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const listOperations = () => withStore('outbox', 'readonly', (store) => store.getAll());
export const putOperation = (operation) => withStore('outbox', 'readwrite', (store) => store.put(operation));
export const appendAudit = (entry) => withStore('audit', 'readwrite', (store) => store.put(entry));
export const getLocator = (id) => withStore('locators', 'readonly', (store) => store.get(id));
export const putLocator = (locator) => withStore('locators', 'readwrite', (store) => store.put(locator));

export async function queueOperation(workbookId, kind, payload, entityIds = []) {
  const operation = {
    id: crypto.randomUUID(), workbookId, kind, payload, entityIds,
    createdAt: new Date().toISOString(),
    sequence: (lastSequence = Math.max(Date.now() * 1000, lastSequence + 1)),
    status: 'queued', attempts: 0,
  };
  await putOperation(operation);
  await appendAudit({ ...operation, id: `${operation.id}:queued` });
  return operation;
}

export async function exportSyncRecovery(workbookId, currentState) {
  const [outbox, audit] = await Promise.all([
    listOperations(), withStore('audit', 'readonly', (store) => store.getAll()),
  ]);
  return {
    exportedAt: new Date().toISOString(), workbookId, currentState,
    pendingOutbox: outbox.filter((item) => item.workbookId === workbookId && item.status !== 'acknowledged'),
    audit: audit.filter((item) => item.workbookId === workbookId),
  };
}

export async function exportAuditCsv(workbookId) {
  const events = (await withStore('audit', 'readonly', (store) => store.getAll()))
    .filter((entry) => entry.workbookId === workbookId)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const columns = ['operationId', 'createdAt', 'kind', 'status', 'attempts', 'entityIds', 'error', 'changes'];
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = events.map((entry) => [
    entry.id.split(':')[0], entry.createdAt, entry.kind, entry.status,
    entry.attempts, (entry.entityIds || []).join(';'), entry.error || '',
    JSON.stringify(entry.payload?.changes || []),
  ]);
  return [columns, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
}
