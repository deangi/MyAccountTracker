# Incremental Save Plan

Status: agreed design only. The current verified full-save implementation remains in use.

## Goal

Persist completed user actions to Google Sheets promptly while reducing routine save traffic and preserving a durable audit/recovery trail.

## Future import work

The current importer remains tab-separated (`.txt`/`.tsv`). CSV input support, including quoted-field handling and the same column-mapping and validation workflow, is deferred to a future implementation.

## Commit-on-action design

Changes save when the user completes an action, never while they are typing:

1. Add/edit/delete transaction: append, update, or tombstone the affected transaction row immediately.
2. Add/edit/delete payee or category: append, update, or tombstone the corresponding row immediately.
3. Add/edit/delete account: update the account row and create, update, deactivate, or retain its transaction-register tab as appropriate.
4. Transfers, reconciliation commits, and imports: send their related records in one batched operation so the linked records succeed or retry together.
5. A short queue may combine several completed actions into one Sheets API request, but it must not wait for the ordinary long autosave interval.

## Tombstones and audit history

Deleted records must not be cleared or overwritten with zeroes. Instead, retain the full original row and add deletion metadata such as:

- `isDeleted`
- `deletedAt`
- `deletedByMutationId`

Normal application views exclude tombstoned records. A future maintenance/audit view can expose them for post-mortem investigation or recovery.

Each committed action also writes a durable change-log record containing the mutation ID, timestamp, entity type and ID, operation, changed fields, prior values where appropriate, and outcome. The retry queue uses the same mutation IDs, so a failed action can be retried without duplicating it.

## Reliability and user feedback

1. Display `Saving…`, `Saved`, `Queued for retry`, or `Save failed` in the app bar.
2. Keep failed mutations locally in a retry queue until Google Sheets confirms them. Do not mark them clean merely because the UI action completed.
3. Re-read the changed rows and mutation marker after each write. Mark a mutation complete only when its ID and values match the persisted sheet.
4. Add a monotonic `saveGeneration` and `lastMutationId` to `_meta`. If the remote generation changed unexpectedly, pause the queue and offer Reload, Save As, or an explicit conflict-resolution flow.
5. Preserve the existing local JSON backup behavior for unrecoverable save failures.

## Row-location index

For efficient transaction updates, maintain an in-memory location index keyed by transaction ID:

```text
transaction ID -> { registerTabName, rowNumber, sheetId, mutationGeneration }
```

Build this index while loading each account register. An edit can then update the known row directly instead of searching the whole tab by ID. Update the mapping after every append, tombstone, account move, or register-tab rebuild.

The row number is a cache, not the transaction's permanent identity. The transaction ID remains authoritative because another session or a manual Sheets edit can move rows. Before a targeted update, confirm that the expected ID is still in the mapped row; if it is not, rebuild the affected tab's index and retry or surface a conflict. Avoid routine physical sorting of register rows, since sorting shifts all mapped row numbers. Reports can sort independently, and an explicit register reorder must rebuild its index.

## Full-save fallback

Keep the current verified full rewrite/rebuild as an explicit fallback for V2 conversion, validation, repair, migration, and detected mismatches. It remains the safety net while commit-on-action behavior is introduced and proven.

Confirmed transaction imports are also a deliberate full-save case. The app must parse, validate, preview, and deduplicate the import locally first. After the user confirms, record the entire import as one change-log mutation, apply it to local state, perform a verified full save/rebuild, and re-read the imported transaction IDs, ledger entries, and balances. Leave the import mutation in the retry queue until that verification succeeds. Small imports may later use batched incremental appends, but verified full save/rebuild is the default import path.

## Delivery sequence

1. Introduce format/version changes for tombstone, change-log, mutation-generation fields, and the row-location index metadata without changing save behavior.
2. Add queue, status display, and verification plumbing.
3. Enable commit-on-action for payees and categories, then accounts and individual transaction changes.
4. Add grouped transfers, reconciliation commits, imports, and account lifecycle changes.
5. Add conflict UX, audit/recovery view, and full-save fallback controls.
6. Exercise the workflow against representative V1/V2 files, retry failures, token expiry, and concurrent-edit scenarios before making incremental persistence the default.
