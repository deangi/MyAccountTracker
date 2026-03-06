import { useState, useEffect } from 'react';
import {
  AppBar as MuiAppBar, Toolbar, Typography, IconButton, Box, Chip,
} from '@mui/material';
import { Menu as MenuIcon, InsertDriveFile } from '@mui/icons-material';
import LoginButton from '../auth/LoginButton';
import FileMenu from './FileMenu';
import { useApp } from '../../store/AppContext';
import { APP_TITLE, APP_VERSION, TOKEN_EXPIRY_WARNING_MS, DIRTY_WARNING_MS } from '../../config';
import { getTokenAcquiredAt } from '../../services/googleAuth';

export default function AppBarComponent({ onMenuClick }) {
  const { state, save } = useApp();
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { hasUnsavedChanges, dirtySince, lastSaveTime } = state.saveStatus;
  const tokenAge = now - (getTokenAcquiredAt() ?? now);
  const dirtyAge = dirtySince ? now - dirtySince : 0;
  const isUrgent = hasUnsavedChanges && (tokenAge > TOKEN_EXPIRY_WARNING_MS || dirtyAge > DIRTY_WARNING_MS);

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
            v{APP_VERSION}
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
              '@keyframes blink': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.25 },
              },
              ...(isUrgent && { animation: 'blink 1.2s ease-in-out infinite' }),
            }}
          />
        )}

        <LoginButton />
      </Toolbar>
    </MuiAppBar>
  );
}
