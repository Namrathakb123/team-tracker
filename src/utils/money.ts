// Money is in Indian rupees, grouped the Indian way: 5,00,000 (five lakh), 1,00,00,000 (one crore).
export function formatRupees(value: unknown): string {
  const amount = Number(value);
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
