import { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, CardActions,
  Grid, IconButton, Chip,
} from '@mui/material';
import { Add, Edit, Delete, AccountBalance } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import AccountForm from './AccountForm';
import { formatCurrency } from '../../utils/formatters';

export default function AccountList({ onViewAccount }) {
  const { state, dispatch } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);

  const getBalance = (accountId) => {
    return state.transactions
      .filter((t) => t.accountId === accountId)
      .reduce((sum, t) => {
        const deposit = parseFloat(t.deposit) || 0;
        const payment = parseFloat(t.payment) || 0;
        return sum + deposit - payment;
      }, 0);
  };

  const handleEdit = (account) => {
    setEditAccount(account);
    setFormOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this account and all its transactions?')) {
      dispatch({ type: 'DELETE_ACCOUNT', payload: id });
    }
  };

  const handleAdd = () => {
    setEditAccount(null);
    setFormOpen(true);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Accounts</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>
          Add Account
        </Button>
      </Box>

      <Grid container spacing={2}>
        {state.accounts.map((account) => {
          const balance = getBalance(account.id);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={account.id}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
                onClick={() => onViewAccount(account.id)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <AccountBalance sx={{ mr: 1 }} color="primary" />
                    <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                      {account.nickname || account.name}
                    </Typography>
                  </Box>
                  {account.nickname && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {account.name}
                    </Typography>
                  )}
                  <Chip
                    label={account.type}
                    size="small"
                    sx={{ mt: 1, mb: 1 }}
                  />
                  <Typography variant="h5" color={balance >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(balance)}
                  </Typography>
                </CardContent>
                <CardActions onClick={(e) => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => handleEdit(account)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(account.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {state.accounts.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AccountBalance sx={{ fontSize: 64, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
            No accounts yet
          </Typography>
          <Typography color="text.secondary">
            Click "Add Account" to get started
          </Typography>
        </Box>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editAccount} />
    </Box>
  );
}
