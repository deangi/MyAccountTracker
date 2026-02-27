import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  FormControlLabel, Switch, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { generateTsv, downloadFile } from '../../utils/csv';

export default function CsvExport({ open, onClose, accountId }) {
  const { state } = useApp();
  const [allAccounts, setAllAccounts] = useState(false);

  const handleExport = () => {
    const transactions = allAccounts
      ? state.transactions
      : state.transactions.filter((t) => t.accountId === accountId);

    // Calculate date range from the transactions being exported
    const dates = transactions.map((t) => t.date).filter(Boolean).sort();
    const startDate = dates[0] || '';
    const endDate = dates[dates.length - 1] || '';
    const dateRange = startDate && endDate ? `${startDate} through ${endDate}` : '';

    const account = state.accounts.find((a) => a.id === accountId);
    const title = allAccounts
      ? 'MyAccountTracker - All Accounts'
      : `MyAccountTracker - ${account?.name || ''}`;

    const rows = transactions.map((t) => {
      const acct = state.accounts.find((a) => a.id === t.accountId);
      return {
        Date: t.date || '',
        Account: acct?.name || '',
        CheckNum: t.checkNum || '',
        Payee: t.payee || '',
        Description: t.description || '',
        Payment: t.payment || '',
        Deposit: t.deposit || '',
        Category: t.category || '',
        Cleared: t.cleared || '',
      };
    });

    const tsv = generateTsv(rows, { title, dateRange });
    const filename = allAccounts
      ? 'all-transactions.txt'
      : `${account?.name || 'transactions'}.txt`;
    downloadFile(tsv, filename);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Transactions</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Exports a tab-separated file (.txt) with a header and totals footer.
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
