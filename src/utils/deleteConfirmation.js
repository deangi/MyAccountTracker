function isCleared(transaction) {
  return transaction.cleared === 'TRUE' || transaction.cleared === true || Boolean(transaction.reconciliationId);
}

export function deleteTransactionConfirmation(transaction, transactions) {
  const isTransfer = Boolean(transaction.transferId);
  const affected = isTransfer
    ? transactions.filter((item) => item.transferId === transaction.transferId)
    : [transaction];
  if (!affected.some(isCleared)) {
    return isTransfer ? 'Delete both sides of this transfer?' : 'Delete this transaction?';
  }
  const subject = isTransfer ? 'This transfer includes a cleared transaction.' : 'This transaction is cleared.';
  const action = isTransfer ? 'Delete both sides of the transfer anyway?' : 'Delete this transaction anyway?';
  return `${subject}\n\nDeleting a reconciled transaction is not advised. It can make past reconciliation records incorrect. Better to enter a new transaction that reverses it.\n\n${action}`;
}
