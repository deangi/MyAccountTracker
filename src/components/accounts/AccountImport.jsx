import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography,
} from '@mui/material';
import { useApp } from '../../store/AppContext';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit card', 'loan', 'equity'];

function parseAccountFile(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('The account file needs a header row and at least one account row.');
  const headers = lines[0].split('\t').map((value) => value.trim());
  const headerMap = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
  const nameIndex = headerMap.get('account name') ?? headerMap.get('name');
  if (nameIndex == null) throw new Error('The account file must include an Account Name column.');
  const valueAt = (parts, names) => {
    const index = names.map((name) => headerMap.get(name)).find((value) => value != null);
    return index == null ? '' : (parts[index] || '').trim();
  };
  return lines.slice(1).map((line) => {
    const parts = line.split('\t');
    return {
      name: (parts[nameIndex] || '').trim(),
      nickname: valueAt(parts, ['nickname']),
      type: valueAt(parts, ['type']).toLowerCase() || 'checking',
      address: valueAt(parts, ['bank address', 'address']),
      phone: valueAt(parts, ['phone']),
      webAddress: valueAt(parts, ['website', 'web address']),
    };
  }).filter((account) => account.name);
}

export default function AccountImport({ open, onClose }) {
  const { state, dispatch, generateUUID } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  const close = () => {
    setAccounts([]);
    setError('');
    onClose();
  };

  const selectFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseAccountFile(reader.result);
        const names = new Set(state.accounts.map((account) => account.name.trim().toLowerCase()));
        const seen = new Set();
        const invalidType = parsed.find((account) => !ACCOUNT_TYPES.includes(account.type));
        const duplicate = parsed.find((account) => {
          const key = account.name.toLowerCase();
          const found = names.has(key) || seen.has(key);
          seen.add(key);
          return found;
        });
        if (invalidType) throw new Error(`"${invalidType.name}" has an unsupported account type: ${invalidType.type}.`);
        if (duplicate) throw new Error(`"${duplicate.name}" is already present or appears more than once in the import file.`);
        if (!parsed.length) throw new Error('No account rows were found.');
        setAccounts(parsed);
        setError('');
      } catch (err) {
        setAccounts([]);
        setError(err.message || 'Could not read the account file.');
      }
    };
    reader.onerror = () => setError('Could not read the account file.');
    reader.readAsText(file);
  };

  const importAccounts = () => {
    dispatch({
      type: 'IMPORT_ACCOUNTS',
      payload: accounts.map((account) => ({ ...account, id: generateUUID(), createdAt: new Date().toISOString() })),
    });
    close();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Import Accounts</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Import accounts before importing a company transaction list that maps an Account column to account names.</Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>Use a tab-separated `.txt` or `.tsv` file. Required: `Account Name`. Optional: `Nickname`, `Type`, `Bank Address`, `Phone`, `Website`. Types: checking, savings, credit card, loan, equity.</Typography>
        <Button variant="outlined" component="label" sx={{ mb: 2 }}>
          Select Account File
          <input type="file" accept=".txt,.tsv" hidden onChange={selectFile} />
        </Button>
        {accounts.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview ({accounts.length} account(s))</Typography>
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Account Name</TableCell><TableCell>Nickname</TableCell><TableCell>Type</TableCell><TableCell>Website</TableCell></TableRow></TableHead>
                <TableBody>{accounts.map((account) => <TableRow key={account.name}><TableCell>{account.name}</TableCell><TableCell>{account.nickname}</TableCell><TableCell>{account.type}</TableCell><TableCell>{account.webAddress}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={close}>Cancel</Button><Button variant="contained" disabled={!accounts.length} onClick={importAccounts}>Import {accounts.length} Account(s)</Button></DialogActions>
    </Dialog>
  );
}
