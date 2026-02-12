import { Button } from '@mui/material';
import { Login, Logout } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { signIn, signOut } from '../../services/googleAuth';
import { getAutoSaveStatus } from '../../services/autoSave';

export default function LoginButton() {
  const { state, save } = useApp();

  const handleSignOut = async () => {
    if (getAutoSaveStatus().hasUnsavedChanges) {
      try {
        await save();
      } catch (err) {
        console.error('Save before sign-out failed:', err);
      }
    }
    signOut();
  };

  if (state.isAuthenticated) {
    return (
      <Button color="inherit" startIcon={<Logout />} onClick={handleSignOut}>
        Sign Out
      </Button>
    );
  }

  return (
    <Button color="inherit" startIcon={<Login />} onClick={signIn}>
      Sign In with Google
    </Button>
  );
}
