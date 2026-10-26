# MyAccountTracker task list

- [ ] Add comma-delimited CSV transaction import alongside the existing TSV import. Accept `.csv` files, preserve quoted commas and embedded line breaks, provide column mapping and a preview, and handle currency symbols and debit/credit direction explicitly. Add regression tests that verify populated transaction fields, exact payment/deposit amounts, and totals after import into application state; row counts alone are insufficient. Keep Citi's tab-padding handling specific to its recognized format.
