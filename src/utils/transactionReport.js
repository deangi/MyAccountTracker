export function selectReportTransactions(transactions, { fromDate, toDate, payees = [], categories = [], amount = '', direction = 'either' }) {
  if (!fromDate || !toDate || toDate < fromDate) {
    throw new Error('Enter valid start and end dates, with the end date on or after the start date.');
  }
  if (amount !== '' && (!/^\d+(?:\.\d{1,2})?$/.test(String(amount)) || Number(amount) <= 0)) {
    throw new Error('Enter a positive amount with no more than two decimal places.');
  }
  if (!['either', 'payment', 'deposit'].includes(direction)) throw new Error('Select a valid amount direction.');

  const cents = amount === '' ? null : Math.round(Number(amount) * 100);
  const matchesAmount = (transaction) => {
    if (cents === null) return true;
    const payment = Math.round(Number(transaction.payment || 0) * 100);
    const deposit = Math.round(Number(transaction.deposit || 0) * 100);
    return (direction !== 'deposit' && payment === cents) || (direction !== 'payment' && deposit === cents);
  };
  return transactions
    .filter((transaction) => transaction.date >= fromDate && transaction.date <= toDate)
    .filter((transaction) => !payees.length || payees.includes(transaction.payee))
    .filter((transaction) => !categories.length || categories.includes(transaction.category))
    .filter(matchesAmount)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId) || a.id.localeCompare(b.id));
}
