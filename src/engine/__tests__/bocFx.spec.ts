import { describe, it, expect } from 'vitest';
import { getBankOfCanadaRate, registerFxRate, convertToCad } from '../bocFx';

describe('bocFx tests', () => {
  it('should return 1.0 for CAD-to-CAD exchange', () => {
    expect(getBankOfCanadaRate('2026-01-02', 'CAD')).toBe(1.0);
    expect(convertToCad(100, 'CAD', '2026-01-02').fxRate).toBe(1.0);
  });

  it('should return correct rate from historical table if exists', () => {
    // 2026-01-02 USD rate is 1.3850
    expect(getBankOfCanadaRate('2026-01-02', 'USD')).toBe(1.3850);
  });

  it('should perform nearest prior known business day lookback for missing dates', () => {
    // 2026-01-03 doesn't exist, should look back to 2026-01-02 which has 1.3850
    expect(getBankOfCanadaRate('2026-01-03', 'USD')).toBe(1.3850);
  });

  it('should allow registering a custom/manual FX rate', () => {
    registerFxRate('2026-08-15', 'EUR', 1.55);
    expect(getBankOfCanadaRate('2026-08-15', 'EUR')).toBe(1.55);
  });

  it('should prefer explicit rate over historical lookup when provided', () => {
    const res = convertToCad(100, 'USD', '2026-01-15', 1.45);
    expect(res.fxRate).toBe(1.45);
    expect(res.fxSource).toBe('IBKR_ACTUAL');
    expect(res.amountCad).toBe('145.00');
  });
});
