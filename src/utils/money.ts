// Money is in US Dollars ($), formatted with standard grouping (e.g. $500,000, $1,000,000).
export function formatCurrency(value: unknown): string {
  const amount = Number(value);
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export const formatDollars = formatCurrency;
export const formatRupees = formatCurrency;
