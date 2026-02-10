import { getAccessToken } from './googleAuth';
import { GOOGLE_API_KEY, SHEET_HEADERS, SHEET_TABS } from '../config';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsRequest(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Sheets API error: ${response.status}`);
  }
  return response.json();
}

export async function createSpreadsheet(title) {
  const sheets = Object.values(SHEET_TABS).map((tabName) => ({
    properties: { title: tabName },
  }));

  const body = {
    properties: { title },
    sheets,
  };

  const data = await sheetsRequest(SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const spreadsheetId = data.spreadsheetId;

  // Write headers to all tabs
  const headerRequests = Object.entries(SHEET_HEADERS).map(([tabName, headers]) => ({
    range: `${tabName}!A1:${columnLetter(headers.length)}1`,
    values: [headers],
  }));

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: headerRequests,
    }),
  });

  return spreadsheetId;
}

export async function readAllTabs(spreadsheetId) {
  const ranges = Object.values(SHEET_TABS).map((tab) => `${tab}!A:Z`);
  const rangeParams = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${SHEETS_BASE}/${spreadsheetId}/values:batchGet?${rangeParams}`;

  const data = await sheetsRequest(url);

  const result = {};
  data.valueRanges?.forEach((vr) => {
    const tabName = vr.range.split('!')[0].replace(/'/g, '');
    const rows = vr.values || [];
    if (rows.length === 0) {
      result[tabName] = [];
      return;
    }
    const headers = rows[0];
    result[tabName] = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });
  });

  return result;
}

export async function writeAllTabs(spreadsheetId, appData) {
  // First clear all tabs
  const clearRequests = Object.values(SHEET_TABS).map((tab) => ({
    range: `${tab}!A:Z`,
  }));

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: clearRequests.map((r) => r.range) }),
  });

  // Then write all data
  const updateData = [];

  for (const [tabName, headers] of Object.entries(SHEET_HEADERS)) {
    const records = appData[tabName] || [];
    const rows = [headers];
    records.forEach((record) => {
      rows.push(headers.map((h) => record[h] ?? ''));
    });
    updateData.push({
      range: `${tabName}!A1:${columnLetter(headers.length)}${rows.length}`,
      values: rows,
    });
  }

  await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: updateData,
    }),
  });
}

export async function getSpreadsheetTitle(spreadsheetId) {
  const data = await sheetsRequest(`${SHEETS_BASE}/${spreadsheetId}?fields=properties.title`);
  return data.properties?.title || 'Untitled';
}

// Google Picker to select a spreadsheet
export function openPicker() {
  return new Promise((resolve, reject) => {
    const token = getAccessToken();
    if (!token) {
      reject(new Error('Not authenticated'));
      return;
    }

    const loadPicker = () => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS);
      view.setMimeTypes('application/vnd.google-apps.spreadsheet');

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            resolve(data.docs[0].id);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    };

    if (window.google?.picker) {
      loadPicker();
    } else {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', loadPicker);
      };
      script.onerror = () => reject(new Error('Failed to load Google Picker'));
      document.head.appendChild(script);
    }
  });
}

function columnLetter(num) {
  let letter = '';
  let n = num;
  while (n > 0) {
    n--;
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}
