import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Autocomplete, FormControlLabel, Checkbox,
} from '@mui/material';
import { useApp } from '../../store/AppContext';
import { toISODate } from '../../utils/formatters';

const moneyRegex = /^\d+(\.\d{1,2})?$/;

let lastUsedDate = null;

function validateMoney(value) {
  if (value === '') return '';
  if (!moneyRegex.test(value)) return 'Enter a valid dollar amount (e.g. 10.50)';
  return '';
}

function validateDate(value) {
  if (!value) return 'Date is required';
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Enter a valid date';
  return '';
}

export default function TransactionForm({ open, onClose, transaction, accountId }) {
  const { state, dispatch, generateUUID } = useApp();
  const isEdit = !!transaction;

  const [form, setForm] = useState({
    date: '', payee: '', description: '', payment: '', deposit: '', category: '', cleared: false,
  });
  const [errors, setErrors] = useState({ payment: '', deposit: '', date: '' });

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
        date: lastUsedDate || toISODate(new Date().toISOString()),
        payee: '', description: '', payment: '', deposit: '', category: '', cleared: false,
      });
    }
    setErrors({ payment: '', deposit: '', date: '' });
  }, [transaction, open]);

  const handleChange = (field) => (e) => {
    const value = field === 'cleared' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));

    if (field === 'payment' || field === 'deposit') {
      setErrors((prev) => ({ ...prev, [field]: validateMoney(value) }));
    }
    if (field === 'date') {
      setErrors((prev) => ({ ...prev, date: validateDate(value) }));
    }
  };

  const handleSubmit = () => {
    const paymentErr = validateMoney(form.payment);
    const depositErr = validateMoney(form.deposit);
    const dateErr = validateDate(form.date);

    if (paymentErr || depositErr || dateErr) {
      setErrors({ payment: paymentErr, deposit: depositErr, date: dateErr });
      return;
    }

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

      lastUsedDate = form.date;

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
          error={!!errors.date} helperText={errors.date}
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
          margin="dense" label="Payment (money out)" fullWidth
          value={form.payment} onChange={handleChange('payment')}
          error={!!errors.payment} helperText={errors.payment}
          slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
        />
        <TextField
          margin="dense" label="Deposit (money in)" fullWidth
          value={form.deposit} onChange={handleChange('deposit')}
          error={!!errors.deposit} helperText={errors.deposit}
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
