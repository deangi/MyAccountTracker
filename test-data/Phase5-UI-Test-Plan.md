# Format 3 live UI regression test

Use this plan with a fresh Google Sheet test company. Keep the test company separate from production data. The companion fixture is `Phase5-UI-Transactions.tsv`.

## Setup and account changes

1. Open the deployed app, sign in, and use **File > New**. Name the file `MAT V3 UI Test <date>`.
2. Create one account of each type: checking, savings, retirement, property, vehicle, other asset, credit card, loan, mortgage, other liability, and equity. Name each `UI Test <Type>`.
3. Confirm all 11 accounts appear and each displayed type matches the type selected in the form. Reopen **Edit Account** for other liability and equity to verify their stored types.
4. Edit `UI Test Checking`: set nickname to `Operating Test`. Confirm the register and sidebar display the nickname while the underlying account name remains `UI Test Checking`.
5. Delete an empty test account, verify it disappears, then re-add it with the same type and name. If Delete is disabled, record this as blocked by the release rather than passed.

## Transactions

1. Import `Phase5-UI-Transactions.tsv` from any account register. It has an `Account` column, so verify that the importer routes rows to the named account tabs.
2. Expect **110 transactions**, 10 in each account. Each account has five $10 payments and five $25 deposits: payments $50, deposits $125, ending register balance **$75**. All rows should initially be unreconciled. Across all accounts: payments $550, deposits $1,375, net balance $825.
3. Open every register and confirm its count, balance, check numbers, payees, and categories. Confirm `UI Test Vendor`, `UI Test Funding`, `Test Expense`, and `Test Income` appear in the respective lists without refreshing.
4. Add one $5 EFT payment in checking, edit it to $7, then delete it. After deletion, the visible checking register should again have 10 fixture transactions and a $75 balance. Check the audit log for all three operations and the sheet row tombstone for the delete.
5. Edit one fixture transaction's description and category. Confirm the same row changes after closing and reopening the sheet, without a duplicate row.

## Reconciliation

1. Reconcile checking with statement ending balance $75 and a statement date on or after 2026-01-10. Select its 10 fixture transactions. Expected checked deposits $125, checked payouts $50, difference $0.
2. Repeat for savings and credit card. Confirm each reconciliation is recorded in history and its transactions show as cleared after reopening the sheet.
3. During one reconciliation, add a missing transaction and edit an unreconciled amount, then verify the checked totals and difference update. Use a disposable test transaction so the final fixture totals can be restored.

## Persistence and audit verification

1. Wait until the sync indicator says **Saved** and the pending queue is empty. Inspect Sync Status and export the worker audit CSV. Check that account, transaction, edit, delete, and reconcile operations are recorded, with no failed or pending entries.
2. Open the Google Sheet directly. Confirm each `txn_*` tab has its account's rows, IDs/check numbers remain populated, and deleted rows retain their data with a deletion marker. Confirm the format marker is 3 and there is no persisted journal tab.
3. Sign out, sign back in, and reopen the test company. Repeat the account counts, balances, cleared flags, payee/category lists, and reconciliation-history checks. The worker queue should remain empty.
4. Run **Validate V3 Ledger**. Record the result, any corrections, and whether a changed sheet is saved.

## Live run started 2026-11-15 (app v3.04)

- Created `MAT V3 UI Test 2026-11-15` and 11 named test accounts. Renamed the checking nickname to `Operating Test`.
- The UI displayed `other asset` for the accounts named `UI Test Other liability` and `UI Test Equity`. Their stored types still need verification in Edit Account; this may be a form interaction issue in the automated run.
- Account Delete was disabled with the tooltip `Account archiving is not available yet`; delete and re-add remain untested.
- Added two manual checking transactions: a $10 EFT payment and a $25 DEP deposit. Both use the test payees/categories. The second entry completed even though the earlier UI automation stopped after submitting it.
- Chrome initially blocked the fixture upload. After `Allow access to file URLs` was enabled, the 110-row TSV preview mapped all columns correctly and the importer reported `Imported 110 transaction(s)`.
- All 10 non-checking registers show 10 imported transactions and a $75 balance. Checking shows 12 transactions and a $90 balance because it also contains the two manual entries. The payee list shows `UI Test Funding` and `UI Test Vendor`; the category list shows `Test Expense` and `Test Income`.
- The accounts named `UI Test Other liability` and `UI Test Equity` were stored as `other asset`. Edit Account confirmed this. They were corrected through the UI and now display their intended types. This may have been caused by rapid automated account creation; it is not yet a confirmed app defect.
- **Persistence blocker:** the Format 3 worker's `IMPORT_TRANSACTIONS` operation failed with Google Sheets `Read requests per minute per user` quota exceeded. Sync Status showed three pending changes and one failed change (the import plus the two account-type edits). Several Retry attempts still failed. The app remained on `Unsaved changes`. Do not assume the 110 rows are durable in Google Sheets or reopen this file until the queue is cleared or the recovery bundle is used.
- Recovery evidence downloaded to `C:\Users\deang\Downloads\MyAccountTracker-sync-recovery-2026-11-15T19-56-56-100Z.json`; audit downloaded to `C:\Users\deang\Downloads\MyAccountTracker-sync-audit-2026-11-15T19-55-05-263Z.csv`. These contain test-company data and are intentionally outside the repository.
- At this point, transaction edit/delete, reconciliation, sheet read-back, sign-out/reopen, and final audit checks were untested because persistence was blocked. The continuation below records the subsequent results.

## Continuation on 2026-11-15 (v3.05 and v3.06)

- v3.05 batched the 110-row import by register. After signing in again, the original pending import and two account edits reached **0 pending, 0 failed**. The file reopened with the expected 11 accounts, 110 fixture rows, and two manual checking rows.
- Added a disposable $5 checking payment, edited it to $7, and deleted it. The visible checking balance returned to $90 and the queue cleared.
- Reconciled checking (12 rows, deposits $150, payouts $60, closing $90) and savings (10 rows, deposits $125, payouts $50, closing $75).
- During credit-card reconciliation, changed one $10 payment to $12 and added a missing $2 deposit. Checked 11 rows: deposits $127, payouts $52, closing $75. All three reconciliations appear in history.
- Reconciliation draft updates hit the Sheets read quota on v3.05. v3.06 added automatic 65-second quota backoff. After sign-in, the queue again reached **0 pending, 0 failed**.
- Direct Google Sheets read-back confirmed Format 3 metadata, 11 account tabs, all check numbers, the three reconciliation records, and an empty `reconcile_drafts` tab. There is no persisted journal tab.
- **Delete defect found and fixed:** `txn_UI Test Checking!A14:R14` initially retained only `deleted=FALSE`, `rowVersion=3`, and `lastOperationId`, losing the deleted transaction's details. The generic transaction sync path used an always-truthy empty object and wrote a blank row instead of a tombstone. v3.07 fixes that path and adds a regression test. The test Sheet's row was repaired from its worker audit entry; direct read-back confirms the original ID, date, check number, payee, description, $7 payment, `deleted=TRUE`, deletion timestamp, and operation ID. The first repair attempt was stopped by automatic approval review due to a usage limit; the retry after the stated time succeeded.
- The final recovery bundle audit (`MyAccountTracker-sync-recovery-2026-11-15T20-26-53-050Z.json` in Downloads) has **0 pending** and acknowledged entries for 11 account additions, one 110-row import, four individual transaction additions, two edits, one delete, and three completed reconciliations.

## v3.07 live tombstone retest

- Added a disposable $3 EFT payment in checking with description `v3.07 tombstone live test`; it synced before deletion.
- Deleted the row through the UI. The browser confirmation was completed by the user after computer control stopped. The app reported Saved.
- Direct read-back of `txn_UI Test Checking!A15:R15` confirmed the row retains its transaction ID, account ID, date, `EFT` check type, payee, description, $3 payment, category, deletion timestamp, deleting operation ID, and row version 2, with `deleted=TRUE`. This verifies the v3.07 tombstone fix against the live Google Sheet.

Record the app version, test file name, date, actual counts/balances, audit CSV name, and any failures in a copy of this plan for each future run. Do not mark an unexecuted step as passed.
