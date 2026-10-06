import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, TextField, Box, Alert,
  Dialog as HelpDialog, DialogTitle as HelpDialogTitle, DialogContent as HelpDialogContent, DialogActions as HelpDialogActions,
} from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { parseTsv } from '../../utils/csv';

const FIELD_OPTIONS = [
  { value: '', label: '(skip)' },
  { value: 'date', label: 'Date' },
  { value: 'account', label: 'Account' },
  { value: 'checkNum', label: 'Check #' },
  { value: 'payee', label: 'Payee' },
  { value: 'description', label: 'Description' },
  { value: 'payment', label: 'Payment (out)' },
  { value: 'deposit', label: 'Deposit (in)' },
  { value: 'amount', label: 'Amount (signed +/-)' },
  { value: 'category', label: 'Category' },
  { value: 'cleared', label: 'Cleared' },
];

// Maps incoming column names (lowercased) to our internal field names.
// Covers both our own export format and Quicken register export columns.
const COLUMN_AUTO_MAP = {
  date: 'date',
  account: 'account',
  num: 'checkNum',
  checknum: 'checkNum',
  'check #': 'checkNum',
  payee: 'payee',
  description: 'payee',   // Quicken: Description = payee name
  memo: 'description',    // Quicken: Memo = our description/notes
  payment: 'payment',
  'payment (money out)': 'payment',
  deposit: 'deposit',
  'deposit (money in)': 'deposit',
  amount: 'amount',
  category: 'category',
  clr: 'cleared',
  cleared: 'cleared',
};

// Convert M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD; pass through YYYY-MM-DD unchanged.
function convertDate(str) {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return str;
}

export default function CsvImport({ open, onClose, accountId }) {
  const { state, dispatch, generateUUID } = useApp();
  const [tsvData, setTsvData] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseTsv(file);
      setTsvData(result);
      setError('');

      // Auto-map columns by name
      const autoMap = {};
      result.meta.fields?.forEach((field) => {
        const lower = field.toLowerCase().trim();
        if (COLUMN_AUTO_MAP[lower]) {
          autoMap[field] = COLUMN_AUTO_MAP[lower];
        }
      });
      setColumnMap(autoMap);
    } catch {
      setError('Failed to parse file');
    }
  };

  const handleMapChange = (col, value) => {
    setColumnMap((prev) => ({ ...prev, [col]: value }));
  };

  const handleImport = () => {
    if (!tsvData) return;

    // Check whether the Account column is mapped
    const accountColMapped = Object.values(columnMap).includes('account');

    // First pass: validate all account names before importing anything
    if (accountColMapped) {
      const unknownNames = new Set();
      tsvData.data.forEach((row) => {
        const [csvCol] = Object.entries(columnMap).find(([, f]) => f === 'account') || [];
        if (!csvCol) return;
        const name = String(row[csvCol] || '').trim();
        if (name && !state.accounts.find((a) => a.name === name)) {
          unknownNames.add(name);
        }
      });
      if (unknownNames.size > 0) {
        setError(
          `Import aborted — the following account names were not found in this file:\n${[...unknownNames].join(', ')}\n\nCreate those accounts first, or set the Account column to (skip).`
        );
        return;
      }
    }

    // Second pass: build transactions
    const transactions = tsvData.data.map((row) => {
      const txn = {
        id: generateUUID(),
        accountId,
        date: '',
        checkNum: '',
        payee: '',
        description: '',
        payment: '',
        deposit: '',
        category: '',
        cleared: 'FALSE',
        reconciliationId: '',
      };

      Object.entries(columnMap).forEach(([csvCol, field]) => {
        if (!field || row[csvCol] == null) return;
        const raw = String(row[csvCol]).trim();

        if (field === 'account') {
          // Look up account by name and assign its id
          const match = state.accounts.find((a) => a.name === raw);
          if (match) txn.accountId = match.id;
        } else if (field === 'amount') {
          // Signed amount: positive → deposit, negative → payment
          const val = parseFloat(raw.replace(/,/g, ''));
          if (!isNaN(val)) {
            if (val >= 0) txn.deposit = val.toFixed(2);
            else txn.payment = Math.abs(val).toFixed(2);
          }
        } else if (field === 'cleared') {
          // Quicken uses 'R' (reconciled) or '*' (cleared); we also accept 'TRUE'
          txn.cleared =
            raw === 'R' || raw === '*' || raw.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
        } else if (field === 'date') {
          txn.date = convertDate(raw);
        } else if (field === 'payment' || field === 'deposit') {
          const val = parseFloat(raw.replace(/,/g, ''));
          txn[field] = isNaN(val) ? '' : Math.abs(val).toFixed(2);
        } else {
          txn[field] = raw;
        }
      });

      return txn;
    });

    dispatch({ type: 'IMPORT_TRANSACTIONS', payload: transactions });
    handleClose();
  };

  const handleClose = () => {
    setTsvData(null);
    setColumnMap({});
    setError('');
    onClose();
  };

  const previewRows = tsvData?.data?.slice(0, 5) || [];
  const columns = tsvData?.meta?.fields || [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Import Transactions</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Accepts tab-separated files (.txt, .tsv) including Quicken register exports.
          Header and footer lines are detected and skipped automatically.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" component="label">
            Select File
            <input type="file" accept=".txt,.tsv" hidden onChange={handleFileSelect} />
          </Button>
          <Button variant="text" startIcon={<HelpOutline />} onClick={() => setHelpOpen(true)}>Import Help</Button>
        </Box>

        {tsvData && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Column Mapping ({tsvData.data.length} rows found)
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
                  sx={{ minWidth: 150 }}
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
        <Button onClick={handleImport} variant="contained" disabled={!tsvData}>
          Import {tsvData?.data?.length || 0} Transactions
        </Button>
      </DialogActions>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
        <HelpDialogTitle>Transaction Import Help</HelpDialogTitle>
        <HelpDialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Import currently accepts tab-separated `.txt` or `.tsv` files. The first row should contain column headings. Map the headings after selecting the file.</Typography>
          <Typography variant="subtitle2">Example: payment and deposit columns</Typography>
          <Box component="pre" sx={{ p: 1.5, bgcolor: 'grey.100', overflow: 'auto', fontSize: '0.8rem' }}>{`Date\tCheck #\tPayee\tMemo\tPayment\tDeposit\tCategory
10/06/2026\tEFT\tElectric Company\tOctober bill\t125.40\t\tUtilities
10/06/2026\tDEP\tEmployer\tPayroll\t\t2500.00\tIncome`}</Box>
          <Typography variant="subtitle2">Example: signed amount column</Typography>
          <Box component="pre" sx={{ p: 1.5, bgcolor: 'grey.100', overflow: 'auto', fontSize: '0.8rem' }}>{`Date\tNum\tDescription\tMemo\tAmount\tCategory
10/06/2026\t1025\tOffice Store\tPrinter paper\t-42.18\tOffice Supplies
10/06/2026\tDEP\tEmployer\tPayroll\t2500.00\tIncome`}</Box>
          <Typography variant="body2">Check # / Type values should be `DEP`, `EFT`, `TXFR`, or a numeric check number. CSV import support is planned for a future release.</Typography>
        </HelpDialogContent>
        <HelpDialogActions><Button onClick={() => setHelpOpen(false)} variant="contained">Close</Button></HelpDialogActions>
      </HelpDialog>
    </Dialog>
  );
}
