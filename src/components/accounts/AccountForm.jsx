import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem,
} from '@mui/material';
import { useApp } from '../../store/AppContext';

const ACCOUNT_TYPES = ['checking', 'savings'];

export default function AccountForm({ open, onClose, account }) {
  const { dispatch, generateUUID } = useApp();
  const isEdit = !!account;

  const [form, setForm] = useState({
    name: '', nickname: '', address: '', phone: '', webAddress: '', type: 'checking',
  });

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name || '',
        nickname: account.nickname || '',
        address: account.address || '',
        phone: account.phone || '',
        webAddress: account.webAddress || '',
        type: account.type || 'checking',
      });
    } else {
      setForm({ name: '', nickname: '', address: '', phone: '', webAddress: '', type: 'checking' });
    }
  }, [account, open]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;

    if (isEdit) {
      dispatch({
        type: 'UPDATE_ACCOUNT',
        payload: { ...account, ...form },
      });
    } else {
      dispatch({
        type: 'ADD_ACCOUNT',
        payload: {
          id: generateUUID(),
          ...form,
          createdAt: new Date().toISOString(),
        },
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Account' : 'Add Account'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus margin="dense" label="Account Name" fullWidth required
          value={form.name} onChange={handleChange('name')}
        />
        <TextField
          margin="dense" label="Nickname" fullWidth
          value={form.nickname} onChange={handleChange('nickname')}
        />
        <TextField
          margin="dense" label="Type" fullWidth select
          value={form.type} onChange={handleChange('type')}
        >
          {ACCOUNT_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>
          ))}
        </TextField>
        <TextField
          margin="dense" label="Bank Address" fullWidth multiline rows={2}
          value={form.address} onChange={handleChange('address')}
        />
        <TextField
          margin="dense" label="Phone" fullWidth
          value={form.phone} onChange={handleChange('phone')}
        />
        <TextField
          margin="dense" label="Website" fullWidth
          value={form.webAddress} onChange={handleChange('webAddress')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">{isEdit ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
}
