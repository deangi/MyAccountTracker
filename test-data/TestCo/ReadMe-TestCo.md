# TestCo Inc import test data

## Purpose

This data set provides a repeatable import test for MyAccountTracker. It creates the five currently supported account types and exactly 1,000 unreconciled transactions. The transactions cover **1/1/2025 through 10/1/2026**. Checking and credit-card activity make up 800 of the 1,000 transactions.

## Files

- `TestCo-Inc-Accounts.tsv` — import this first from **Accounts > Import Accounts**.
- `TestCo-Inc-Transactions.tsv` — import this second from a register’s **Import Transactions** command. It contains an `Account` column, so each row is directed to its named account.

Create or open a fresh V2 MyAccountTracker company file named **TestCo Inc** before importing. The import is intended for an empty company so the expected balances below remain directly comparable.

## Expected results after import

MyAccountTracker register balance convention is **deposits minus payments**. Credit-card and loan registers therefore show negative balances when money owed exceeds payments entered. All 1,000 imported rows have `Cleared = false`.

| Account | Type | Transactions | Total payments | Total deposits | Expected balance |
| --- | --- | ---: | ---: | ---: | ---: |
| TestCo Inc Operating Checking | checking | 450 | $87,424.75 | $260,227.00 | **$172,802.25** |
| TestCo Inc Reserve Savings | savings | 100 | $5,750.00 | $39,862.00 | **$34,112.00** |
| TestCo Inc Corporate Credit Card | credit card | 350 | $113,101.00 | $68,200.00 | **-$44,901.00** |
| TestCo Inc Equipment Loan | loan | 60 | $75,000.00 | $65,000.00 | **-$10,000.00** |
| TestCo Inc Owner Equity | equity | 40 | $6,850.00 | $125,500.00 | **$118,650.00** |
| **All accounts** |  | **1000** | **$288,125.75** | **$558,789.00** | **$270,663.25** |

## Test data characteristics

- **Operating Checking**: 450 rows. Opening cash, customer receipts, bank interest, and operating expenses.
- **Reserve Savings**: 100 rows. Opening reserve, periodic reserve funding, interest, and withdrawals.
- **Corporate Credit Card**: 350 rows. Purchases and periodic payments.
- **Equipment Loan**: 60 rows. Loan proceeds and scheduled or extra principal payments.
- **Owner Equity**: 40 rows. Capital contributions and owner draws.
- Check-number values use only `DEP` or `EFT`, which satisfy the transaction validation rules.
- All imported transactions are intentionally unreconciled.

## Verification procedure

1. Import the account list. Confirm that five accounts appear, one each of checking, savings, credit card, loan, and equity.
2. Import the transaction list. Confirm that the importer maps the `Account` field.
3. Confirm that it reports 1,000 imported transactions.
4. Open each register and compare its transaction count and balance with the table above.
5. Run **Validate**. A clean import should require no ledger corrections.

Generated deterministically for TestCo Inc. Amounts are USD.
