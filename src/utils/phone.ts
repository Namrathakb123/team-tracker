// Phone numbers for leads.

// Numbers pasted from WhatsApp or a phone's contacts often carry invisible direction marks and special dashes or
// spaces. This returns the number written with plain characters, without spaces at the ends.
export function cleanPhone(value: unknown): string {
  return String(value ?? '')
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ]/g, ' ')
    .trim();
}

// Just the digits of a number.
export function phoneDigits(value: unknown): string {
  return cleanPhone(value).replace(/[^0-9]/g, '');
}

// What's wrong with a typed number, or null if it's fine. A number is optional, so an empty one is fine.
export function phoneProblem(value: unknown): string | null {
  const text = cleanPhone(value);
  if (!text) return null;
  if (!/^[+]?[0-9(). -]+$/.test(text)) return 'Use only digits, spaces, dashes and brackets, with + only at the start.';
  const count = phoneDigits(text).length;
  if (count < 7 || count > 15) return 'A phone number has 7 to 15 digits.';
  return null;
}

// Whether two numbers are the same number. When both have at least 10 digits, the last 10 are compared, so
// +91 98765 43210, 098765 43210 and 98765-43210 are one number.
export function samePhone(a: unknown, b: unknown): boolean {
  const x = phoneDigits(a), y = phoneDigits(b);
  if (x.length < 7 || y.length < 7) return false;
  return x.length >= 10 && y.length >= 10 ? x.slice(-10) === y.slice(-10) : x === y;
}

// A link that calls the number when tapped on a phone.
export function phoneLink(value: unknown): string {
  const text = cleanPhone(value);
  return `tel:${text.startsWith('+') ? '+' : ''}${phoneDigits(text)}`;
}
