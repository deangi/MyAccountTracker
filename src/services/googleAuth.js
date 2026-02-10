import { GOOGLE_CLIENT_ID, SCOPES } from '../config';

let tokenClient = null;
let accessToken = null;
let onAuthChange = null;

export function getAccessToken() {
  return accessToken;
}

export function setAuthChangeCallback(callback) {
  onAuthChange = callback;
}

export function initAuth() {
  return new Promise((resolve) => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env');
      resolve(false);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            console.error('Auth error:', response.error);
            accessToken = null;
            onAuthChange?.(false);
            return;
          }
          accessToken = response.access_token;
          onAuthChange?.(true);
        },
      });
      resolve(true);
    };
    script.onerror = () => {
      console.error('Failed to load Google Identity Services');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

export function signIn() {
  if (!tokenClient) {
    console.error('Auth not initialized');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      onAuthChange?.(false);
    });
  }
}

export function isSignedIn() {
  return !!accessToken;
}
