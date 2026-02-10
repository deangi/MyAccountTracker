import {
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Typography, Box, Toolbar,
} from '@mui/material';
import {
  AccountBalance, Receipt, People, Category, CheckCircle, History,
} from '@mui/icons-material';
import { useApp } from '../../store/AppContext';

const DRAWER_WIDTH = 260;

const navItems = [
  { id: 'accounts', label: 'Accounts', icon: <AccountBalance /> },
  { id: 'payees', label: 'Payees', icon: <People /> },
  { id: 'categories', label: 'Categories', icon: <Category /> },
];

export default function Sidebar({ open, onClose, currentView, onViewChange, isMobile }) {
  const { state, dispatch } = useApp();

  const handleAccountClick = (accountId) => {
    dispatch({ type: 'SELECT_ACCOUNT', payload: accountId });
    onViewChange('transactions');
    if (isMobile) onClose();
  };

  const handleNavClick = (viewId) => {
    onViewChange(viewId);
    if (isMobile) onClose();
  };

  const drawerContent = (
    <Box>
      <Toolbar />
      <List>
        {navItems.map((item) => (
          <ListItem key={item.id} disablePadding>
            <ListItemButton
              selected={currentView === item.id}
              onClick={() => handleNavClick(item.id)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          ACCOUNTS
        </Typography>
      </Box>
      <List dense>
        {state.accounts.map((account) => (
          <ListItem key={account.id} disablePadding>
            <ListItemButton
              selected={state.selectedAccountId === account.id && currentView === 'transactions'}
              onClick={() => handleAccountClick(account.id)}
            >
              <ListItemIcon>
                <AccountBalance fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={account.nickname || account.name}
                secondary={account.type}
              />
            </ListItemButton>
          </ListItem>
        ))}
        {state.accounts.length === 0 && (
          <ListItem>
            <ListItemText
              secondary="No accounts yet"
              sx={{ textAlign: 'center' }}
            />
          </ListItem>
        )}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            selected={currentView === 'reconcile'}
            onClick={() => handleNavClick('reconcile')}
          >
            <ListItemIcon><CheckCircle /></ListItemIcon>
            <ListItemText primary="Reconcile" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            selected={currentView === 'reconcileHistory'}
            onClick={() => handleNavClick('reconcileHistory')}
          >
            <ListItemIcon><History /></ListItemIcon>
            <ListItemText primary="Reconciliation History" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'persistent'}
      open={open}
      onClose={onClose}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
