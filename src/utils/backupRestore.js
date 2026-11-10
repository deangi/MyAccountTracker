import { validateV1Data } from '../services/formatMigration';
import { SHEET_TABS } from '../config';

const REQUIRED_ARRAYS = [
  SHEET_TABS.ACCOUNTS,
  'transactions',
  SHEET_TABS.PAYEES,
  SHEET_TABS.CATEGORIES,
  SHEET_TABS.RECONCILIATIONS,
];

function requireArray(backup, key) {
  if (!Array.isArray(backup[key])) throw new Error(`The backup is missing its ${key} list.`);
  return backup[key];
}

// A downloaded failure backup is canonical application data, rather than a
// complete Google workbook.  Keep this preparation pure so no server write can
// happen until the user explicitly selects Save after restoring.
export function prepareBackupRestore(backup, targetMeta) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new Error('The selected file is not a MyAccountTracker JSON backup.');
  }
  const backupMeta = requireArray(backup, SHEET_TABS.META)[0];
  if (!backupMeta || typeof backupMeta !== 'object') throw new Error('The backup is missing its file metadata.');
  for (const key of REQUIRED_ARRAYS) requireArray(backup, key);

  const backupVersion = String(backupMeta.version || '1');
  const targetVersion = String(targetMeta?.version || '1');
  if (backupVersion !== targetVersion) {
    throw new Error(`This is a Format ${backupVersion} backup, but the open file is Format ${targetVersion}. Restore backups only into a file with the same format.`);
  }

  const data = {
    [SHEET_TABS.META]: [{
      ...backupMeta,
      // A restore replaces account data, not the identity of the selected
      // Google workbook.  Its title/version remain those of the open target.
      title: targetMeta?.title || backupMeta.title || '',
      owner: targetMeta?.owner || backupMeta.owner || '',
      version: targetVersion,
    }],
    [SHEET_TABS.ACCOUNTS]: backup[SHEET_TABS.ACCOUNTS],
    transactions: backup.transactions,
    [SHEET_TABS.PAYEES]: backup[SHEET_TABS.PAYEES],
    [SHEET_TABS.CATEGORIES]: backup[SHEET_TABS.CATEGORIES],
    [SHEET_TABS.RECONCILIATIONS]: backup[SHEET_TABS.RECONCILIATIONS],
    [SHEET_TABS.RECONCILE_DRAFTS]: Array.isArray(backup[SHEET_TABS.RECONCILE_DRAFTS])
      ? backup[SHEET_TABS.RECONCILE_DRAFTS] : [],
  };
  const validation = validateV1Data(data);
  if (validation.errors.length) throw new Error(`Backup validation failed:\n${validation.errors.join('\n')}`);
  return {
    data,
    warnings: validation.warnings,
    counts: {
      accounts: data[SHEET_TABS.ACCOUNTS].length,
      transactions: data.transactions.length,
      payees: data[SHEET_TABS.PAYEES].length,
      categories: data[SHEET_TABS.CATEGORIES].length,
      reconciliations: data[SHEET_TABS.RECONCILIATIONS].length,
    },
    backupTitle: backupMeta.title || '(untitled backup)',
    backupVersion,
  };
}
