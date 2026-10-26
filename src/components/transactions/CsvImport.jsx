import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, TextField, Box, Alert,
  Dialog as HelpDialog, DialogTitle as HelpDialogTitle, DialogContent as HelpDialogContent, DialogActions as HelpDialogActions,
} from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { parseCsv, parseTsv } from '../../utils/csv';
import { buildImportedTransactions, autoMapTransactionColumns } from '../../utils/transactionImport';

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
  { value: 'cardAmount', label: 'Credit card amount (+ charge / − credit)' },
  { value: 'bankType', label: 'Bank Transaction type (DEBIT/CREDIT)' },
  { value: 'category', label: 'Category' },
  { value: 'cleared', label: 'Cleared' },
];

export default function CsvImport({ open, onClose, accountId }) {
  const { state, dispatch, generateUUID } = useApp();
  const [importData, setImportData] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportData(null);
      setColumnMap({});
      const result = await (file.name.toLowerCase().endsWith('.csv') ? parseCsv(file) : parseTsv(file));
      setImportData(result);
      setError('');

      setColumnMap(autoMapTransactionColumns(result.meta));
    } catch (err) {
      setError(err.message || 'Failed to parse file');
    } finally {
      e.target.value = '';
    }
  };

  const handleMapChange = (col, value) => {
    setColumnMap((prev) => ({ ...prev, [col]: value }));
  };

  const handleImport = () => {
    if (!importData) return;

    let transactions;
    try {
      transactions = buildImportedTransactions({ rows: importData.data, columnMap, accounts: state.accounts, accountId, generateUUID });
    } catch (err) {
      setError(err.message);
      return;
    }

    // Keep the master lists in step with imported register data.  The reports
    // use these lists, and matching is case-insensitive to prevent duplicates
    // such as "Utilities" and "utilities".
    const addMissingListItems = (field, existingItems, actionType) => {
      const known = new Set(existingItems.map((item) => item.name.trim().toLocaleLowerCase()));
      const additions = [];
      for (const transaction of transactions) {
        const name = transaction[field].trim();
        const key = name.toLocaleLowerCase();
        if (name && !known.has(key)) {
          known.add(key);
          additions.push({ id: generateUUID(), name });
        }
      }
      if (additions.length) dispatch({ type: actionType, payload: additions });
    };

    addMissingListItems('payee', state.payees, 'IMPORT_PAYEES');
    addMissingListItems('category', state.categories, 'IMPORT_CATEGORIES');
    dispatch({ type: 'IMPORT_TRANSACTIONS', payload: transactions });
    handleClose(transactions.length);
  };

  const handleClose = (importedCount = 0) => {
    setImportData(null);
    setColumnMap({});
    setError('');
    onClose(typeof importedCount === 'number' ? importedCount : 0);
  };

  const previewRows = importData?.data?.slice(0, 5) || [];
  const columns = importData?.meta?.fields || [];

  return (
    <Dialog open={open} onClose={() => handleClose()} maxWidth="lg" fullWidth>
      <DialogTitle>Import Transactions</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Accepts CSV (.csv) and tab-separated (.txt, .tsv) transaction files. Review the column mapping and preview before importing.
          Citi credit card exports with padded tabs are detected automatically. For other tab-separated files, each tab separates a column.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" component="label">
            Select File
            <input type="file" accept=".csv,.txt,.tsv" hidden onChange={handleFileSelect} />
          </Button>
          <Button variant="text" startIcon={<HelpOutline />} onClick={() => setHelpOpen(true)}>Import Help</Button>
        </Box>

        {importData?.meta?.format === 'citi-credit-card' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Citi credit card export detected. Tab padding has been removed. Positive amounts become
            payments (charges); negative amounts become deposits (credits). Description maps to Payee.
            Status and Member Name are skipped unless you map them. Bank status does not reconcile transactions.
          </Alert>
        )}
        {importData?.meta?.format === 'us-bank-checking' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            US Bank checking export detected. Name maps to Payee and Memo to Description.
            DEBIT becomes an EFT payment; CREDIT becomes a DEP deposit. The amount sign must agree with the bank type.
          </Alert>
        )}
        {importData && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Column Mapping ({importData.data.length} rows found)
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
        <Button onClick={() => handleClose()}>Cancel</Button>
        <Button onClick={handleImport} variant="contained" disabled={!importData?.data?.length}>
          Import {importData?.data?.length || 0} Transactions
        </Button>
      </DialogActions>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
        <HelpDialogTitle>Transaction Import Help</HelpDialogTitle>
        <HelpDialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Import accepts comma-separated `.csv` and tab-separated `.txt` or `.tsv` files. The first CSV row should contain column headings. CSV values containing commas or line breaks must be quoted. Map the headings after selecting the file and review the preview. Every data row must have the same number of columns as the headings.</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>For tab-separated files, use one tab between fields. Consecutive tabs represent an intentionally empty field; do not add tabs just to align columns visually.</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>Citi files with Status, Date, Description, Amount, and Member Name headings are recognized automatically, including variable tab padding. Positive Citi amounts are charges (payments); negative Citi amounts are credits (deposits). Review the mapping and preview before importing.</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>US Bank checking CSV columns Date, Transaction, Name, Memo, and Amount are recognized automatically. DEBIT amounts must be negative and become EFT payments; CREDIT amounts must be positive and become DEP deposits.</Typography>
          <Typography variant="subtitle2">Example: payment and deposit columns</Typography>
          <Box component="pre" sx={{ p: 1.5, bgcolor: 'grey.100', overflow: 'auto', fontSize: '0.8rem' }}>{`Date\tCheck #\tPayee\tMemo\tPayment\tDeposit\tCategory
10/06/2026\tEFT\tElectric Company\tOctober bill\t125.40\t\tUtilities
10/06/2026\tDEP\tEmployer\tPayroll\t\t2500.00\tIncome`}</Box>
          <Typography variant="subtitle2">Example: signed amount column</Typography>
          <Box component="pre" sx={{ p: 1.5, bgcolor: 'grey.100', overflow: 'auto', fontSize: '0.8rem' }}>{`Date\tNum\tDescription\tMemo\tAmount\tCategory
10/06/2026\t1025\tOffice Store\tPrinter paper\t-42.18\tOffice Supplies
10/06/2026\tDEP\tEmployer\tPayroll\t2500.00\tIncome`}</Box>
          <Typography variant="body2">Check # / Type values should be `DEP`, `EFT`, `TXFR`, or a numeric check number.</Typography>
        </HelpDialogContent>
        <HelpDialogActions><Button onClick={() => setHelpOpen(false)} variant="contained">Close</Button></HelpDialogActions>
      </HelpDialog>
    </Dialog>
  );
}
