import { useState } from 'react';
import {
  Box, Typography, Button, List, ListItem, ListItemText,
  IconButton, TextField, Paper, InputAdornment,
} from '@mui/material';
import { Add, Delete, Search } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';

export default function CategoryManager() {
  const { state, dispatch, generateUUID } = useApp();
  const [newCategory, setNewCategory] = useState('');
  const [search, setSearch] = useState('');

  const handleAdd = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: 'ADD_CATEGORY', payload: { id: generateUUID(), name } });
    setNewCategory('');
  };

  const handleDelete = (id) => {
    dispatch({ type: 'DELETE_CATEGORY', payload: id });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const filtered = state.categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Categories</Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          size="small" label="New Category" value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ flexGrow: 1 }}
        />
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>Add</Button>
      </Box>

      <TextField
        size="small" placeholder="Search categories..." fullWidth sx={{ mb: 2 }}
        value={search} onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
      />

      <Paper variant="outlined">
        <List dense>
          {filtered.map((category) => (
            <ListItem
              key={category.id}
              secondaryAction={
                <IconButton edge="end" size="small" onClick={() => handleDelete(category.id)}>
                  <Delete fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText primary={category.name} />
            </ListItem>
          ))}
          {filtered.length === 0 && (
            <ListItem>
              <ListItemText secondary="No categories found" sx={{ textAlign: 'center' }} />
            </ListItem>
          )}
        </List>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {state.categories.length} categor{state.categories.length !== 1 ? 'ies' : 'y'} total
      </Typography>
    </Box>
  );
}
