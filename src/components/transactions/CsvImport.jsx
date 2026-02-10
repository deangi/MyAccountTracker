import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, TextField, Box, Alert,
} from '@mui/material';
import { useApp } from '../../store/AppContext';
import { parseCsv } from '../../utils/csv';

const FIELD_OPTIONS = [
  { value: '', label: '(skip)' },
  { value: 'date', label: 'Date' },
  { value: 'payee', label: 'Payee' },
  { value: 'description', label: 'Description' },
  { value: 'payment', label: 'Payment' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'category', label: 'Category' },
  { value: 'cleared', label: 'Cleared' },
];

export default function CsvImport({ open, onClose, accountId }) {
  const { dispatch, generateUUID } = useApp();
  const [csvData, setCsvData] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [error, setError] = useState('');

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseCsv(file);
      setCsvData(result);
      setError('');

      // Auto-map columns by name
      const autoMap = {};
      result.meta.fields?.forEach((field) => {
        const lower = field.toLowerCase();
        const match = FIELD_OPTIONS.find((o) => o.value && lower.includes(o.value));
        if (match) autoMap[field] = match.value;
      });
      setColumnMap(autoMap);
    } catch (err) {
      setError('Failed to parse CSV file');
    }
  };

  const handleMapChange = (csvCol, value) => {
    setColumnMap((prev) => ({ ...prev, [csvCol]: value }));
  };

  const handleImport = () => {
    if (!csvData) return;

    const transactions = csvData.data.map((row) => {
      const txn = {
        id: generateUUID(),
        accountId,
        date: '',
        payee: '',
        description: '',
        payment: '',
        deposit: '',
        category: '',
        cleared: 'FALSE',
        reconciliationId: '',
      };

      Object.entries(columnMap).forEach(([csvCol, field]) => {
        if (field && row[csvCol] != null) {
          txn[field] = String(row[csvCol]).trim();
        }
      });

      return txn;
    });

    dispatch({ type: 'IMPORT_TRANSACTIONS', payload: transactions });
    handleClose();
  };

  const handleClose = () => {
    setCsvData(null);
    setColumnMap({});
    setError('');
    onClose();
  };

  const previewRows = csvData?.data?.slice(0, 5) || [];
  const columns = csvData?.meta?.fields || [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Import Transactions from CSV</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Button variant="outlined" component="label" sx={{ mb: 2 }}>
          Select CSV File
          <input type="file" accept=".csv" hidden onChange={handleFileSelect} />
        </Button>

        {csvData && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Column Mapping ({csvData.data.length} rows found)
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {columns.map((col) => (
                <TextField
                  key={col}
                  select
                  size="small"
                  label={col}
                  value={columnMap[col] || ''}
                  onChange={(e) => handleMapChange(col, e.target.value)}
                  sx={{ minWidth: 130 }}
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </TextField>
              ))}
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview (first 5 rows)</Typography>
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell key={col}>{col}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => (
                        <TableCell key={col}>{row[col]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleImport} variant="contained" disabled={!csvData}>
          Import {csvData?.data?.length || 0} Transactions
        </Button>
      </DialogActions>
    </Dialog>
  );
}
