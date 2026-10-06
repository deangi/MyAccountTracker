import { useState } from 'react';
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { useApp } from '../../store/AppContext';

const moneyRegex = /^\d+(\.\d{1,2})?$/;

export default function TransferForm({ open, onClose, transaction, accountId, initialDate = '' }) {
  const { state, dispatch, generateUUID } = useApp();
  const [form, setForm] = useState({
    date: transaction?.date || initialDate,
    otherAccountId: transaction?.transferAccountId || '',
    amount: transaction?.payment || transaction?.deposit || '',
    checkNum: transaction?.checkNum || 'TXFR',
    description: transaction?.description || '',
    cleared: transaction?.cleared === 'TRUE',
  });
  const [error, setError] = useState('');
  const isEdit = Boolean(transaction);

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: field === 'cleared' ? event.target.checked : event.target.value }));
  const accountFor = (id) => state.accounts.find((account) => account.id === id);

  const handleSubmit = () => {
    if (!moneyRegex.test(form.amount) || Number(form.amount) <= 0) {
      setError('Enter a valid transfer amount.');
      return;
    }
    if (!form.otherAccountId) {
      setError('Choose the other account.');
      return;
    }
    const currentId = transaction?.accountId || accountId;
    if (currentId === form.otherAccountId) {
      setError('Choose a different account.');
      return;
    }
    const current = accountFor(currentId);
    const other = accountFor(form.otherAccountId);
    const common = { date: form.date, checkNum: form.checkNum || 'TXFR', description: form.description, category: '' };

    if (!isEdit) {
      const transferId = generateUUID();
      dispatch({
        type: 'ADD_TRANSFER',
        payload: {
          source: { ...common, id: generateUUID(), accountId: currentId, payee: `Transfer to ${other?.nickname || other?.name || 'account'}`, payment: form.amount, deposit: '', cleared: 'FALSE', reconciliationId: '', transferId, transferAccountId: form.otherAccountId },
          destination: { ...common, id: generateUUID(), accountId: form.otherAccountId, payee: `Transfer from ${current?.nickname || current?.name || 'account'}`, payment: '', deposit: form.amount, cleared: 'FALSE', reconciliationId: '', transferId, transferAccountId: currentId },
        },
      });
    } else {
      const linked = state.transactions.find((item) => item.transferId === transaction.transferId && item.id !== transaction.id);
      if (!linked) {
        setError('The matching side of this transfer is missing.');
        return;
      }
      const editedIsSource = Number(transaction.payment) > 0;
      const sourceId = editedIsSource ? currentId : form.otherAccountId;
      const destinationId = editedIsSource ? form.otherAccountId : currentId;
      const sourceAccount = accountFor(sourceId);
      const destinationAccount = accountFor(destinationId);
      const originalSource = editedIsSource ? transaction : linked;
      const originalDestination = editedIsSource ? linked : transaction;
      const source = { ...originalSource, ...common, accountId: sourceId, payee: `Transfer to ${destinationAccount?.nickname || destinationAccount?.name || 'account'}`, payment: form.amount, deposit: '', cleared: originalSource.cleared, transferAccountId: destinationId };
      const destination = { ...originalDestination, ...common, accountId: destinationId, payee: `Transfer from ${sourceAccount?.nickname || sourceAccount?.name || 'account'}`, payment: '', deposit: form.amount, cleared: originalDestination.cleared, transferAccountId: sourceId };
      dispatch({ type: 'UPDATE_TRANSFER', payload: { transferId: transaction.transferId, source, destination } });
    }
    onClose();
  };

  const selectable = state.accounts.filter((account) => account.id !== (transaction?.accountId || accountId));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Transfer' : 'Transfer Between Accounts'}</DialogTitle>
      <DialogContent>
        <TextField margin="dense" label="Date" type="date" fullWidth required value={form.date} onChange={change('date')} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select margin="dense" label="Other Account" fullWidth value={form.otherAccountId} onChange={change('otherAccountId')}>
          {selectable.map((account) => <MenuItem key={account.id} value={account.id}>{account.nickname || account.name}</MenuItem>)}
        </TextField>
        <TextField margin="dense" label="Transfer Amount" fullWidth value={form.amount} onChange={change('amount')} slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }} />
        <TextField margin="dense" label="Check # / Type" fullWidth value={form.checkNum} onChange={change('checkNum')} />
        <TextField margin="dense" label="Memo" fullWidth multiline rows={2} value={form.description} onChange={change('description')} />
        {isEdit && <FormControlLabel control={<Checkbox checked={form.cleared} disabled />} label="Reconciliation status (managed by Reconcile)" sx={{ mt: 1 }} />}
        {error && <p style={{ color: '#c62828' }}>{error}</p>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} variant="contained">{isEdit ? 'Save' : 'Create Transfer'}</Button></DialogActions>
    </Dialog>
  );
}
