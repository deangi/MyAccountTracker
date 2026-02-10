import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Autocomplete, FormControlLabel, Checkbox,
} from '@mui/material';
import { useApp } from '../../store/AppContext';
import { toISODate } from '../../utils/formatters';

export default function TransactionForm({ open, onClose, transaction, accountId }) {
  const { state, dispatch, generateUUID } = useApp();
  const isEdit = !!transaction;

  const [form, setForm] = useState({
    date: '', payee: '', description: '', payment: '', deposit: '', category: '', cleared: false,
  });

  useEffect(() => {
    if (transaction) {
      setForm({
        date: transaction.date || '',
        payee: transaction.payee || '',
        description: transaction.description || '',
        payment: transaction.payment || '',
        deposit: transaction.deposit || '',
        category: transaction.category || '',
        cleared: transaction.cleared === 'TRUE' || transaction.cleared === true,
      });
    } else {
      setForm({
        date: toISODate(new Date().toISOString()),
        payee: '', description: '', payment: '', deposit: '', category: '', cleared: false,
      });
    }
  }, [transaction, open]);

  const handleChange = (field) => (e) => {
    const value = field === 'cleared' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.date) return;

    const data = {
      ...form,
      cleared: form.cleared ? 'TRUE' : 'FALSE',
      payment: form.payment || '',
      deposit: form.deposit || '',
    };

    if (isEdit) {
      dispatch({
        type: 'UPDATE_TRANSACTION',
        payload: { ...transaction, ...data },
      });
    } else {
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: generateUUID(),
          accountId,
          ...data,
          reconciliationId: '',
        },
      });

      // Auto-add payee if new
      if (form.payee && !state.payees.find((p) => p.name === form.payee)) {
        dispatch({ type: 'ADD_PAYEE', payload: { id: generateUUID(), name: form.payee } });
      }
      // Auto-add category if new
      if (form.category && !state.categories.find((c) => c.name === form.category)) {
        dispatch({ type: 'ADD_CATEGORY', payload: { id: generateUUID(), name: form.category } });
      }
    }
    onClose();
  };

  const payeeNames = state.payees.map((p) => p.name);
  const categoryNames = state.categories.map((c) => c.name);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
      <DialogContent>
        <TextField
          margin="dense" label="Date" type="date" fullWidth required
          value={form.date} onChange={handleChange('date')}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Autocomplete
          freeSolo
          options={payeeNames}
          value={form.payee}
          onInputChange={(_, value) => setForm((prev) => ({ ...prev, payee: value }))}
          renderInput={(params) => (
            <TextField {...params} margin="dense" label="Payee" fullWidth />
          )}
        />
        <TextField
          margin="dense" label="Description" fullWidth multiline rows={2}
          value={form.description} onChange={handleChange('description')}
        />
        <TextField
          margin="dense" label="Payment (money out)" type="number" fullWidth
          value={form.payment} onChange={handleChange('payment')}
          slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
        />
        <TextField
          margin="dense" label="Deposit (money in)" type="number" fullWidth
          value={form.deposit} onChange={handleChange('deposit')}
          slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
        />
        <Autocomplete
          freeSolo
          options={categoryNames}
          value={form.category}
          onInputChange={(_, value) => setForm((prev) => ({ ...prev, category: value }))}
          renderInput={(params) => (
            <TextField {...params} margin="dense" label="Category" fullWidth />
          )}
        />
        <FormControlLabel
          control={<Checkbox checked={form.cleared} onChange={handleChange('cleared')} />}
          label="Cleared"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">{isEdit ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
}
