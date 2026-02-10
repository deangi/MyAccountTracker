import { useState, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Checkbox, TextField,
  MenuItem, useMediaQuery, useTheme, Card, CardContent, Chip, Stack,
} from '@mui/material';
import { Add, Edit, Delete, FileDownload, FileUpload } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import TransactionForm from './TransactionForm';
import CsvExport from './CsvExport';
import CsvImport from './CsvImport';

export default function TransactionTable({ accountId }) {
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [formOpen, setFormOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState(null);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterPayee, setFilterPayee] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const accountTransactions = useMemo(() => {
    let txns = state.transactions.filter((t) => t.accountId === accountId);

    if (filterPayee) txns = txns.filter((t) => t.payee === filterPayee);
    if (filterCategory) txns = txns.filter((t) => t.category === filterCategory);

    txns.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      if (sortField === 'payment' || sortField === 'deposit') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return txns;
  }, [state.transactions, accountId, sortField, sortDir, filterPayee, filterCategory]);

  // Running balance
  const withBalance = useMemo(() => {
    // Sort by date ascending for balance calculation
    const sorted = [...state.transactions.filter((t) => t.accountId === accountId)]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const balanceMap = {};
    let running = 0;
    sorted.forEach((t) => {
      running += (parseFloat(t.deposit) || 0) - (parseFloat(t.payment) || 0);
      balanceMap[t.id] = running;
    });

    return accountTransactions.map((t) => ({ ...t, balance: balanceMap[t.id] ?? 0 }));
  }, [accountTransactions, state.transactions, accountId]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleEdit = (txn) => {
    setEditTransaction(txn);
    setFormOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this transaction?')) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: id });
    }
  };

  const handleClearedToggle = (txn) => {
    dispatch({
      type: 'UPDATE_TRANSACTION',
      payload: { ...txn, cleared: txn.cleared === 'TRUE' ? 'FALSE' : 'TRUE' },
    });
  };

  const handleAdd = () => {
    setEditTransaction(null);
    setFormOpen(true);
  };

  const uniquePayees = [...new Set(accountTransactions.map((t) => t.payee).filter(Boolean))];
  const uniqueCategories = [...new Set(accountTransactions.map((t) => t.category).filter(Boolean))];

  // Mobile card view
  if (isMobile) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6">Transactions</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<FileUpload />} onClick={() => setImportOpen(true)}>Import</Button>
            <Button size="small" startIcon={<FileDownload />} onClick={() => setExportOpen(true)}>Export</Button>
            <Button variant="contained" size="small" startIcon={<Add />} onClick={handleAdd}>Add</Button>
          </Stack>
        </Box>

        {withBalance.map((txn) => (
          <Card key={txn.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">{txn.payee || '(no payee)'}</Typography>
                <Typography variant="subtitle2" color={txn.deposit ? 'success.main' : 'error.main'}>
                  {txn.deposit ? `+${formatCurrency(txn.deposit)}` : `-${formatCurrency(txn.payment)}`}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{formatDate(txn.date)}</Typography>
                <Typography variant="caption">Bal: {formatCurrency(txn.balance)}</Typography>
              </Box>
              {txn.category && <Chip label={txn.category} size="small" sx={{ mt: 0.5 }} />}
              <Box sx={{ mt: 0.5 }}>
                <IconButton size="small" onClick={() => handleEdit(txn)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => handleDelete(txn.id)}><Delete fontSize="small" /></IconButton>
                <Checkbox
                  size="small"
                  checked={txn.cleared === 'TRUE'}
                  onChange={() => handleClearedToggle(txn)}
                />
              </Box>
            </CardContent>
          </Card>
        ))}

        <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} transaction={editTransaction} accountId={accountId} />
        <CsvExport open={exportOpen} onClose={() => setExportOpen(false)} accountId={accountId} />
        <CsvImport open={importOpen} onClose={() => setImportOpen(false)} accountId={accountId} />
      </Box>
    );
  }

  // Desktop table view
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">Transactions</Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            select size="small" label="Filter Payee" value={filterPayee}
            onChange={(e) => setFilterPayee(e.target.value)} sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            {uniquePayees.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" label="Filter Category" value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)} sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            {uniqueCategories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <Button startIcon={<FileUpload />} onClick={() => setImportOpen(true)}>Import</Button>
          <Button startIcon={<FileDownload />} onClick={() => setExportOpen(true)}>Export</Button>
          <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>Add</Button>
        </Stack>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Clr</TableCell>
              <TableCell sx={{ cursor: 'pointer' }} onClick={() => handleSort('date')}>
                Date {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </TableCell>
              <TableCell sx={{ cursor: 'pointer' }} onClick={() => handleSort('payee')}>
                Payee {sortField === 'payee' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right" sx={{ cursor: 'pointer' }} onClick={() => handleSort('payment')}>
                Payment {sortField === 'payment' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </TableCell>
              <TableCell align="right" sx={{ cursor: 'pointer' }} onClick={() => handleSort('deposit')}>
                Deposit {sortField === 'deposit' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {withBalance.map((txn) => (
              <TableRow key={txn.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={txn.cleared === 'TRUE'}
                    onChange={() => handleClearedToggle(txn)}
                  />
                </TableCell>
                <TableCell>{formatDate(txn.date)}</TableCell>
                <TableCell>{txn.payee}</TableCell>
                <TableCell>{txn.description}</TableCell>
                <TableCell align="right" sx={{ color: 'error.main' }}>
                  {txn.payment ? formatCurrency(txn.payment) : ''}
                </TableCell>
                <TableCell align="right" sx={{ color: 'success.main' }}>
                  {txn.deposit ? formatCurrency(txn.deposit) : ''}
                </TableCell>
                <TableCell align="right">{formatCurrency(txn.balance)}</TableCell>
                <TableCell>{txn.category}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleEdit(txn)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(txn.id)}><Delete fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {withBalance.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No transactions yet</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} transaction={editTransaction} accountId={accountId} />
      <CsvExport open={exportOpen} onClose={() => setExportOpen(false)} accountId={accountId} />
      <CsvImport open={importOpen} onClose={() => setImportOpen(false)} accountId={accountId} />
    </Box>
  );
}
