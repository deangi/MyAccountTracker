import { useState } from 'react';
import {
  AppBar as MuiAppBar, Toolbar, Typography, IconButton, Box, Chip,
} from '@mui/material';
import { Menu as MenuIcon, InsertDriveFile } from '@mui/icons-material';
import LoginButton from '../auth/LoginButton';
import FileMenu from './FileMenu';
import { useApp } from '../../store/AppContext';
import { APP_TITLE } from '../../config';

export default function AppBarComponent({ onMenuClick }) {
  const { state } = useApp();
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);

  const statusText = state.saveStatus.hasUnsavedChanges
    ? 'Unsaved changes'
    : state.saveStatus.lastSaveTime
    ? `Saved ${new Date(state.saveStatus.lastSaveTime).toLocaleTimeString()}`
    : '';

  return (
    <MuiAppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton edge="start" color="inherit" onClick={onMenuClick} sx={{ mr: 2 }}>
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap sx={{ flexGrow: 0, mr: 2 }}>
          {APP_TITLE}
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
            color={state.saveStatus.hasUnsavedChanges ? 'warning' : 'success'}
            variant="outlined"
            sx={{ mr: 2, color: 'inherit', borderColor: 'rgba(255,255,255,0.5)' }}
          />
        )}

        <LoginButton />
      </Toolbar>
    </MuiAppBar>
  );
}
