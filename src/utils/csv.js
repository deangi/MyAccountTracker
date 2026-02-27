// Parse a tab-separated file, automatically detecting and skipping
// header/footer lines (supports Quicken-style register export format).
export function parseTsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseTsvText(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Matches M/D/YYYY, MM/DD/YYYY, or YYYY-MM-DD
function looksLikeDate(str) {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str) || /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function parseTsvText(text) {
  const lines = text.split(/\r?\n/);

  // Find the column header row: a tab-separated line that contains 'Date'
  let headerLineIndex = -1;
  let headerFields = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split('\t').map((p) => p.trim());
    if (parts.includes('Date') && parts.length >= 3) {
      headerLineIndex = i;
      headerFields = parts;
      break;
    }
  }

  // Fallback: treat the first non-empty line as the header
  if (headerLineIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        headerLineIndex = i;
        headerFields = lines[i].split('\t').map((p) => p.trim());
        break;
      }
    }
  }

  if (headerLineIndex === -1) return { data: [], meta: { fields: [] } };

  const dateColIndex = headerFields.indexOf('Date');

  // Collect data rows — only those whose Date column contains a real date
  const data = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parts = line.split('\t');
    const datePart = dateColIndex >= 0 ? (parts[dateColIndex] || '').trim() : '';

    if (dateColIndex >= 0 && !looksLikeDate(datePart)) continue;

    const row = {};
    headerFields.forEach((name, idx) => {
      if (name) row[name] = (parts[idx] || '').trim();
    });
    data.push(row);
  }

  return {
    data,
    meta: { fields: headerFields.filter((f) => f) },
  };
}

// Generate a tab-separated file with optional title/dateRange header
// and payment/deposit totals footer.
export function generateTsv(rows, { title, dateRange } = {}) {
  if (!rows.length) return '';
  const fields = Object.keys(rows[0]);
  const lines = [];

  if (title) {
    lines.push(title);
    lines.push('');
  }
  if (dateRange) {
    lines.push(dateRange);
    lines.push('');
  }

  lines.push(fields.join('\t'));
  rows.forEach((row) => {
    lines.push(fields.map((f) => row[f] ?? '').join('\t'));
  });

  // Append summary footer if Payment/Deposit columns are present
  const hasPayment = fields.includes('Payment');
  const hasDeposit = fields.includes('Deposit');
  if (hasPayment || hasDeposit) {
    lines.push('');
    if (hasDeposit) {
      const total = rows.reduce((s, r) => s + (parseFloat(r.Deposit) || 0), 0);
      lines.push(`Total Deposits\t${total.toFixed(2)}`);
    }
    if (hasPayment) {
      const total = rows.reduce((s, r) => s + (parseFloat(r.Payment) || 0), 0);
      lines.push(`Total Payments\t${total.toFixed(2)}`);
    }
    if (hasDeposit && hasPayment) {
      const net = rows.reduce(
        (s, r) => s + (parseFloat(r.Deposit) || 0) - (parseFloat(r.Payment) || 0),
        0,
      );
      lines.push(`Net Total\t${net.toFixed(2)}`);
    }
  }

  return lines.join('\r\n');
}

export function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
