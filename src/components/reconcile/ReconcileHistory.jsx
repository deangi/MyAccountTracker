import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, TextField,
} from '@mui/material';
import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ReconcileHistory() {
  const { state } = useApp();
  const [filterAccountId, setFilterAccountId] = useState('');

  const reconciliations = filterAccountId
    ? state.reconciliations.filter((r) => r.accountId === filterAccountId)
    : state.reconciliations;

  const sorted = [...reconciliations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Reconciliation History</Typography>
        <TextField
          select size="small" label="Account" value={filterAccountId}
          onChange={(e) => setFilterAccountId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Accounts</MenuItem>
          {state.accounts.map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.nickname || a.name}</MenuItem>
          ))}
        </TextField>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Account</TableCell>
              <TableCell align="right">Opening Balance</TableCell>
              <TableCell align="right">Closing Balance</TableCell>
              <TableCell align="center">Transactions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((rec) => {
              const account = state.accounts.find((a) => a.id === rec.accountId);
              const txnCount = rec.transactionIds ? rec.transactionIds.split(',').length : 0;
              return (
                <TableRow key={rec.id}>
                  <TableCell>{formatDate(rec.date)}</TableCell>
                  <TableCell>{account?.name || 'Unknown'}</TableCell>
                  <TableCell align="right">{formatCurrency(rec.statementOpeningBalance)}</TableCell>
                  <TableCell align="right">{formatCurrency(rec.statementClosingBalance)}</TableCell>
                  <TableCell align="center">{txnCount}</TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No reconciliations yet</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
