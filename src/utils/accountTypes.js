export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', netWorthClass: 'asset' },
  { value: 'savings', label: 'Savings', netWorthClass: 'asset' },
  { value: 'retirement', label: 'Retirement', netWorthClass: 'asset' },
  { value: 'property', label: 'Property', netWorthClass: 'asset' },
  { value: 'vehicle', label: 'Vehicle', netWorthClass: 'asset' },
  { value: 'other asset', label: 'Other asset', netWorthClass: 'asset' },
  { value: 'credit card', label: 'Credit card', netWorthClass: 'liability' },
  { value: 'loan', label: 'Loan', netWorthClass: 'liability' },
  { value: 'mortgage', label: 'Mortgage', netWorthClass: 'liability' },
  { value: 'other liability', label: 'Other liability', netWorthClass: 'liability' },
  { value: 'equity', label: 'Equity', netWorthClass: 'asset' },
];

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map(type => type.value);

export function netWorthClassFor(type = '') {
  const normalized = String(type).trim().toLowerCase();
  return ACCOUNT_TYPES.find(option => option.value === normalized)?.netWorthClass
    || (['credit-card', 'liability'].includes(normalized) ? 'liability' : 'asset');
}
