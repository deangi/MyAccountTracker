import { useState } from 'react';
import {
  Menu, MenuItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Alert, Typography,
} from '@mui/material';
import { NoteAdd, FolderOpen, Save, SaveAs, Upgrade, Sync } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { openPicker } from '../../services/googleSheets';

export default function FileMenu({ anchorEl, open, onClose }) {
  const { state, save, load, createNew, saveAs, migrateToV2, rebuildV2Ledger } = useApp();
  const [newDialog, setNewDialog] = useState(false);
  const [saveAsDialog, setSaveAsDialog] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [migrationDialog, setMigrationDialog] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);

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
    setOpenDialog(false);
    try {
      const id = await openPicker();
      if (id) {
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

  const handleMigrate = async () => {
    try {
      const result = await migrateToV2();
      setMigrationDialog(false);
      setConversionResult({ result, error: '' });
    } catch (err) {
      setMigrationDialog(false);
      setConversionResult({ result: null, error: err.message || 'Format conversion failed.' });
    }
  };

  const handleRebuildLedger = async () => {
    onClose();
    try {
      const report = await rebuildV2Ledger();
      setValidationResult({ report, error: '' });
    } catch (err) {
      console.error('Ledger rebuild error:', err);
      setValidationResult({ report: null, error: err.message || 'Ledger validation failed.' });
    }
  };

  const correctionCount = (report) => (
    report.journalEntries.added + report.journalEntries.removed + report.journalEntries.updated
    + report.postings.added + report.postings.removed + report.postings.updated
  );

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
        {state.meta.version === '1' && (
          <MenuItem onClick={() => { onClose(); setMigrationDialog(true); }} disabled={!state.isAuthenticated}>
            <ListItemIcon><Upgrade /></ListItemIcon>
            <ListItemText>Convert to Format 2</ListItemText>
          </MenuItem>
        )}
        {state.meta.version === '2' && (
          <MenuItem onClick={handleRebuildLedger} disabled={!state.isAuthenticated}>
            <ListItemIcon><Sync /></ListItemIcon>
            <ListItemText>Validate V2 Ledger</ListItemText>
          </MenuItem>
        )}
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

      <Dialog open={migrationDialog} onClose={() => setMigrationDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Convert Spreadsheet to Format 2</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            The original file is renamed as a dated backup before conversion. A new Format 2 workbook is then created with the original file name.
          </Alert>
          <p>The converter validates accounts, transactions, linked transfers, and reconciliation references before creating the new workbook.</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMigrationDialog(false)}>Cancel</Button>
          <Button onClick={handleMigrate} variant="contained">Create Backup and Convert</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(conversionResult)} onClose={() => setConversionResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Format 2 Conversion Report</DialogTitle>
        <DialogContent>
          {conversionResult?.error ? (
            <>
              <Alert severity="error" sx={{ mb: 2 }}>Conversion did not complete. The new Format 2 sheet was not reported as successful.</Alert>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{conversionResult.error}</Typography>
            </>
          ) : conversionResult?.result && (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>Conversion completed and the validated Format 2 sheet was saved to Google Sheets.</Alert>
              <Typography component="div" variant="body2">
                <p>The original workbook was retained as the dated V1 backup. The new Format 2 workbook has the original title.</p>
                {conversionResult.result.warnings?.length > 0 && (
                  <Alert severity="warning">{conversionResult.result.warnings.join(' ')}</Alert>
                )}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setConversionResult(null)} variant="contained">Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(validationResult)} onClose={() => setValidationResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle>V2 Ledger Validation</DialogTitle>
        <DialogContent>
          {validationResult?.error ? (
            <Alert severity="error">{validationResult.error}</Alert>
          ) : validationResult?.report && (
            <>
              {correctionCount(validationResult.report) > 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Corrections were applied to rebuild the ledger from the account registers.
                </Alert>
              ) : (
                <Alert severity="success" sx={{ mb: 2 }}>All ledger checks passed. No corrections were needed.</Alert>
              )}
              <Typography component="div" variant="body2">
                {correctionCount(validationResult.report) > 0 && (
                  <ul>
                    <li>Journal entries: {validationResult.report.journalEntries.added} added, {validationResult.report.journalEntries.updated} updated, {validationResult.report.journalEntries.removed} removed.</li>
                    <li>Postings: {validationResult.report.postings.added} added, {validationResult.report.postings.updated} updated, {validationResult.report.postings.removed} removed.</li>
                  </ul>
                )}
                <p>Validated {validationResult.report.transactionCount} register transactions, {validationResult.report.journalEntryCount} journal entries, and {validationResult.report.postingCount} postings. Every journal entry is balanced.</p>
              </Typography>
              <Alert severity="success" sx={{ mt: 2 }}>The validated sheet was saved to Google Sheets.</Alert>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setValidationResult(null)} variant="contained">Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
