// Keep financial-report line items deterministic and easy to scan.
export function sortProfitLossItems(items = []) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

function categoryName(name = '') {
  return String(name).replace(/^(income|expense):\s*/i, '').trim();
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

// The V2 ledger has separate income:<category> and expense:<category>
// accounts. A P&L is clearer when a category used in both directions appears
// only once, as its net result. This changes presentation only, never ledger
// postings or register transactions.
export function netProfitLossCategories(incomeItems = [], expenseItems = []) {
  const categories = new Map();
  const add = (item, field) => {
    const name = categoryName(item.name);
    const key = name.toLocaleLowerCase();
    const category = categories.get(key) || { name, income: 0, expenses: 0 };
    // Preserve the first supplied capitalization for the report label.
    if (!category.name) category.name = name;
    category[field] = roundMoney(category[field] + Number(item.amount || 0));
    categories.set(key, category);
  };
  incomeItems.forEach((item) => add(item, 'income'));
  expenseItems.forEach((item) => add(item, 'expenses'));

  const income = [];
  const expenses = [];
  for (const category of categories.values()) {
    const net = roundMoney(category.income - category.expenses);
    if (net > 0) income.push({ name: category.name, amount: net });
    // The agreed rule puts a zero net amount in Expenses, rather than hiding it.
    else expenses.push({ name: category.name, amount: Math.abs(net) });
  }
  return { income: sortProfitLossItems(income), expenses: sortProfitLossItems(expenses) };
}
