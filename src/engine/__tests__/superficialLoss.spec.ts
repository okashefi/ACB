import { describe, it, expect } from 'vitest';
import {
  isWithinSuperficialLossWindow,
  isProvisionalWindow,
  evaluateSuperficialLoss
} from '../superficialLoss';
import { createMockAccount, createMockTransaction } from '../../../test/helpers';
import { d } from '../decimal';
import { Account } from '../../types/tax';

describe('Superficial Loss Engine Tests', () => {
  const accountsMap = new Map<string, Account>();
  const taxableAcct = createMockAccount({ id: 'ACCT_TAXABLE', accountType: 'taxable' });
  const tfsaAcct = createMockAccount({ id: 'ACCT_TFSA', accountType: 'tfsa' });
  accountsMap.set(taxableAcct.id, taxableAcct);
  accountsMap.set(tfsaAcct.id, tfsaAcct);

  describe('isWithinSuperficialLossWindow', () => {
    it('should correctly identify dates within 30 days before/after', () => {
      expect(isWithinSuperficialLossWindow('2026-03-15', '2026-03-15')).toBe(true);
      expect(isWithinSuperficialLossWindow('2026-03-15', '2026-02-12')).toBe(false); // 31 days
      expect(isWithinSuperficialLossWindow('2026-03-15', '2026-02-13')).toBe(true); // 30 days
      expect(isWithinSuperficialLossWindow('2026-03-15', '2026-04-14')).toBe(true); // 30 days
      expect(isWithinSuperficialLossWindow('2026-03-15', '2026-04-15')).toBe(false); // 31 days
    });
  });

  describe('isProvisionalWindow', () => {
    it('should identify provisional if elapsed is less than 30 days from referenceDate', () => {
      // Reference date is 2026-08-22
      expect(isProvisionalWindow('2026-08-10', '2026-08-22')).toBe(true); // 12 days
      expect(isProvisionalWindow('2026-07-15', '2026-08-22')).toBe(false); // 38 days
    });
  });

  describe('evaluateSuperficialLoss', () => {
    it('should return no superficial loss if disposition is zero or positive gain', () => {
      const tx = createMockTransaction({ id: 'TX_1', date: '2026-03-15', securityId: 'SEC_ABC' });
      const result = evaluateSuperficialLoss(tx, 0, 100, [], accountsMap);
      expect(result.isSuperficial).toBe(false);
      expect(result.rawLossCad).toBe('0.00');
    });

    it('should return no superficial loss if no identical property was acquired', () => {
      const tx = createMockTransaction({ id: 'TX_1', date: '2026-03-15', securityId: 'SEC_ABC', transactionType: 'SELL' });
      // Buy outside window
      const buyTx = createMockTransaction({ id: 'TX_BUY', date: '2026-01-10', securityId: 'SEC_ABC', transactionType: 'BUY', quantity: '100' });

      const result = evaluateSuperficialLoss(tx, '500.00', '100', [tx, buyTx], accountsMap, '0', '2026-08-22');
      expect(result.isSuperficial).toBe(false);
      expect(result.deniedLossCad).toBe('0.00');
      expect(result.allowedLossCad).toBe('500.00');
    });

    it('should fully deny loss if same qty is replaced in window and still held', () => {
      const sellTx = createMockTransaction({ id: 'TX_SELL', date: '2026-03-15', securityId: 'SEC_ABC', transactionType: 'SELL', quantity: '100' });
      const buyTx = createMockTransaction({ id: 'TX_BUY', date: '2026-03-20', securityId: 'SEC_ABC', transactionType: 'BUY', quantity: '100', accountId: 'ACCT_TAXABLE' });

      const result = evaluateSuperficialLoss(sellTx, '1000.00', '100', [sellTx, buyTx], accountsMap, '100', '2026-08-22');
      expect(result.isSuperficial).toBe(true);
      expect(result.deniedLossCad).toBe('1000.00');
      expect(result.allowedLossCad).toBe('0.00');
      expect(result.isPermanentlyDeniedInRegistered).toBe(false);
      expect(result.replacementTransactionId).toBe('TX_BUY');
      expect(result.status).toBe('final');
    });

    it('should pro-rata deny loss if only some shares are replaced in window', () => {
      const sellTx = createMockTransaction({ id: 'TX_SELL', date: '2026-03-15', securityId: 'SEC_ABC', transactionType: 'SELL', quantity: '100' });
      const buyTx = createMockTransaction({ id: 'TX_BUY', date: '2026-03-20', securityId: 'SEC_ABC', transactionType: 'BUY', quantity: '40', accountId: 'ACCT_TAXABLE' });

      const result = evaluateSuperficialLoss(sellTx, '1000.00', '100', [sellTx, buyTx], accountsMap, '40', '2026-08-22');
      expect(result.isSuperficial).toBe(true);
      // min(100, 40) / 100 = 40% denied.
      expect(result.deniedLossCad).toBe('400.00');
      expect(result.allowedLossCad).toBe('600.00');
      expect(result.isPermanentlyDeniedInRegistered).toBe(false);
    });

    it('should permanently deny loss if replaced inside a registered account (TFSA)', () => {
      const sellTx = createMockTransaction({ id: 'TX_SELL', date: '2026-03-15', securityId: 'SEC_ABC', transactionType: 'SELL', quantity: '100' });
      const buyTx = createMockTransaction({ id: 'TX_BUY', date: '2026-03-20', securityId: 'SEC_ABC', transactionType: 'BUY', quantity: '100', accountId: 'ACCT_TFSA' });

      const result = evaluateSuperficialLoss(sellTx, '1000.00', '100', [sellTx, buyTx], accountsMap, '100', '2026-08-22');
      expect(result.isSuperficial).toBe(true);
      expect(result.deniedLossCad).toBe('1000.00');
      expect(result.allowedLossCad).toBe('0.00');
      expect(result.isPermanentlyDeniedInRegistered).toBe(true);
      expect(result.explanation).toContain('PERMANENTLY DENIED with NO ACB adjustment');
    });

    it('should support alternative acquisition types (like DRIP) and flag provisional window status', () => {
      const sellTx = createMockTransaction({ id: 'TX_SELL2', date: '2026-08-15', securityId: 'SEC_XYZ', transactionType: 'SELL', quantity: '50' });
      const dripTx = createMockTransaction({ id: 'TX_DRIP', date: '2026-08-16', securityId: 'SEC_XYZ', transactionType: 'DIVIDEND_REINVESTED', quantity: '50', accountId: 'ACCT_TAXABLE' });

      // Using referenceDate 2026-08-22 so that 2026-08-15 is within the 30-day provisional window (which expects 30 days of look-forward)
      const result = evaluateSuperficialLoss(sellTx, '500.00', '50', [sellTx, dripTx], accountsMap, '50', '2026-08-22');
      expect(result.isSuperficial).toBe(true);
      expect(result.deniedLossCad).toBe('500.00');
      expect(result.status).toBe('provisional');
    });
  });
});
