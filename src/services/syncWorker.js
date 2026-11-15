import { appendAudit, listOperations, putOperation } from './syncOutbox';
import { applyChanges } from './syncSheets';

let workbookId = null;
let token = null;
let running = false;

async function status() {
  const operations = (await listOperations()).filter((item) => item.workbookId === workbookId);
  const pending = operations.filter((item) => item.status !== 'acknowledged');
  const lastSyncedAt = operations.filter((item) => item.acknowledgedAt)
    .map((item) => item.acknowledgedAt).sort().at(-1) || '';
  self.postMessage({ type: 'status', pending: pending.length,
    failed: pending.filter((item) => item.status === 'failed' || item.status === 'conflict').length,
    conflict: pending.some((item) => item.status === 'conflict'),
    lastSyncedAt,
    waitingForAuthentication: pending.some((item) => item.status === 'waitingForAuthentication') });
}

async function run() {
  if (running || !workbookId) return;
  running = true;
  try {
    for (const operation of (await listOperations())
      .filter((item) => item.workbookId === workbookId && item.status !== 'acknowledged')
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.createdAt.localeCompare(b.createdAt))) {
      if (operation.status === 'conflict') break;
      if (!token) {
        operation.status = 'waitingForAuthentication';
        await putOperation(operation);
        self.postMessage({ type: 'authenticationRequired' });
        break;
      }
      try {
        operation.status = 'sending';
        operation.attempts += 1;
        await putOperation(operation);
        await applyChanges(workbookId, token, operation);
        operation.status = 'acknowledged';
        operation.acknowledgedAt = new Date().toISOString();
        operation.error = '';
        await putOperation(operation);
        await appendAudit({ ...operation, id: `${operation.id}:acknowledged` });
      } catch (error) {
        operation.status = error.auth ? 'waitingForAuthentication' : /changed|disappeared|Duplicate|Unexpected/.test(error.message) ? 'conflict' : 'failed';
        operation.error = error.message;
        await putOperation(operation);
        await appendAudit({ ...operation, id: `${operation.id}:${operation.status}:${operation.attempts}` });
        if (error.auth) self.postMessage({ type: 'authenticationRequired' });
        else self.postMessage({ type: 'error', message: error.message });
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  } finally {
    running = false;
    await status();
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'open') { workbookId = message.workbookId; token = message.token; void run(); }
  if (message.type === 'token') { token = message.token; void run(); }
  if (message.type === 'retry') void run();
  if (message.type === 'status') void status();
};
