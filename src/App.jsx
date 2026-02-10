import { useState, useEffect, useCallback } from 'react';
import { Box, Toolbar, CircularProgress, Typography, Alert, useMediaQuery, useTheme } from '@mui/material';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AppProvider, useApp } from './store/AppContext';
import { initAuth, setAuthChangeCallback } from './services/googleAuth';
import AppBarComponent from './components/layout/AppBar';
import Sidebar from './components/layout/Sidebar';
import AccountList from './components/accounts/AccountList';
import AccountDetail from './components/accounts/AccountDetail';
import PayeeManager from './components/payees/PayeeManager';
import CategoryManager from './components/categories/CategoryManager';
import ReconcileWizard from './components/reconcile/ReconcileWizard';
import ReconcileHistory from './components/reconcile/ReconcileHistory';
import { GOOGLE_CLIENT_ID } from './config';

const muiTheme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#4527a0' },
  },
});

function AppContent() {
  const { state, dispatch, load } = useApp();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [currentView, setCurrentView] = useState('accounts');
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setAuthChangeCallback((isAuth) => {
      dispatch({ type: 'SET_AUTH', payload: isAuth });
    });

    initAuth().then(() => {
      setAuthReady(true);
    });
  }, [dispatch]);

  // Auto-load default spreadsheet when authenticated
  useEffect(() => {
    if (state.isAuthenticated && state.spreadsheetId && !state.meta.title) {
      load(state.spreadsheetId);
    }
  }, [state.isAuthenticated, state.spreadsheetId, state.meta.title, load]);

  const handleViewAccount = useCallback((accountId) => {
    dispatch({ type: 'SELECT_ACCOUNT', payload: accountId });
    setCurrentView('transactions');
    if (isMobile) setSidebarOpen(false);
  }, [dispatch, isMobile]);

  const renderContent = () => {
    if (!authReady) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (!GOOGLE_CLIENT_ID) {
      return (
        <Alert severity="warning" sx={{ m: 2 }}>
          Google Client ID not configured. Create a <code>.env</code> file with <code>VITE_GOOGLE_CLIENT_ID</code> and <code>VITE_GOOGLE_API_KEY</code>.
          See README for setup instructions.
        </Alert>
      );
    }

    if (!state.isAuthenticated) {
      return (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h4" gutterBottom>MyAccountTracker</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Sign in with Google to manage your accounts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your data is stored in Google Sheets - you maintain full control
          </Typography>
        </Box>
      );
    }

    if (state.loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    switch (currentView) {
      case 'transactions':
        return <AccountDetail />;
      case 'payees':
        return <PayeeManager />;
      case 'categories':
        return <CategoryManager />;
      case 'reconcile':
        return <ReconcileWizard />;
      case 'reconcileHistory':
        return <ReconcileHistory />;
      case 'accounts':
      default:
        return <AccountList onViewAccount={handleViewAccount} />;
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBarComponent onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      {state.isAuthenticated && (
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentView={currentView}
          onViewChange={setCurrentView}
          isMobile={isMobile}
        />
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          transition: 'margin 0.3s',
          ml: state.isAuthenticated && sidebarOpen && !isMobile ? '260px' : 0,
        }}
      >
        <Toolbar />
        {state.error && (
          <Alert
            severity="error"
            onClose={() => dispatch({ type: 'SET_ERROR', payload: null })}
            sx={{ mb: 2 }}
          >
            {state.error}
          </Alert>
        )}
        {renderContent()}
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}
