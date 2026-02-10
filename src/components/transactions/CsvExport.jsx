import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  FormControlLabel, Switch, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { generateCsv, downloadCsv } from '../../utils/csv';

export default function CsvExport({ open, onClose, accountId }) {
  const { state } = useApp();
  const [allAccounts, setAllAccounts] = useState(false);

  const handleExport = () => {
    const transactions = allAccounts
      ? state.transactions
      : state.transactions.filter((t) => t.accountId === accountId);

    const data = transactions.map((t) => {
      const account = state.accounts.find((a) => a.id === t.accountId);
      return {
        Date: t.date,
        Account: account?.name || '',
        Payee: t.payee,
        Description: t.description,
        Payment: t.payment,
        Deposit: t.deposit,
        Category: t.category,
        Cleared: t.cleared,
      };
    });

    const csv = generateCsv(data);
    const account = state.accounts.find((a) => a.id === accountId);
    const filename = allAccounts ? 'all-transactions.csv' : `${account?.name || 'transactions'}.csv`;
    downloadCsv(csv, filename);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Transactions</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Export transactions to a CSV file.
        </Typography>
        <FormControlLabel
          control={<Switch checked={allAccounts} onChange={(e) => setAllAccounts(e.target.checked)} />}
          label="Export all accounts"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleExport} variant="contained">Export</Button>
      </DialogActions>
    </Dialog>
  );
}
