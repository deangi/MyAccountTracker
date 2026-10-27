import Papa from 'papaparse';

function readTextFile(file, parser) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try { resolve(parser(event.target.result)); }
      catch (error) { reject(error); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function parseCsv(file) {
  return readTextFile(file, parseCsvText);
}

export function parseCsvText(text) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {
    delimiter: ',',
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length) throw new Error(`Could not read CSV file: ${parsed.errors[0].message}`);
  const rows = parsed.data;
  const clean = value => String(value ?? '').trim();
  if (!rows.length || rows[0].length < 2) throw new Error('No CSV column headings were found.');
  const fields = rows[0].map(clean);
  if (fields.some(field => !field)) throw new Error('Every CSV column needs a heading.');
  if (new Set(fields.map(field => field.toLowerCase())).size !== fields.length) {
    throw new Error('CSV column headings must be unique. Rename duplicate columns before importing.');
  }
  const data = rows.slice(1).map((parts, index) => {
    if (parts.length !== fields.length) {
      throw new Error(`CSV row ${index + 2} has ${parts.length} columns; the headings have ${fields.length}. Check quotes around commas and line breaks inside fields.`);
    }
    return Object.fromEntries(fields.map((field, column) => [field, clean(parts[column])]));
  });
  if (!data.length) throw new Error('No transaction rows were found after the CSV column headings.');
  const format = fields.map(field => field.toLowerCase()).join('|') === 'date|transaction|name|memo|amount'
    ? 'us-bank-checking' : 'csv';
  return { data, meta: { fields, format } };
}

// Parse a tab-separated file, automatically detecting and skipping
// header/footer lines (supports Quicken-style register export format).
export function parseTsv(file, format = 'auto') {
  return readTextFile(file, text => parseTsvText(text, { format }));
}

// Parse quoted fields before locating the header; quotes, embedded tabs, BOMs,
// and line breaks inside exported memo fields must not change column alignment.
export function parseTsvText(text, { format = 'auto' } = {}) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {
    delimiter: '\t',
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length) throw new Error(`Could not read tab-separated file: ${parsed.errors[0].message}`);
  const rows = parsed.data;
  const clean = (value) => String(value ?? '').trim();
  let headerIndex = rows.findIndex((row) => row.length >= 2 && row.some((value) => clean(value).toLowerCase() === 'date'));
  if (headerIndex < 0) headerIndex = rows.findIndex((row) => row.length >= 2);
  if (headerIndex < 0) throw new Error('No tab-separated column headings were found.');
  const headings = rows[headerIndex].map(clean);
  // This Citi export pads columns with variable runs of tabs (including at
  // the edges). Restrict normalization to its exact five-column signature.
  const citiHeaders = ['status', 'date', 'description', 'amount', 'member name'];
  const hasCitiHeaders = headings.filter(Boolean).map((field) => field.toLowerCase()).join('|') === citiHeaders.join('|');
  const isCiti = format === 'citi-credit-card' || (format === 'auto' && hasCitiHeaders);
  if (isCiti) {
    if (headings.filter(Boolean).map((field) => field.toLowerCase()).join('|') !== citiHeaders.join('|')) {
      throw new Error('TSV (Citi Bank) requires Status, Date, Description, Amount, and Member Name columns.');
    }
    const fields = headings.filter(Boolean);
    const data = rows.slice(headerIndex + 1).map((parts, index) => {
      const values = parts.map(clean).filter(Boolean);
      if (values.length !== fields.length) {
        throw new Error(`Citi transaction row ${index + 1}: expected Status, Date, Description, Amount, and Member Name. A value is missing or there is an unexpected tab inside a value.`);
      }
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(values[1]) && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(values[1])) {
        throw new Error(`Citi transaction row ${index + 1}: the Date column could not be identified safely.`);
      }
      return Object.fromEntries(fields.map((field, column) => [field, values[column]]));
    });
    if (!data.length) throw new Error('No Citi transaction rows were found.');
    return { data, meta: { fields, format: 'citi-credit-card' } };
  }
  const nonemptyFields = headings.filter(Boolean);
  if (new Set(nonemptyFields.map((field) => field.toLowerCase())).size !== nonemptyFields.length) {
    throw new Error('Column headings must be unique. Rename duplicate columns before importing.');
  }
  const usedNames = new Set(nonemptyFields.map((field) => field.toLowerCase()));
  const fields = headings.map((heading, index) => {
    if (heading) return heading;
    let name = `Column ${index + 1} (no heading)`;
    while (usedNames.has(name.toLowerCase())) name += ' ';
    usedNames.add(name.toLowerCase());
    return name;
  });
  const data = [];
  for (const [index, parts] of rows.slice(headerIndex + 1).entries()) {
    const firstValue = parts.map(clean).find(Boolean) || '';
    // Skip known export footers, never discard transaction rows by date format.
    if (/^(total deposits|total payments|net total|total|balance)\b/i.test(firstValue) && parts.filter((value) => clean(value)).length <= 2) continue;
    if (parts.length < 2) continue;
    if (parts.length !== fields.length) {
      throw new Error(`File row ${headerIndex + index + 2} has ${parts.length} columns; the headings have ${fields.length}. Each tab separates a column. Remove tabs used only for visual alignment, and keep empty fields as consecutive tabs consistently.`);
    }
    const row = {};
    fields.forEach((name, index) => { if (name) row[name] = clean(parts[index]); });
    data.push(row);
  }
  if (!data.length) throw new Error('No transaction rows were found after the column headings.');
  return { data, meta: { fields, format: 'tsv' } };
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
