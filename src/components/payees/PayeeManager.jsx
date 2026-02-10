import { useState } from 'react';
import {
  Box, Typography, Button, List, ListItem, ListItemText,
  IconButton, TextField, Paper, InputAdornment,
} from '@mui/material';
import { Add, Delete, Search } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';

export default function PayeeManager() {
  const { state, dispatch, generateUUID } = useApp();
  const [newPayee, setNewPayee] = useState('');
  const [search, setSearch] = useState('');

  const handleAdd = () => {
    const name = newPayee.trim();
    if (!name) return;
    if (state.payees.find((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: 'ADD_PAYEE', payload: { id: generateUUID(), name } });
    setNewPayee('');
  };

  const handleDelete = (id) => {
    dispatch({ type: 'DELETE_PAYEE', payload: id });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const filtered = state.payees.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Payees</Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          size="small" label="New Payee" value={newPayee}
          onChange={(e) => setNewPayee(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ flexGrow: 1 }}
        />
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>Add</Button>
      </Box>

      <TextField
        size="small" placeholder="Search payees..." fullWidth sx={{ mb: 2 }}
        value={search} onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
      />

      <Paper variant="outlined">
        <List dense>
          {filtered.map((payee) => (
            <ListItem
              key={payee.id}
              secondaryAction={
                <IconButton edge="end" size="small" onClick={() => handleDelete(payee.id)}>
                  <Delete fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText primary={payee.name} />
            </ListItem>
          ))}
          {filtered.length === 0 && (
            <ListItem>
              <ListItemText secondary="No payees found" sx={{ textAlign: 'center' }} />
            </ListItem>
          )}
        </List>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {state.payees.length} payee{state.payees.length !== 1 ? 's' : ''} total
      </Typography>
    </Box>
  );
}
