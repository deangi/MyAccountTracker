// Keep financial-report line items deterministic and easy to scan.
export function sortProfitLossItems(items = []) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}
