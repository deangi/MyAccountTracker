import { useState } from 'react';
import {
  Menu, MenuItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button,
} from '@mui/material';
import { NoteAdd, FolderOpen, Save, SaveAs } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { openPicker } from '../../services/googleSheets';

export default function FileMenu({ anchorEl, open, onClose }) {
  const { state, save, load, createNew, saveAs } = useApp();
  const [newDialog, setNewDialog] = useState(false);
  const [saveAsDialog, setSaveAsDialog] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [sheetId, setSheetId] = useState('');

  const handleNew = () => {
    onClose();
    setTitle('');
    setOwner('');
    setNewDialog(true);
  };

  const handleCreateNew = async () => {
    if (!title.trim()) return;
    await createNew(title.trim(), owner.trim());
    setNewDialog(false);
  };

  const handleOpen = () => {
    onClose();
    setSheetId('');
    setOpenDialog(true);
  };

  const handleOpenPicker = async () => {
    try {
      const id = await openPicker();
      if (id) {
        setOpenDialog(false);
        await load(id);
      }
    } catch (err) {
      console.error('Picker error:', err);
    }
  };

  const handleOpenById = async () => {
    if (!sheetId.trim()) return;
    setOpenDialog(false);
    await load(sheetId.trim());
  };

  const handleSave = async () => {
    onClose();
    await save();
  };

  const handleSaveAs = () => {
    onClose();
    setTitle(state.meta.title || '');
    setSaveAsDialog(true);
  };

  const handleSaveAsConfirm = async () => {
    if (!title.trim()) return;
    await saveAs(title.trim());
    setSaveAsDialog(false);
  };

  return (
    <>
      <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
        <MenuItem onClick={handleNew} disabled={!state.isAuthenticated}>
          <ListItemIcon><NoteAdd /></ListItemIcon>
          <ListItemText>New</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOpen} disabled={!state.isAuthenticated}>
          <ListItemIcon><FolderOpen /></ListItemIcon>
          <ListItemText>Open</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSave} disabled={!state.isAuthenticated}>
          <ListItemIcon><Save /></ListItemIcon>
          <ListItemText>Save</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSaveAs} disabled={!state.isAuthenticated}>
          <ListItemIcon><SaveAs /></ListItemIcon>
          <ListItemText>Save As</ListItemText>
        </MenuItem>
      </Menu>

      {/* New dialog */}
      <Dialog open={newDialog} onClose={() => setNewDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Account File</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus margin="dense" label="Title" fullWidth
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            margin="dense" label="Owner Name" fullWidth
            value={owner} onChange={(e) => setOwner(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateNew} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Open dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Open Spreadsheet</DialogTitle>
        <DialogContent>
          <Button variant="outlined" fullWidth sx={{ mb: 2, mt: 1 }} onClick={handleOpenPicker}>
            Browse with Google Picker
          </Button>
          <TextField
            margin="dense" label="Or enter Spreadsheet ID" fullWidth
            value={sheetId} onChange={(e) => setSheetId(e.target.value)}
            helperText="The ID from the Google Sheets URL"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleOpenById} variant="contained" disabled={!sheetId.trim()}>Open</Button>
        </DialogActions>
      </Dialog>

      {/* Save As dialog */}
      <Dialog open={saveAsDialog} onClose={() => setSaveAsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save As</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus margin="dense" label="New Title" fullWidth
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveAsDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveAsConfirm} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
