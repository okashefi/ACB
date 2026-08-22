import { Decimal } from 'decimal.js';

// Configure high precision for tax calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(val: number | string | Decimal | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  return new Decimal(val);
}

export function toMoney(val: number | string | Decimal): string {
  return d(val).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

export function toShares(val: number | string | Decimal): string {
  return d(val).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function toRate(val: number | string | Decimal): string {
  return d(val).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function formatCad(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '$0.00 CAD';
  const num = toMoney(val);
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-$${absFormatted} CAD` : `$${absFormatted} CAD`;
}

export function formatShares(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '0';
  const num = toShares(val);
  return num.toLocaleString('en-CA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatRate(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '1.0000';
  return d(val).toDecimalPlaces(4).toFixed(4);
}
