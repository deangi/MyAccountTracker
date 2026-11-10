import { useState, useEffect } from 'react';
import {
  AppBar as MuiAppBar, Toolbar, Typography, IconButton, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert,
} from '@mui/material';
import { Menu as MenuIcon, InsertDriveFile } from '@mui/icons-material';
import LoginButton from '../auth/LoginButton';
import FileMenu from './FileMenu';
import { useApp } from '../../store/AppContext';
import { APP_TITLE, APP_VERSION, APP_BUILD_DATE, TOKEN_EXPIRY_WARNING_MS, DIRTY_WARNING_MS } from '../../config';
import { getTokenAcquiredAt } from '../../services/googleAuth';

export default function AppBarComponent({ onMenuClick }) {
  const { state, save } = useApp();
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);
  const [expiryPromptOpen, setExpiryPromptOpen] = useState(false);
  const [promptedTokenAt, setPromptedTokenAt] = useState(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { hasUnsavedChanges, dirtySince, lastSaveTime } = state.saveStatus;
  const tokenAge = now - (getTokenAcquiredAt() ?? now);
  const dirtyAge = dirtySince ? now - dirtySince : 0;
  const isUrgent = hasUnsavedChanges && (tokenAge > TOKEN_EXPIRY_WARNING_MS || dirtyAge > DIRTY_WARNING_MS);

  useEffect(() => {
    const tokenAcquiredAt = getTokenAcquiredAt();
    if (!hasUnsavedChanges) {
      setExpiryPromptOpen(false);
      setPromptedTokenAt(null);
      return;
    }
    if (tokenAcquiredAt && now - tokenAcquiredAt >= TOKEN_EXPIRY_WARNING_MS && promptedTokenAt !== tokenAcquiredAt) {
      setPromptedTokenAt(tokenAcquiredAt);
      setExpiryPromptOpen(true);
    }
  }, [hasUnsavedChanges, now, promptedTokenAt]);

  const handleExpirySave = async () => {
    await save();
    setExpiryPromptOpen(false);
  };

  const statusText = hasUnsavedChanges
    ? 'Unsaved changes'
    : lastSaveTime
    ? `Saved ${new Date(lastSaveTime).toLocaleTimeString()}`
    : '';

  return (
    <MuiAppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton edge="start" color="inherit" onClick={onMenuClick} sx={{ mr: 2 }}>
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap sx={{ flexGrow: 0, mr: 2 }}>
          {APP_TITLE}
          <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
            v{APP_VERSION} · built {APP_BUILD_DATE}
          </Typography>
        </Typography>

        {state.isAuthenticated && (
          <>
            <IconButton
              color="inherit"
              onClick={(e) => setFileMenuAnchor(e.currentTarget)}
              sx={{ mr: 1 }}
            >
              <InsertDriveFile />
            </IconButton>
            <FileMenu
              anchorEl={fileMenuAnchor}
              open={Boolean(fileMenuAnchor)}
              onClose={() => setFileMenuAnchor(null)}
            />
          </>
        )}

        {state.spreadsheetTitle && (
          <Typography variant="body2" noWrap sx={{ flexGrow: 1, opacity: 0.8 }}>
            — {state.spreadsheetTitle}
          </Typography>
        )}
        {!state.spreadsheetTitle && <Box sx={{ flexGrow: 1 }} />}

        {statusText && (
          <Chip
            label={statusText}
            size="small"
            color={isUrgent ? 'error' : hasUnsavedChanges ? 'warning' : 'success'}
            variant="outlined"
            {...(hasUnsavedChanges && { onClick: () => save() })}
            sx={{
              mr: 2, color: 'inherit', borderColor: 'rgba(255,255,255,0.5)',
              ...(hasUnsavedChanges && { cursor: 'pointer' }),
            }}
          />
        )}

        <LoginButton />
      </Toolbar>
      <Dialog open={expiryPromptOpen} onClose={() => setExpiryPromptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save Before Google Sign-In Expires</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Google access is about to expire and this file has unsaved changes.
          </Alert>
          <Typography variant="body2">
            Save now while access is available. If saving cannot complete, MyAccountTracker will download a JSON recovery backup.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpiryPromptOpen(false)}>Keep Working</Button>
          <Button onClick={handleExpirySave} variant="contained" color="warning" disabled={state.loading}>Save Now</Button>
        </DialogActions>
      </Dialog>
    </MuiAppBar>
  );
}
