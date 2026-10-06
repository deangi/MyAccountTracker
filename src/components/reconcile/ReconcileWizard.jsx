import { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Stepper, Step, StepLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Checkbox, Alert, MenuItem, IconButton,
} from '@mui/material';
import { Edit } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { formatCurrency, formatDate, toISODate } from '../../utils/formatters';
import TransactionForm from '../transactions/TransactionForm';

const steps = ['Select Account & Enter Balances', 'Clear Transactions', 'Review & Complete'];

export default function ReconcileWizard() {
  const { state, dispatch, generateUUID } = useApp();
  const [activeStep, setActiveStep] = useState(0);
  const [accountId, setAccountId] = useState(state.selectedAccountId || '');
  const [statementDate, setStatementDate] = useState(toISODate(new Date().toISOString()));
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const draftForAccount = (id) => state.reconcileDrafts.find((draft) => draft.accountId === id);

  const saveDraft = (step = activeStep, ids = selectedIds) => {
    if (!accountId) return;
    const existing = draftForAccount(accountId);
    const now = new Date().toISOString();
    dispatch({
      type: 'SAVE_RECONCILE_DRAFT',
      payload: {
        id: existing?.id || generateUUID(), accountId, activeStep: String(step),
        statementDate, statementOpeningBalance: openingBalance,
        statementClosingBalance: closingBalance,
        selectedTransactionIds: [...ids].join(','),
        createdAt: existing?.createdAt || now, updatedAt: now,
      },
    });
  };

  useEffect(() => {
    if (!accountId) return;
    const draft = state.reconcileDrafts.find((item) => item.accountId === accountId);
    const prev = state.reconciliations
      .filter((r) => r.accountId === accountId)
      .sort((a, b) => (a.date || '') < (b.date || '') ? 1 : (a.date || '') > (b.date || '') ? -1 : 0)[0];
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (draft) {
        setStatementDate(draft.statementDate || toISODate(new Date().toISOString()));
        setOpeningBalance(draft.statementOpeningBalance || '');
        setClosingBalance(draft.statementClosingBalance || '');
        setSelectedIds(new Set((draft.selectedTransactionIds || '').split(',').filter(Boolean)));
        setActiveStep(Number(draft.activeStep || 0));
      } else {
        setOpeningBalance(prev ? prev.statementClosingBalance : '');
        setSelectedIds(new Set());
        setActiveStep(0);
      }
    });
    return () => { active = false; };
  }, [accountId, state.reconciliations, state.reconcileDrafts]);

  const unclearedTransactions = useMemo(() => {
    if (!accountId) return [];
    return state.transactions
      .filter((t) => t.accountId === accountId && t.cleared !== 'TRUE')
      .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0);
  }, [state.transactions, accountId]);

  const selectedTotal = useMemo(() => {
    return unclearedTransactions
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + (parseFloat(t.deposit) || 0) - (parseFloat(t.payment) || 0), 0);
  }, [unclearedTransactions, selectedIds]);

  const expectedBalance = (parseFloat(openingBalance) || 0) + selectedTotal;
  const difference = (parseFloat(closingBalance) || 0) - expectedBalance;
  const isBalanced = Math.abs(difference) < 0.005;

  const toggleTransaction = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    saveDraft(1, next);
  };

  const handleAddTransaction = () => {
    saveDraft(activeStep);
    setEditingTransaction(null);
    setTransactionFormOpen(true);
  };

  const handleEditTransaction = (transaction) => {
    saveDraft(activeStep);
    setEditingTransaction(transaction);
    setTransactionFormOpen(true);
  };

  const handleDiscardDraft = () => {
    const draft = draftForAccount(accountId);
    if (draft && window.confirm('Discard this suspended reconciliation?')) {
      dispatch({ type: 'DELETE_RECONCILE_DRAFT', payload: draft.id });
      setActiveStep(0);
      setSelectedIds(new Set());
    }
  };

  const handleComplete = () => {
    const reconciliationId = generateUUID();

    dispatch({
      type: 'ADD_RECONCILIATION',
      payload: {
        id: reconciliationId,
        accountId,
        date: statementDate,
        statementOpeningBalance: openingBalance,
        statementClosingBalance: closingBalance,
        transactionIds: [...selectedIds].join(','),
      },
    });

    dispatch({
      type: 'UPDATE_TRANSACTIONS_BATCH',
      payload: [...selectedIds].map((id) => ({
        id,
        cleared: 'TRUE',
        reconciliationId,
      })),
    });

    const draft = draftForAccount(accountId);
    if (draft) dispatch({ type: 'DELETE_RECONCILE_DRAFT', payload: draft.id });

    // Reset wizard
    setActiveStep(0);
    setSelectedIds(new Set());
    setOpeningBalance('');
    setClosingBalance('');
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Reconcile Account</Typography>

      {draftForAccount(accountId) && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={handleDiscardDraft}>Discard</Button>}>
          Suspended reconciliation restored. You can continue where you left off.
        </Alert>
      )}

      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {steps.map((label) => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {activeStep === 0 && (
        <Box sx={{ maxWidth: 400 }}>
          <TextField
            select fullWidth margin="dense" label="Account"
            value={accountId} onChange={(e) => setAccountId(e.target.value)}
          >
            {state.accounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.nickname || a.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth margin="dense" label="Statement Date" type="date"
            value={statementDate} onChange={(e) => setStatementDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth margin="dense" label="Statement Opening Balance" type="number"
            value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)}
            slotProps={{ input: { inputProps: { step: '0.01' } } }}
          />
          <TextField
            fullWidth margin="dense" label="Statement Closing Balance" type="number"
            value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)}
            slotProps={{ input: { inputProps: { step: '0.01' } } }}
          />
          <Button
            variant="contained" sx={{ mt: 2 }}
            disabled={!accountId || !openingBalance || !closingBalance}
            onClick={() => { saveDraft(1); setActiveStep(1); }}
          >
            Next
          </Button>
        </Box>
      )}

      {activeStep === 1 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Check off transactions that appear on your bank statement.
          </Alert>

          <Box sx={{ mb: 2 }}>
            <Typography>
              Opening Balance: <strong>{formatCurrency(openingBalance)}</strong>
              {' | '}Cleared Balance: <strong>{formatCurrency(expectedBalance)}</strong>
              {' | '}Statement Closing: <strong>{formatCurrency(closingBalance)}</strong>
            </Typography>
            <Typography color={isBalanced ? 'success.main' : 'error.main'}>
              Difference: {formatCurrency(difference)}
            </Typography>
          </Box>

          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Date</TableCell>
                  <TableCell>Payee</TableCell>
                  <TableCell align="right">Payment</TableCell>
                  <TableCell align="right">Deposit</TableCell>
                  <TableCell align="center">Edit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unclearedTransactions.map((txn) => (
                  <TableRow key={txn.id} hover onClick={() => toggleTransaction(txn.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedIds.has(txn.id)} />
                    </TableCell>
                    <TableCell>{formatDate(txn.date)}</TableCell>
                    <TableCell>{txn.payee}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      {txn.payment ? formatCurrency(txn.payment) : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {txn.deposit ? formatCurrency(txn.deposit) : ''}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        aria-label={`Edit ${txn.payee || 'transaction'}`}
                        onClick={(event) => { event.stopPropagation(); handleEditTransaction(txn); }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {unclearedTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">No unreconciled transactions</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button onClick={() => { saveDraft(0); setActiveStep(0); }}>Back</Button>
            <Button onClick={handleAddTransaction}>Add Missing Transaction</Button>
            <Button variant="contained" onClick={() => { saveDraft(2); setActiveStep(2); }}>Next</Button>
          </Box>
        </Box>
      )}

      {activeStep === 2 && (
        <Box>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Reconciliation Summary</Typography>
            <Typography>Account: {state.accounts.find((a) => a.id === accountId)?.name}</Typography>
            <Typography>Statement Date: {formatDate(statementDate)}</Typography>
            <Typography>Opening Balance: {formatCurrency(openingBalance)}</Typography>
            <Typography>Closing Balance: {formatCurrency(closingBalance)}</Typography>
            <Typography>Transactions Cleared: {selectedIds.size}</Typography>
            <Typography color={isBalanced ? 'success.main' : 'error.main'} variant="h6" sx={{ mt: 1 }}>
              Difference: {formatCurrency(difference)}
            </Typography>
          </Paper>

          {!isBalanced && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              The account does not balance. The difference is {formatCurrency(difference)}.
              Go back to check your transactions.
            </Alert>
          )}

          {isBalanced && (
            <Alert severity="success" sx={{ mb: 2 }}>
              The account balances! Click "Complete" to finalize the reconciliation.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => { saveDraft(1); setActiveStep(1); }}>Back</Button>
            <Button onClick={handleAddTransaction}>Add Missing Transaction</Button>
            <Button
              variant="contained" color="success"
              disabled={!isBalanced}
              onClick={handleComplete}
            >
              Complete Reconciliation
            </Button>
          </Box>
        </Box>
      )}
      <TransactionForm
        open={transactionFormOpen}
        onClose={() => setTransactionFormOpen(false)}
        transaction={editingTransaction}
        accountId={accountId}
      />
    </Box>
  );
}
