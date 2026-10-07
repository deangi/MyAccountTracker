import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControl, InputLabel, Link, ListItemText,
  MenuItem, Select, TextField, Typography, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import { Description, Launch } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { buildV2LedgerData, createMultiSheetReportSpreadsheet, createReportSpreadsheet } from '../../services/googleSheets';

const allValues = (items, key) => [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const money = (value) => Math.round(Number(value || 0) * 100) / 100;

function reportHeader(title, sourceFileName, runAt, periodLabel) {
  return [[title], ['Source account file', sourceFileName], ['Report run', runAt.toLocaleString()], [periodLabel[0], periodLabel[1]], []];
}

export default function ReportManager() {
  const { state } = useApp();
  const [accountIds, setAccountIds] = useState([]);
  const [payees, setPayees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomeFromDate, setIncomeFromDate] = useState('');
  const [incomeToDate, setIncomeToDate] = useState(new Date().toISOString().slice(0, 10));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [reportError, setReportError] = useState('');

  const payeeOptions = useMemo(() => allValues(state.transactions, 'payee'), [state.transactions]);
  const categoryOptions = useMemo(() => allValues(state.transactions, 'category'), [state.transactions]);

  const runTransactionList = async () => {
    setRunning(true);
    setResult(null);
    setReportError('');
    try {
      const accountNames = new Map(state.accounts.map((account) => [account.id, account.nickname || account.name]));
      const filtered = state.transactions
        .filter((transaction) => accountIds.length === 0 || accountIds.includes(transaction.accountId))
        .filter((transaction) => payees.length === 0 || payees.includes(transaction.payee))
        .filter((transaction) => categories.length === 0 || categories.includes(transaction.category))
        .filter((transaction) => !fromDate || transaction.date >= fromDate)
        .filter((transaction) => !toDate || transaction.date <= toDate)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      const runAt = new Date();
      const sourceFileName = state.meta.title || state.spreadsheetTitle || 'MyAccountTracker';
      const title = `${sourceFileName} — Transaction List — ${runAt.toISOString().slice(0, 10)}`;
      const rows = [
        ['Transaction List Report'],
        ['Source account file', sourceFileName],
        ['Report run', runAt.toLocaleString()],
        ['Date range', `${fromDate || 'All dates'} through ${toDate || 'All dates'}`],
        ['Accounts', accountIds.length ? accountIds.map((id) => accountNames.get(id)).join(', ') : 'All accounts'],
        ['Payees', payees.length ? payees.join(', ') : 'All payees'],
        ['Categories', categories.length ? categories.join(', ') : 'All categories'],
        [],
        ['Date', 'Account', 'Check # / Type', 'Payee', 'Memo', 'Payment', 'Deposit', 'Category', 'Reconciled'],
        ...filtered.map((transaction) => [
          transaction.date,
          accountNames.get(transaction.accountId) || 'Unknown account',
          transaction.checkNum || '',
          transaction.payee || '',
          transaction.description || '',
          Number(transaction.payment || 0),
          Number(transaction.deposit || 0),
          transaction.category || '',
          transaction.cleared ? 'Yes' : 'No',
        ]),
      ];
      const spreadsheetId = await createReportSpreadsheet(title, 'Transaction List', rows);
      setResult({ title, count: filtered.length, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (err) {
      setReportError(err.message || 'Could not create the report.');
    } finally {
      setRunning(false);
    }
  };

  const runFinancialReport = async (kind) => {
    setRunning(true);
    setResult(null);
    setReportError('');
    try {
      if (state.meta.version !== '2') throw new Error('Balance Sheet and Profit & Loss reports require a loaded Format 2 account file.');
      if (kind === 'profit-loss' && (!incomeFromDate || !incomeToDate || incomeToDate < incomeFromDate)) {
        throw new Error('Enter both Profit & Loss dates, with an end date on or after the start date.');
      }
      const sourceFileName = state.meta.title || state.spreadsheetTitle || 'MyAccountTracker';
      const runAt = new Date();
      // Reports must include committed changes that have not yet been reloaded
      // from Google Sheets, so derive the V2 ledger from the live register state.
      const ledger = buildV2LedgerData({ accounts: state.accounts, transactions: state.transactions });
      const chartOfAccounts = ledger.chart_of_accounts;
      const entryDates = new Map(ledger.journal_entries.map((entry) => [entry.id, entry.date]));
      const balances = new Map(chartOfAccounts.map((account) => [account.id, 0]));
      const from = kind === 'profit-loss' ? incomeFromDate : '';
      const to = kind === 'profit-loss' ? incomeToDate : asOfDate;
      for (const posting of ledger.postings) {
        const date = entryDates.get(posting.journalEntryId) || '';
        if ((from && date < from) || (to && date > to)) continue;
        balances.set(posting.accountId, money((balances.get(posting.accountId) || 0) + Number(posting.debit || 0) - Number(posting.credit || 0)));
      }
      let rows;
      let title;
      let sheetName;
      if (kind === 'balance-sheet') {
        title = `${sourceFileName} — Balance Sheet — ${asOfDate || 'Current'}`;
        sheetName = 'Balance Sheet';
        const byClass = (accountClass) => chartOfAccounts
          .filter((account) => account.accountClass === accountClass)
          .map((account) => ({ name: account.name, amount: money((account.normalBalance === 'credit' ? -1 : 1) * (balances.get(account.id) || 0)) }))
          .filter((item) => item.amount !== 0);
        const assets = byClass('asset');
        const liabilities = byClass('liability');
        const equity = byClass('equity');
        const income = byClass('income').reduce((sum, item) => sum + item.amount, 0);
        const expenses = byClass('expense').reduce((sum, item) => sum + item.amount, 0);
        const currentEarnings = money(income - expenses);
        const total = (items) => money(items.reduce((sum, item) => sum + item.amount, 0));
        rows = [
          ...reportHeader('Balance Sheet', sourceFileName, runAt, ['As of', asOfDate || 'Current']),
          ['Assets'], ...assets.map((item) => [item.name, item.amount]), ['Total Assets', total(assets)], [],
          ['Liabilities'], ...liabilities.map((item) => [item.name, item.amount]), ['Total Liabilities', total(liabilities)], [],
          ['Equity'], ...equity.map((item) => [item.name, item.amount]), ['Current Earnings', currentEarnings], ['Total Equity', money(total(equity) + currentEarnings)], ['Total Liabilities and Equity', money(total(liabilities) + total(equity) + currentEarnings)],
        ];
      } else {
        title = `${sourceFileName} — Profit and Loss — ${incomeFromDate || 'Start'} to ${incomeToDate || 'Current'}`;
        sheetName = 'Profit and Loss';
        const byClass = (accountClass) => chartOfAccounts
          .filter((account) => account.accountClass === accountClass)
          .map((account) => ({ name: account.name, amount: money((account.normalBalance === 'credit' ? -1 : 1) * (balances.get(account.id) || 0)) }))
          .filter((item) => item.amount !== 0);
        const income = byClass('income');
        const expenses = byClass('expense');
        const total = (items) => money(items.reduce((sum, item) => sum + item.amount, 0));
        rows = [
          ...reportHeader('Profit and Loss', sourceFileName, runAt, ['Period', `${incomeFromDate || 'All dates'} through ${incomeToDate || 'Current'}`]),
          ['Income'], ...income.map((item) => [item.name, item.amount]), ['Total Income', total(income)], [],
          ['Expenses'], ...expenses.map((item) => [item.name, item.amount]), ['Total Expenses', total(expenses)], [], ['Net Income', money(total(income) - total(expenses))],
        ];
      }
      const spreadsheetId = await createReportSpreadsheet(title, sheetName, rows);
      setResult({ title, count: null, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (err) {
      setReportError(err.message || 'Could not create the report.');
    } finally {
      setRunning(false);
    }
  };

  const runPayeesAndCategories = async () => {
    setRunning(true);
    setResult(null);
    setReportError('');
    try {
      const sourceFileName = state.meta.title || state.spreadsheetTitle || 'MyAccountTracker';
      const runAt = new Date();
      const title = `${sourceFileName} — Payees and Categories — ${runAt.toISOString().slice(0, 10)}`;
      const header = (name) => [...reportHeader(name, sourceFileName, runAt, ['Sorted', 'Alphabetically']), ['Name']];
      const allNames = (masterItems, transactionField) => [...new Set([
        ...masterItems.map((item) => item.name),
        ...state.transactions.map((transaction) => transaction[transactionField]),
      ].map((name) => String(name || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      const spreadsheetId = await createMultiSheetReportSpreadsheet(title, [
        { name: 'Payees', rows: [...header('Payees'), ...allNames(state.payees, 'payee').map((name) => [name])] },
        { name: 'Categories', rows: [...header('Categories'), ...allNames(state.categories, 'category').map((name) => [name])] },
      ]);
      setResult({ title, count: null, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (err) {
      setReportError(err.message || 'Could not create the report.');
    } finally {
      setRunning(false);
    }
  };

  const multipleSelector = (label, values, options, onChange) => (
    <FormControl fullWidth margin="dense">
      <InputLabel>{label}</InputLabel>
      <Select multiple value={values} label={label} onChange={(event) => onChange(event.target.value)} renderValue={(selected) => selected.length ? `${selected.length} selected` : `All ${label.toLowerCase()}`}>
        {options.map((option) => (
          <MenuItem key={option.id || option} value={option.id || option}>
            <Checkbox checked={values.includes(option.id || option)} />
            <ListItemText primary={option.nickname || option.name || option} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>Reports</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Run a report and save it as a separate Google Sheet. The report includes the date and time it was run.</Typography>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
        <Typography variant="h6">Transaction List</Typography>
        <Typography variant="body2" color="text.secondary">Filter by one or more accounts, payees, categories, and dates.</Typography>
        {multipleSelector('Accounts', accountIds, state.accounts, setAccountIds)}
        {multipleSelector('Payees', payees, payeeOptions, setPayees)}
        {multipleSelector('Categories', categories, categoryOptions, setCategories)}
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField label="From date" type="date" fullWidth value={fromDate} onChange={(event) => setFromDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To date" type="date" fullWidth value={toDate} onChange={(event) => setToDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running} onClick={runTransactionList}>
          {running ? 'Creating report…' : 'Create Transaction List'}
        </Button>
      </Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mt: 2 }}>
        <Typography variant="h6">Balance Sheet</Typography>
        <Typography variant="body2" color="text.secondary">Assets, liabilities, equity, and current earnings as of a selected date.</Typography>
        <TextField sx={{ mt: 1 }} label="As of date" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Box><Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running} onClick={() => runFinancialReport('balance-sheet')}>Create Balance Sheet</Button></Box>
      </Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mt: 2 }}>
        <Typography variant="h6">Profit &amp; Loss</Typography>
        <Typography variant="body2" color="text.secondary">Income, expenses, and net income for a selected period.</Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField label="From date" type="date" fullWidth value={incomeFromDate} onChange={(event) => setIncomeFromDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To date" type="date" fullWidth value={incomeToDate} onChange={(event) => setIncomeToDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running} onClick={() => runFinancialReport('profit-loss')}>Create Profit &amp; Loss</Button>
      </Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mt: 2 }}>
        <Typography variant="h6">Payees &amp; Categories</Typography>
        <Typography variant="body2" color="text.secondary">Alphabetized payees and categories in separate worksheets of one report file.</Typography>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running} onClick={runPayeesAndCategories}>Create Payees &amp; Categories</Button>
      </Box>
      {result?.url && <Alert severity="success" sx={{ mt: 2 }}><strong>Report created successfully:</strong> {result.title}{result.count != null ? ` (${result.count} transaction(s))` : ''}. <Link href={result.url} target="_blank" rel="noreferrer" underline="hover">Open report <Launch fontSize="inherit" /></Link></Alert>}
      <Dialog open={Boolean(reportError)} onClose={() => setReportError('')} maxWidth="sm" fullWidth>
        <DialogTitle>Report Could Not Be Created</DialogTitle>
        <DialogContent><Alert severity="error">{reportError}</Alert></DialogContent>
        <DialogActions><Button onClick={() => setReportError('')} variant="contained">Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
