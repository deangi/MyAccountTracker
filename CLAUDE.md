# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyAccountTracker is a browser-based personal bank account management app using Google Sheets as its backend. Built with React 19, Vite 7, and Material UI 7. No traditional backend server — data persistence is entirely through Google Sheets API v4.

## Commands

- **Dev server:** `npm run dev` (runs on http://localhost:5173)
- **Build:** `npm run build` (outputs to `dist/`)
- **Lint:** `npm run lint` (ESLint with react-hooks and react-refresh plugins)
- **Preview production build:** `npm run preview`

No test framework is configured.

## Architecture

### State Management
All app state lives in a single React Context (`src/store/AppContext.jsx`) using `useReducer`. This is the central hub — it holds auth state, all entity data (accounts, transactions, payees, categories, reconciliations), UI state, and save status. Components dispatch actions to update state; a `dispatchWithDirty()` wrapper automatically marks data-changing actions for auto-save.

### View Routing
**No React Router is used for navigation** despite being a dependency. Views are switched via a `currentView` state variable in `App.jsx`. Views: `accounts`, `transactions`, `payees`, `categories`, `reconcile`, `reconcileHistory`.

### Services Layer (`src/services/`)
- **googleAuth.js** — OAuth2 implicit grant flow using Google Identity Services. Dynamically loads the GIS script. Module-level token storage.
- **googleSheets.js** — All CRUD operations against Google Sheets API. Uses batch `readAllTabs()`/`writeAllTabs()` to minimize API calls. Data model uses row 1 as headers, rows 2+ as data. Clear-then-write strategy on save.
- **autoSave.js** — 30-minute dirty-check timer. Marks state dirty on mutations, triggers save callback after inactivity. Includes `beforeunload` warning for unsaved changes.

### Google Sheets Data Model
The app creates a spreadsheet with 6 tabs: `_meta`, `accounts`, `transactions`, `payees`, `categories`, `reconciliations`. Tab names and column headers are defined in `src/config.js`.

### Component Organization (`src/components/`)
- `auth/` — Google sign-in/out button
- `layout/` — AppBar (with save status chip), Sidebar (navigation + account list), FileMenu (New/Open/Save/SaveAs)
- `accounts/` — Account list (card grid), detail view, add/edit dialog
- `transactions/` — Table (desktop) / cards (mobile), add/edit dialog, CSV import/export
- `payees/`, `categories/` — Simple list managers with add/delete/search
- `reconcile/` — 3-step reconciliation wizard, reconciliation history table

### Key Patterns
- **Dialog-based forms:** All create/edit operations use MUI Dialog components with local form state.
- **Responsive:** Desktop uses tables; mobile uses card layouts. Detected via `useMediaQuery(theme.breakpoints.down('md'))`.
- **Autocomplete with auto-creation:** Typing a new payee or category in TransactionForm automatically adds it to the global list.
- **Cleared status stored as string:** `'TRUE'`/`'FALSE'` strings (not booleans) for Google Sheets compatibility.
- **UUID generation:** `src/utils/uuid.js` wraps `crypto.randomUUID()` with a fallback polyfill.

## Environment Variables

Defined in `.env` (see `.env.example`):
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth2 client ID
- `VITE_GOOGLE_API_KEY` — Google API key (restricted to Sheets API + Picker API)

## ESLint Configuration

Uses flat config (`eslint.config.js`). The `no-unused-vars` rule ignores variables starting with uppercase or underscore (`varsIgnorePattern: '^[A-Z_]'`).
