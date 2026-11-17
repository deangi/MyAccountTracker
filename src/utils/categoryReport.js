export function selectCategoryTransactions(transactions, category, fromDate, toDate) {
  if (!category) throw new Error('Select a category for the Category Report.');
  if (!fromDate || !toDate || toDate < fromDate) {
    throw new Error('Enter a valid Category Report start and end date, with the end date on or after the start date.');
  }
  return transactions
    .filter((transaction) => transaction.category === category
      && transaction.date >= fromDate && transaction.date <= toDate)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}
