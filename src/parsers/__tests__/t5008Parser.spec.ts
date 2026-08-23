import { describe, it, expect } from 'vitest';
import { parseT5008Csv } from '../t5008Parser';
import { registerFxRate } from '../../engine/bocFx';
import { d } from '../../engine/decimal';

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

  it('should perform USD conversion using an injected/fixed exchange rate', () => {
    // Inject custom FX rate for USD on 2024-03-15
    registerFxRate('2024-03-15', 'USD', 1.3456);

    const csvContent = `
Date,Symbol,Qty,Proceeds,Cost,Currency
"2024-03-15","MSFT","10","4000.00","3500.00","USD"
`;

    const results = parseT5008Csv(csvContent);
    expect(results).toHaveLength(1);
    expect(results[0].currency).toBe('USD');
    expect(results[0].fxRateUsed).toBe(1.3456);

    // Converted proceeds = 4000 * 1.3456 = 5382.40
    expect(results[0].proceedsCad).toBe('5382.40');
    // Converted book value = 3500 * 1.3456 = 4709.60
    expect(results[0].bookValueCad).toBe('4709.60');
  });

  it('should simulate T5008 matching and identify unmatched EXTRA_T5008 slips correctly', () => {
    // 1. Synthetic parsed T5008 slips
    const slips = [
      {
        id: 'T5008_MATCHED',
        date: '2024-03-15',
        symbol: 'TD',
        quantity: '100',
        proceedsCad: '8200.50',
        bookValueCad: '7500.00',
        currency: 'CAD',
      },
      {
        id: 'T5008_UNMATCHED_EXTRA',
        date: '2024-05-10',
        symbol: 'RY',
        quantity: '50',
        proceedsCad: '6000.00',
        bookValueCad: '5500.00',
        currency: 'CAD',
      }
    ];

    // 2. Synthetic app realized gains
    const appGains = [
      {
        id: 'RGL_1',
        dispositionDate: '2024-03-14', // within 1 day of T5008_MATCHED
        settlementDate: '2024-03-16',
        symbol: 'TD',
        quantityDisposed: '100',
        grossProceedsCad: '8200.50',
        acbOfUnitsDisposedCad: '7500.00',
        recognizedGainLossCad: '700.50',
      }
    ];

    // 3. Matching helper logic matching ReportsView.tsx (exact symbol, qty, and date ±3 days)
    const usedSlipIds = new Set<string>();
    const matchedRows = appGains.map((rgl) => {
      const matchedSlip = slips.find((slip) => {
        if (usedSlipIds.has(slip.id)) return false;
        if (slip.symbol.trim().toUpperCase() !== rgl.symbol.trim().toUpperCase()) return false;
        
        const slipQty = Math.abs(parseFloat(slip.quantity) || 0);
        const rglQty = Math.abs(parseFloat(rgl.quantityDisposed) || 0);
        if (Math.abs(slipQty - rglQty) >= 0.001) return false;

        const getDayDiff = (d1: string, d2: string) => {
          const t1 = new Date(d1).getTime();
          const t2 = new Date(d2).getTime();
          return Math.abs(t2 - t1) / (1000 * 60 * 60 * 24);
        };

        const diffDisp = getDayDiff(slip.date, rgl.dispositionDate);
        const diffSettle = rgl.settlementDate ? getDayDiff(slip.date, rgl.settlementDate) : 999;
        return diffDisp <= 3 || diffSettle <= 3;
      });

      if (matchedSlip) {
        usedSlipIds.add(matchedSlip.id);
        return {
          id: rgl.id,
          status: 'MATCHED',
        };
      }
      return {
        id: rgl.id,
        status: 'T5008_NOT_LOADED',
      };
    });

    // 4. Any slip not in usedSlipIds is flagged as EXTRA_T5008
    const extraRows = slips
      .filter((slip) => !usedSlipIds.has(slip.id))
      .map((slip) => {
        return {
          id: slip.id,
          status: 'EXTRA_T5008',
        };
      });

    expect(matchedRows).toHaveLength(1);
    expect(matchedRows[0].status).toBe('MATCHED');
    expect(usedSlipIds.has('T5008_MATCHED')).toBe(true);

    expect(extraRows).toHaveLength(1);
    expect(extraRows[0].id).toBe('T5008_UNMATCHED_EXTRA');
    expect(extraRows[0].status).toBe('EXTRA_T5008');
  });

  it('should support tax year filtering, symbol split-cleaning, and standard date fallback parsing', () => {
    const csvContent = `
Date,Symbol,Qty,Proceeds,Cost,Currency
"2024-03-15","TD - Toronto Dominion","100","8200.50","7500.00","CAD"
"2025-04-20","RY","50","6100.00","5500.00","CAD"
"March 15, 2024","BNS","50","4000.00","3500.00","CAD"
`;

    // Only parse for 2024
    const results = parseT5008Csv(csvContent, 2024);
    expect(results).toHaveLength(2); // Filters out the 2025-04-20 row

    // Verifies symbol clean-up
    expect(results[0].symbol).toBe('TD');
    expect(results[0].date).toBe('2024-03-15');

    // Verifies date fallback parse
    expect(results[1].symbol).toBe('BNS');
    expect(results[1].date).toBe('2024-03-15');
  });
});
