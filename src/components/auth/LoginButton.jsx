import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, CircularProgress, Alert,
} from '@mui/material';
import { Login, Logout } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { signIn, signOut } from '../../services/googleAuth';
import { getAutoSaveStatus } from '../../services/autoSave';

export default function LoginButton() {
  const { state, save } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // A sign-out confirmation should never remain on screen indefinitely. It
  // simply cancels after one minute; it does not sign out or discard changes.
  useEffect(() => {
    if (!dialogOpen || saving) return undefined;
    const timeout = setTimeout(() => {
      setDialogOpen(false);
      setSaveError('');
    }, 60_000);
    return () => clearTimeout(timeout);
  }, [dialogOpen, saving]);

  const handleSignOutClick = () => {
    if (getAutoSaveStatus().hasUnsavedChanges) {
      setSaveError('');
      setDialogOpen(true);
    } else {
      signOut();
    }
  };

  const handleSaveAndSignOut = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await save();
      signOut();
    } catch (err) {
      console.error('Save before sign-out failed:', err);
      setSaveError('Save failed. You can sign out without saving or try again.');
      setSaving(false);
    }
  };

  const handleSignOutWithoutSaving = () => {
    signOut();
  };

  const handleCancel = () => {
    setDialogOpen(false);
    setSaveError('');
    setSaving(false);
  };

  if (state.isAuthenticated) {
    return (
      <>
        <Button color="inherit" startIcon={<Logout />} onClick={handleSignOutClick}>
          Sign Out
        </Button>

        <Dialog open={dialogOpen} onClose={saving ? undefined : handleCancel} maxWidth="xs" fullWidth>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogContent>
            {saveError
              ? <Alert severity="error" sx={{ mt: 1 }}>{saveError}</Alert>
              : <Typography>You have unsaved changes. Save before signing out? This prompt will close in one minute.</Typography>
            }
            {saving && (
              <Typography sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} /> Saving…
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleSignOutWithoutSaving} disabled={saving} color="warning">
              Sign Out Without Saving
            </Button>
            <Button onClick={handleSaveAndSignOut} disabled={saving} variant="contained">
              {saveError ? 'Retry Save' : 'Save & Sign Out'}
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return (
    <Button color="inherit" startIcon={<Login />} onClick={signIn}>
      Sign In with Google
    </Button>
  );
}
