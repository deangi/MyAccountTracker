# MyAccountTracker

A browser-based bank account management app that uses Google Sheets as the backend data store. Supports multiple checking/savings accounts, transaction tracking, reconciliation, and CSV import/export.

## Features

- **Multiple Accounts**: Manage checking and savings accounts
- **Transaction Tracking**: Add, edit, delete transactions with running balance
- **Reconciliation**: Step-by-step wizard to reconcile against bank statements
- **CSV Import/Export**: Import transactions from CSV or export to CSV
- **Google Sheets Backend**: All data stored in your own Google Sheets
- **Google OAuth**: Secure authentication via Google
- **Responsive Design**: Works on desktop and mobile browsers
- **Auto-Save**: Automatic saving every 30 minutes with unsaved changes indicator

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version, v18+)
- A Google Cloud project with OAuth credentials

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "MyAccountTracker")
3. Enable the **Google Sheets API** and **Google Picker API**
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` (dev) and your production URL
   - Authorized redirect URIs: same as origins
5. Copy the **Client ID**
6. Create an **API Key** (restrict to Sheets API + Picker API)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd MyAccountTracker

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env and add your Google Client ID and API Key
```

## Development

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Production Build

```bash
npm run build
```

The `dist/` folder contains the static files to deploy.

## Deployment (Apache on Linux)

1. Build the project: `npm run build`
2. Copy the `dist/` folder contents to your Apache document root
3. Add this to your Apache config or `.htaccess` for SPA routing:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

4. Make sure your production URL is added to the Google Cloud Console authorized origins.

## Google Sheets Data Model

The app creates a Google Spreadsheet with these tabs:

| Tab | Purpose |
|-----|---------|
| `_meta` | File metadata (title, owner, version) |
| `accounts` | Bank account records |
| `transactions` | Transaction records |
| `payees` | Payee list for autocomplete |
| `categories` | Category list for autocomplete |
| `reconciliations` | Reconciliation history |

## Tech Stack

- React 18 (Vite)
- Material UI (MUI)
- Google Sheets API v4
- Google OAuth 2.0 (Google Identity Services)
- PapaParse (CSV parsing)
