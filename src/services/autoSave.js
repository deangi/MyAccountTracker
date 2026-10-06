import {
  AUTO_SAVE_INTERVAL_MS,
  IDLE_THRESHOLD_MS,
  TOKEN_PREEXPIRY_SAVE_MS,
  IDLE_CHECK_INTERVAL_MS,
} from '../config';
import { getTokenAcquiredAt } from './googleAuth';

let saveTimer = null;
let idleCheckTimer = null;
let saveFn = null;
let lastSaveTime = null;
let hasUnsavedChanges = false;
let dirtySince = null;
let lastActivity = Date.now();
let preExpirySaveInFlight = false;
let listeners = [];

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

export function initAutoSave(onSave) {
  saveFn = onSave;
  lastActivity = Date.now();
  resetTimer();
  startIdleCheck();

  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    clearTimer();
    stopIdleCheck();
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, recordActivity));
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

export function markDirty() {
  if (!hasUnsavedChanges) dirtySince = Date.now();
  hasUnsavedChanges = true;
  resetTimer();
  notifyListeners();
}

export function markClean() {
  hasUnsavedChanges = false;
  dirtySince = null;
  lastSaveTime = new Date();
  notifyListeners();
}

export function getAutoSaveStatus() {
  return {
    hasUnsavedChanges,
    dirtySince,
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

function recordActivity() {
  lastActivity = Date.now();
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

function startIdleCheck() {
  stopIdleCheck();
  idleCheckTimer = setInterval(maybeSaveBeforeExpiry, IDLE_CHECK_INTERVAL_MS);
}

function stopIdleCheck() {
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer);
    idleCheckTimer = null;
  }
}

async function maybeSaveBeforeExpiry() {
  if (preExpirySaveInFlight) return;
  if (!hasUnsavedChanges || !saveFn) return;

  const tokenAcquiredAt = getTokenAcquiredAt();
  if (!tokenAcquiredAt) return;

  const now = Date.now();
  const idleFor = now - lastActivity;
  const tokenAge = now - tokenAcquiredAt;

  if (idleFor < IDLE_THRESHOLD_MS) return;
  if (tokenAge < TOKEN_PREEXPIRY_SAVE_MS) return;

  preExpirySaveInFlight = true;
  try {
    await saveFn();
    // saveFn calls markClean on success; nothing to do here
  } catch (err) {
    console.error('Pre-expiry auto-save failed:', err);
  } finally {
    preExpirySaveInFlight = false;
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
