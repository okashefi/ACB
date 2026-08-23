import { Decimal } from 'decimal.js';

// Configure high precision for tax calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(val: number | string | Decimal | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return new Decimal(0);
    return new Decimal(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity') {
      return new Decimal(0);
    }
    // Remove commas, currency symbols, and spaces
    const cleaned = trimmed.replace(/[$, ]/g, '');
    try {
      const dec = new Decimal(cleaned);
      if (dec.isNaN() || !dec.isFinite()) return new Decimal(0);
      return dec;
    } catch {
      return new Decimal(0);
    }
  }
  if (val instanceof Decimal) {
    if (val.isNaN() || !val.isFinite()) return new Decimal(0);
    return val;
  }
  try {
    const dec = new Decimal(val as any);
    if (dec.isNaN() || !dec.isFinite()) return new Decimal(0);
    return dec;
  } catch {
    return new Decimal(0);
  }
}

export function toMoney(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '0.00';
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite()) return '0.00';
  return dec.toFixed(2);
}

export function toShares(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '0';
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite()) return '0';
  return dec.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function toRate(val: number | string | Decimal | null | undefined): string {
  if (val === null || val === undefined) return '1.000000';
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite() || dec.isZero()) return '1.000000';
  return dec.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

export function formatCad(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '$0.00 CAD';
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite()) return '$0.00 CAD';
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
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite()) return '0';
  const num = dec.toNumber();
  return num.toLocaleString('en-CA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatRate(val: number | string | Decimal | undefined | null): string {
  if (val === null || val === undefined) return '1.0000';
  const dec = d(val);
  if (dec.isNaN() || !dec.isFinite()) return '1.0000';
  return dec.toDecimalPlaces(4).toFixed(4);
}

