import { Decimal } from 'decimal.js';

// Configure high precision for tax calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(val: number | string | Decimal | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  return new Decimal(val);
}

export function toMoney(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '0.00';
  return d(val).toFixed(2);
}

export function toShares(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '0';
  return d(val).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function toRate(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '1.000000';
  return d(val).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function formatCad(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '$0.00 CAD';
  const dec = d(val);
  const isNegative = dec.isNegative();
  const num = dec.abs().toNumber();
  const absFormatted = num.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-$${absFormatted} CAD` : `$${absFormatted} CAD`;
}

export function formatShares(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '0';
  const num = d(val).toNumber();
  return num.toLocaleString('en-CA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatRate(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '1.0000';
  return d(val).toDecimalPlaces(4).toFixed(4);
}

