# MyAccountTracker task list

- [ ] Add comma-delimited CSV transaction import alongside the existing TSV import. Accept `.csv` files, preserve quoted commas and embedded line breaks, provide column mapping and a preview, and handle currency symbols and debit/credit direction explicitly. Add regression tests that verify populated transaction fields, exact payment/deposit amounts, and totals after import into application state; row counts alone are insufficient. Keep Citi's tab-padding handling specific to its recognized format.

US Bank checking CSV sample reviewed: `Date, Transaction, Name, Memo, Amount` (five columns; eight sample records). Map Name to Payee and Memo to Description; CREDIT is positive and DEBIT is negative. Confirm Date parsing and sign/type consistency; preserve quoted commas in Name and Memo. Test exact populated fields and amount totals with synthetic fixtures before enabling this format. Keep the supplied customer sample out of Git.
