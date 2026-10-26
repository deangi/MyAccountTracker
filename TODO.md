# MyAccountTracker task list

- [x] Add comma-delimited CSV transaction import alongside the existing TSV import. Accept `.csv` files, preserve quoted commas and embedded line breaks, provide column mapping and a preview, and handle currency symbols and debit/credit direction explicitly. Add regression tests that verify populated transaction fields, exact payment/deposit amounts, and totals after import into application state; row counts alone are insufficient. Keep Citi's tab-padding handling specific to its recognized format.

US Bank checking CSV sample reviewed: `Date, Transaction, Name, Memo, Amount` (five columns; eight sample records). Name maps to Payee and Memo to Description; CREDIT is positive and DEBIT is negative. Date parsing and sign/type consistency, quoted commas and line breaks, populated fields, and exact amount totals are covered by synthetic fixtures. All eight supplied sample rows were verified locally. The supplied customer sample is not in Git.
