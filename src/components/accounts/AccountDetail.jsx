import { Box, Typography, Chip, Paper, Grid } from '@mui/material';
import { useApp } from '../../store/AppContext';
import { formatCurrency } from '../../utils/formatters';
import TransactionTable from '../transactions/TransactionTable';

export default function AccountDetail() {
  const { state } = useApp();
  const account = state.accounts.find((a) => a.id === state.selectedAccountId);

  if (!account) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="text.secondary">Select an account from the sidebar</Typography>
      </Box>
    );
  }

  const transactions = state.transactions.filter((t) => t.accountId === account.id);
  const balance = transactions.reduce((sum, t) => {
    return sum + (parseFloat(t.deposit) || 0) - (parseFloat(t.payment) || 0);
  }, 0);

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="h5">{account.nickname || account.name}</Typography>
            {account.nickname && (
              <Typography variant="body2" color="text.secondary">{account.name}</Typography>
            )}
            <Chip label={account.type} size="small" sx={{ mt: 0.5 }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="caption" color="text.secondary">Current Balance</Typography>
            <Typography variant="h4" color={balance >= 0 ? 'success.main' : 'error.main'}>
              {formatCurrency(balance)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <TransactionTable accountId={account.id} />
    </Box>
  );
}
