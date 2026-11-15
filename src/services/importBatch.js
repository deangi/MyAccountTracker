const sameRow = (a, b, columns) => columns.every((field) => String(a?.[field] ?? '') === String(b?.[field] ?? ''));

// Plan all rows in one register from a single snapshot. A retry can safely
// skip rows already written by this operation and append only the remainder.
export function planImportRows(sheet, changes, operationId, fields) {
  if (sheet.fields.join('|') !== fields.join('|')) throw new Error('Unexpected transaction columns; sync stopped');
  const byId = new Map();
  for (const row of sheet.rows) {
    if (!row.data.id) continue;
    if (byId.has(row.data.id)) throw new Error(`Duplicate ${row.data.id} in transaction register; sync stopped`);
    byId.set(row.data.id, row);
  }
  const writes = [];
  const locators = [];
  let nextRow = sheet.rows.length + 2;
  for (const change of changes) {
    const existing = byId.get(change.id);
    if (existing?.data.lastOperationId === operationId) {
      if (!sameRow(existing.data, change.after, fields.filter((field) => !['rowVersion', 'lastOperationId', 'deleted', 'deletedAt', 'deletedByOperationId'].includes(field)))) {
        throw new Error(`Previously imported row ${change.id} changed; sync stopped`);
      }
      locators.push({ id: change.id, rowNumber: existing.number, rowVersion: existing.data.rowVersion || '' });
      continue;
    }
    if (existing) throw new Error(`Row ${change.id} already exists in transaction register; sync stopped`);
    if (change.before || !change.after) throw new Error(`Import row ${change.id} is not an addition; sync stopped`);
    const rowNumber = nextRow++;
    const desired = { ...change.after, deleted: 'FALSE', rowVersion: '1', lastOperationId: operationId };
    writes.push({ id: change.id, rowNumber, desired });
    locators.push({ id: change.id, rowNumber, rowVersion: '1' });
    byId.set(change.id, { number: rowNumber, data: desired });
  }
  return { writes, locators };
}
