export function formatCurrency(amount) {
  if (amount == null || amount === '') return '';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  // Parse YYYY-MM-DD directly to avoid UTC→local timezone shift.
  // new Date("YYYY-MM-DD") treats the string as UTC midnight, which rolls
  // back one day for users in negative-offset timezones (e.g. US).
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[2]}/${m[3]}/${m[1]}`;
  }
  // Fallback for any other format
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export function toISODate(dateStr) {
  if (!dateStr) return '';
  // Already YYYY-MM-DD — return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // For full ISO strings (e.g. new Date().toISOString()), extract the date part
  // using local time to avoid the UTC shift.
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function parseCurrencyInput(value) {
  if (value == null || value === '') return '';
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? '' : num;
}
