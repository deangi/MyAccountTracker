import { Button } from '@mui/material';
import { Login, Logout } from '@mui/icons-material';
import { useApp } from '../../store/AppContext';
import { signIn, signOut } from '../../services/googleAuth';

export default function LoginButton() {
  const { state } = useApp();

  if (state.isAuthenticated) {
    return (
      <Button color="inherit" startIcon={<Logout />} onClick={signOut}>
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
