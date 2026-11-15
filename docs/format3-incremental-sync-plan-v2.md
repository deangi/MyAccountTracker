# MyAccountTracker — Format 3 and Incremental Sync Plan

**Plan version:** 2.0  
**Date:** 2026-11-14  
**Baseline:** application v2.34, Git commit `c666912`

## Purpose

Replace the fragile full-workbook save path with reliable, incremental Google Sheets updates while removing the persisted duplicate journal data. Format 3 makes each account register (`txn_*`) the canonical transaction store. Double-entry journal data is generated only in memory for validation and reports.

This plan is deliberately conservative: no automatic reconstruction of register transactions from a journal is permitted. In particular, a missing register must never cause check numbers or other transaction fields to be discarded.

## Agreed design

- **Format 3 canonical data:** `_meta`, accounts, payees, categories, reconciliation data, drafts, and one register tab per account. Persisted `chart_of_accounts`, `journal_entries`, and `postings` tabs are removed from the Format 3 file format.
- **Derived accounting:** validation, Balance Sheet, and Profit & Loss generate chart, journal, and postings from active register rows in memory.
- **Incremental sync:** after a user commits a GUI action, an ordered update is durably queued and sent to Sheets by one worker. It is not sent on every keystroke.
- **Transaction location:** each transaction retains a cached `{ accountId, sheetId, rowNumber, rowVersion }` locator. The transaction ID remains authoritative; a mismatch triggers a re-index and then a conflict, never a blind overwrite.
- **Deletion:** transactions are tombstoned in their register row (with deletion time and operation ID) rather than physically removed. Load ignores tombstones; audit and repair can inspect them.
- **Lists:** payees and categories are append-only. Transaction entry, edit, and import automatically add missing payees/categories as part of the same logical changeset. Existing list entries are not deleted.
- **Authentication:** token expiry pauses the affected queue item, attempts silent reauthentication, then prompts for sign-in if needed. Pending data remains durable until it is acknowledged.
- **Save As:** first drain and verify the queue, then use Google Drive file copy, update the new file metadata, verify it, and switch to the copy. It is not a rebuild of all tabs.
- **Fallback:** a full staged rebuild is reserved for migration, import/repair, and explicit recovery—not normal editing.

## Phased implementation

### Phase 1 — Format 3 safety and migration

1. Define and document the Format 3 tab schemas, including transaction tombstone/version fields and `_meta.formatVersion = 3`.
2. Make V2 read-only/protected for this purpose: load its canonical `txn_*` registers, but never auto-recover transactions from persisted journal/posting tabs.
3. Build a backup-first V2-to-V3 converter:
   - validate every V2 register record, including check numbers;
   - stop with a clear recovery report if registers are missing or incomplete;
   - create a local JSON safety snapshot and validation report;
   - rename the original file to `— Backup Before Format 3 Migration — <timestamp>`;
   - create the V3 file with the original name;
   - write only canonical V3 tabs;
   - re-read and compare all records field-by-field (or by deterministic hashes) before reporting success.
4. Add migration tests for normal files, transfers, reconciliations, empty fields, tombstones, and interrupted/failed conversion.

**Exit condition:** a V2 sheet can be converted without loss of transaction values, especially check numbers, and a failed conversion leaves the original usable.

### Phase 2 — Durable incremental-sync foundation

1. Add IndexedDB stores for the outbox, append-only audit log, transaction locator index, and workbook revision/status.
2. Implement a single FIFO Web Worker per open workbook. The UI persists an operation before the worker can send it.
3. Define operation states: `queued`, `sending`, `acknowledged`, `retrying`, `waitingForAuthentication`, `conflict`, and `failed`.
4. Add sync status in the UI: pending count, last successful sync, failed/conflicted count, retry action, and exportable recovery bundle.
5. Add access-token handoff, silent renewal, sign-in prompt, exponential retry for transient failures, and exact post-write verification.
6. Add an audit export as CSV plus a recovery JSON bundle containing current state, pending outbox, and audit tail. Never include credentials or access tokens.

**Exit condition:** closing, reloading, losing network access, or expiring authentication cannot lose a committed user action; queued work resumes safely after sign-in.

### Phase 3 — Incremental GUI operations

Implement each user-visible mutation as an explicit, verified changeset. The main thread updates the in-memory model only after the changeset is persisted locally.

| GUI action | Incremental Sheets operation |
| --- | --- |
| Add/edit transaction | Append or replace its full canonical row; edit verifies transaction ID and advances `rowVersion`. |
| Move transaction to another account | Tombstone source row and append destination row as one operation. |
| Delete transaction | Tombstone its row; retain identifying details and audit record. |
| Add/edit account | Append/update accounts row; create or rename register tab while preserving sheet ID. |
| Delete account | Archive by default; require a special explicit workflow for destructive removal. |
| Add payee/category, including implied additions | Append missing master-list rows in the same changeset as the transaction/import. |
| Import accounts/transactions | Validated batch operation; full staged rebuild remains available if batch size or repair needs justify it. |

The existing Payee/Category delete controls should be removed or disabled to match the append-only policy. Future rename support must update the master row and all active matching transactions as a compound operation.

**Exit condition:** ordinary account, transaction, payee, category, and import activity is durably and incrementally reflected in the sheet with no normal Save command required.

### Phase 4 — Compound accounting workflows

1. Implement transfers as two-register atomic logical operations; either both rows are acknowledged or the operation remains pending/conflicted.
2. Implement reconciliation draft save/suspend/discard as queue operations. Reconciliation completion updates its history row, selected transaction flags/IDs, and draft removal as one compound operation.
3. Permit add/edit transactions during reconciliation; recalculate checked deposits and payouts from the canonical transaction model.
4. Generate the double-entry ledger in memory for validation, Balance Sheet, and P&L. Retain current P&L rules: operating accounts only (checking, savings, credit card), transfers excluded, category netting, alphabetical presentation, and zero net categories under expenses.
5. Treat manual Sheets row movement or unexpected row IDs as a re-index/conflict event, never a silent update to the wrong transaction.

**Exit condition:** transfers and reconciliation remain consistent through retries, reloads, token expiry, and user interruption, while reports/validation require no persisted journal tabs.

### Phase 5 — File operations, repair, and optional local files

1. Replace normal Save with **Sync Status** and **Retry Failed Changes**. Retain an explicit repair/rebuild command with a prominent warning and before/after verification.
2. Implement Save As by requiring a drained, verified queue and copying the Google Drive file, then validating the copied Format 3 workbook before switching the app to it. Google Drive's `files.copy` operation supports this model; its `drive.file` scope is appropriate for files the app created or opened through Picker. [Google Drive files.copy](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy) and [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
3. Add a repair wizard for import/migration failures that prefers the local JSON recovery bundle or Google version history over guessed transaction reconstruction.
4. Optionally add browser-local `.xlsx` open/export using SheetJS, with download/upload everywhere and File System Access API direct save where the browser supports it. This is an additional storage option, not a replacement for the Format 3 validation rules. [SheetJS documentation](https://docs.sheetjs.com/docs/) and [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API).

**Exit condition:** copying, repairing, and optionally using a local workbook cannot bypass queue draining, schema validation, or field-preservation checks.

## Release and test gates

Each phase is released behind a test gate. The mandatory scenarios are: V2 migration with check numbers, token expiry before/during/after an update, offline/reload recovery, rejected Sheets write, duplicate retry prevention, row relocation, partial transfer/reconciliation attempts, import rollback, Save As with pending work, and comparison of source versus generated reporting/validation data.

No phase advances on a migration or sync test that loses a field, creates a duplicate transaction, or writes a transaction to the wrong account register.
