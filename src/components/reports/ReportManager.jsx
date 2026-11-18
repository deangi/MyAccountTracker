import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControl, InputLabel, Link, ListItemText,
  MenuItem, Select, TextField, Typography, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import { Description, Launch } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { buildV2LedgerData, createMultiSheetReportSpreadsheet, createReportSpreadsheet } from '../../services/googleSheets';
import { formatCurrency, toISODate } from '../../utils/formatters';
import { buildNetWorthStatement, netWorthStatementRows } from '../../utils/netWorth';
import { netProfitLossCategories, transactionsForProfitLoss } from '../../utils/profitLoss';
import { selectReportTransactions } from '../../utils/transactionReport';

const allValues = (items, key) => [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const money = (value) => Math.round(Number(value || 0) * 100) / 100;

function reportHeader(title, sourceFileName, runAt, periodLabel) {
  return [[title], ['Source account file', sourceFileName], ['Report run', runAt.toLocaleString()], [periodLabel[0], periodLabel[1]], []];
}

export default function ReportManager() {
  const { state } = useApp();
  const [payees, setPayees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [amount, setAmount] = useState('');
  const [amountDirection, setAmountDirection] = useState('either');
  const [asOfDate, setAsOfDate] = useState(toISODate(new Date().toISOString()));
  const [incomeFromDate, setIncomeFromDate] = useState('');
  const [incomeToDate, setIncomeToDate] = useState(new Date().toISOString().slice(0, 10));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [reportError, setReportError] = useState('');

  const payeeOptions = useMemo(() => [...new Set([
    ...state.payees.map((item) => item.name),
    ...allValues(state.transactions, 'payee'),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b)), [state.payees, state.transactions]);
  const categoryOptions = useMemo(() => [...new Set([
    ...state.categories.map((item) => item.name),
    ...allValues(state.transactions, 'category'),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b)), [state.categories, state.transactions]);
  const netWorthPreview = useMemo(() => {
    try { return { statement: buildNetWorthStatement({ accounts: state.accounts, transactions: state.transactions, asOfDate }) }; }
    catch (error) { return { error: error.message }; }
  }, [state.accounts, state.transactions, asOfDate]);

  const runNetWorth = async () => {
    setRunning(true);
    setResult(null);
    setReportError('');
    try {
      if (netWorthPreview.error) throw new Error(netWorthPreview.error);
      const statement = netWorthPreview.statement;
      const sourceFileName = state.meta.title || state.spreadsheetTitle || 'MyAccountTracker';
      const title = `${sourceFileName} — Net Worth Statement — ${asOfDate}`;
      const rows = [
        ...reportHeader('Net Worth Statement', sourceFileName, new Date(), ['As of', asOfDate]),
        ...netWorthStatementRows(statement),
      ];
      const spreadsheetId = await createReportSpreadsheet(title, 'Net Worth Statement', rows);
      setResult({ title, count: null, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (error) {
      setReportError(error.message || 'Could not create the Net Worth Statement.');
    } finally {
      setRunning(false);
    }
  };

  const runTransactionReport = async () => {
    setRunning(true);
    setResult(null);
    setReportError('');
    try {
      const accountNames = new Map(state.accounts.map((account) => [account.id, account.nickname || account.name]));
      const filtered = selectReportTransactions(state.transactions, {
        fromDate, toDate, payees, categories, amount, direction: amountDirection,
      });
      const runAt = new Date();
      const sourceFileName = state.meta.title || state.spreadsheetTitle || 'MyAccountTracker';
      const title = `${sourceFileName} — Transaction Report — ${fromDate} to ${toDate}`;
      const rows = [
        ['Transaction Report'],
        ['Source account file', sourceFileName],
        ['Report run', runAt.toLocaleString()],
        ['Date range', `${fromDate} through ${toDate}`],
        ['Accounts', 'All accounts'],
        ['Payees', payees.length ? payees.join(', ') : 'All payees'],
        ['Categories', categories.length ? categories.join(', ') : 'All categories'],
        ['Amount', amount === '' ? 'Any amount' : `${amountDirection === 'either' ? 'Payment or deposit' : amountDirection} ${Number(amount).toFixed(2)}`],
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
          transaction.cleared === 'TRUE' ? 'Yes' : 'No',
        ]),
        [],
        ['Total', `${filtered.length} transactions`, '', '', '',
          money(filtered.reduce((sum, transaction) => sum + Number(transaction.payment || 0), 0)),
          money(filtered.reduce((sum, transaction) => sum + Number(transaction.deposit || 0), 0))],
      ];
      const spreadsheetId = await createReportSpreadsheet(title, 'Transaction Report', rows);
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
      const reportTransactions = kind === 'profit-loss'
        ? transactionsForProfitLoss(state.accounts, state.transactions)
        : state.transactions;
      const ledger = buildV2LedgerData({ accounts: state.accounts, transactions: reportTransactions });
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
        const { income, expenses } = netProfitLossCategories(byClass('income'), byClass('expense'));
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
        <Typography variant="h6">Transaction Report</Typography>
        <Typography variant="body2" color="text.secondary">All accounts. Select a date range, then optionally filter by payee, category, or amount. Linked transfers appear once per account side.</Typography>
        {multipleSelector('Payees', payees, payeeOptions, setPayees)}
        {multipleSelector('Categories', categories, categoryOptions, setCategories)}
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField label="From date" type="date" fullWidth value={fromDate} onChange={(event) => setFromDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To date" type="date" fullWidth value={toDate} onChange={(event) => setToDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField label="Amount (optional)" type="number" fullWidth value={amount} onChange={(event) => setAmount(event.target.value)} slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }} />
          <TextField select label="Amount type" fullWidth value={amountDirection} onChange={(event) => setAmountDirection(event.target.value)} disabled={amount === ''}>
            <MenuItem value="either">Payment or deposit</MenuItem>
            <MenuItem value="payment">Payment</MenuItem>
            <MenuItem value="deposit">Deposit</MenuItem>
          </TextField>
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running} onClick={runTransactionReport}>
          {running ? 'Creating report…' : 'Create Transaction Report'}
        </Button>
      </Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mt: 2 }}>
        <Typography variant="h6">Net Worth Statement</Typography>
        <Typography variant="body2" color="text.secondary">Every account appears under Assets or Liabilities. Values come from account transactions through the selected date. Debt balances are shown as amounts owed.</Typography>
        <Typography variant="body2" color="text.secondary">To enter an opening value, add a Deposit to an asset account or a Payment to a debt account.</Typography>
        <TextField sx={{ mt: 1 }} label="As of date" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {netWorthPreview.error ? <Alert severity="error" sx={{ mt: 2 }}>{netWorthPreview.error}</Alert> : (
          <Box sx={{ mt: 2 }}>
            {[
              ['Assets', netWorthPreview.statement.assets, netWorthPreview.statement.totalAssets],
              ['Liabilities', netWorthPreview.statement.liabilities, netWorthPreview.statement.totalLiabilities],
            ].map(([heading, accounts, total]) => (
              <Box key={heading} sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{heading}</Typography>
                {accounts.map(account => (
                  <Box key={account.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.25 }}>
                    <Typography variant="body2">{account.name}</Typography>
                    <Typography variant="body2">{formatCurrency(account.amount)}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, borderTop: 1, borderColor: 'divider', mt: 1, pt: 0.5 }}>
                  <Typography variant="subtitle2">Total {heading}</Typography>
                  <Typography variant="subtitle2">{formatCurrency(total)}</Typography>
                </Box>
              </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, borderTop: 2, borderColor: 'text.primary', pt: 1 }}>
              <Typography variant="h6">Net Worth</Typography>
              <Typography variant="h6">{formatCurrency(netWorthPreview.statement.netWorth)}</Typography>
            </Box>
          </Box>
        )}
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<Description />} disabled={running || !!netWorthPreview.error} onClick={runNetWorth}>Create Net Worth Statement</Button>
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
      <Dialog open={Boolean(result?.url)} onClose={() => setResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Report Created Successfully</DialogTitle>
        <DialogContent>
          <Alert severity="success">
            <Typography variant="body2" sx={{ mb: 1 }}>The report was created successfully.</Typography>
            <Typography variant="body2"><strong>File name:</strong> {result?.title}</Typography>
            {result?.count != null && <Typography variant="body2">{result.count} transaction(s) included.</Typography>}
            <Link href={result?.url} target="_blank" rel="noreferrer" underline="hover" sx={{ display: 'inline-block', mt: 1 }}>
              Open report <Launch fontSize="inherit" />
            </Link>
          </Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setResult(null)} variant="contained">Close</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(reportError)} onClose={() => setReportError('')} maxWidth="sm" fullWidth>
        <DialogTitle>Report Could Not Be Created</DialogTitle>
        <DialogContent><Alert severity="error">{reportError}</Alert></DialogContent>
        <DialogActions><Button onClick={() => setReportError('')} variant="contained">Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
