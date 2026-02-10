import { AUTO_SAVE_INTERVAL_MS } from '../config';

let saveTimer = null;
let saveFn = null;
let lastSaveTime = null;
let hasUnsavedChanges = false;
let listeners = [];

export function initAutoSave(onSave) {
  saveFn = onSave;
  resetTimer();

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    clearTimer();
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

export function markDirty() {
  hasUnsavedChanges = true;
  resetTimer();
  notifyListeners();
}

export function markClean() {
  hasUnsavedChanges = false;
  lastSaveTime = new Date();
  notifyListeners();
}

export function getAutoSaveStatus() {
  return {
    hasUnsavedChanges,
    lastSaveTime,
  };
}

export function onStatusChange(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners() {
  const status = getAutoSaveStatus();
  listeners.forEach((l) => l(status));
}

function resetTimer() {
  clearTimer();
  saveTimer = setTimeout(async () => {
    if (hasUnsavedChanges && saveFn) {
      try {
        await saveFn();
        markClean();
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }
  }, AUTO_SAVE_INTERVAL_MS);
}

function clearTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function handleBeforeUnload(e) {
  if (hasUnsavedChanges && saveFn) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    // Attempt save (best-effort, may not complete)
    saveFn().catch(() => {});
  }
}
