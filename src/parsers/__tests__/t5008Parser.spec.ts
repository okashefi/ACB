import { describe, it, expect } from 'vitest';
import { parseT5008Csv } from '../t5008Parser';

describe('T5008 Parser tests', () => {
  it('should parse standard T5008 CSV format with standard Box headers correctly', () => {
    const csvContent = `
"Box 13 (Date)","Box 15 (Security)","Box 14 (Qty)","Box 21 (Proceeds)","Box 20 (Cost)","Box 22 (Currency)"
"2024-03-15","TD","100","8200.50","7500.00","CAD"
"20240420","RY","50","6100.00","5500.00","CAD"
`;

    const results = parseT5008Csv(csvContent);
    expect(results).toHaveLength(2);

    expect(results[0].date).toBe('2024-03-15');
    expect(results[0].symbol).toBe('TD');
    expect(results[0].quantity).toBe('100');
    expect(results[0].proceedsCad).toBe('8200.50');
    expect(results[0].bookValueCad).toBe('7500.00');
    expect(results[0].currency).toBe('CAD');

    expect(results[1].date).toBe('2024-04-20');
    expect(results[1].symbol).toBe('RY');
    expect(results[1].quantity).toBe('50');
    expect(results[1].proceedsCad).toBe('6100.00');
    expect(results[1].bookValueCad).toBe('5500.00');
  });

  it('should support alternative date formats (MM/DD/YYYY) and auto-detect columns without headers if needed', () => {
    const csvContent = `
Date,Symbol,Qty,Proceeds,Cost,Currency
"10/24/2024","AAPL","10","1850.00","1700.00","USD"
`;
    // USD conversion uses BoC rate helper, which defaults to 1.0 or mock rates
    const results = parseT5008Csv(csvContent);
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe('2024-10-24');
    expect(results[0].symbol).toBe('AAPL');
    expect(results[0].quantity).toBe('10');
    expect(results[0].currency).toBe('USD');
  });
});
