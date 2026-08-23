import { describe, it, expect } from 'vitest';
import { classifyBrokerCorporateAction, calculateCorporateAction } from '../corporateActions';

describe('Corporate Actions engine tests', () => {
  describe('classifyBrokerCorporateAction', () => {
    it('should classify split descriptions to CONTINUITY_SPLIT', () => {
      const cls = classifyBrokerCorporateAction('Forward stock split 3 for 1', false, true);
      expect(cls.suggestedTreatment).toBe('CONTINUITY_SPLIT');
      expect(cls.statutoryBasis).toBe('ITA s. 47(1) Stock Split Continuity');
    });

    it('should classify name/ticker change to CONTINUITY_TICKER_CHANGE', () => {
      const cls = classifyBrokerCorporateAction('SYMBOL CHANGE FROM RY TO RY.TO', false, false);
      expect(cls.suggestedTreatment).toBe('CONTINUITY_TICKER_CHANGE');
    });

    it('should classify spin-offs differently depending on origin (Canadian vs foreign)', () => {
      const cadCls = classifyBrokerCorporateAction('SPIN-OFF OF NEWCO', false, true, true);
      expect(cadCls.suggestedTreatment).toBe('S86_REORGANIZATION');

      const foreignCls = classifyBrokerCorporateAction('SPIN-OFF OF NEWCO', false, true, false);
      expect(foreignCls.suggestedTreatment).toBe('INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND');
    });

    it('should classify mixed takeover with cash and shares correctly', () => {
      const cadCls = classifyBrokerCorporateAction('MERGER OF TARGET', true, true, true);
      expect(cadCls.suggestedTreatment).toBe('MIXED_CAPITAL_BOOT_ROLLOVER');

      const foreignCls = classifyBrokerCorporateAction('MERGER OF TARGET', true, true, false);
      expect(foreignCls.suggestedTreatment).toBe('MIXED_CAPITAL_BOOT_TAXABLE');
    });
  });

  describe('calculateCorporateAction', () => {
    it('should calculate STOCK_SPLIT correctly adjusting units but preserving total cost base', () => {
      const res = calculateCorporateAction(
        {
          treatment: 'CONTINUITY_SPLIT',
          oldSecurityId: 'SEC_A',
          ratio: 3,
          statutoryBasis: 'ITA s. 47(1) Split Continuity',
          brokerDescription: 'Forward Stock Split 3:1',
        },
        100,
        3000
      );
      expect(res.newSharesQty).toBe('300');
      expect(res.newSharesTotalAcbCad).toBe('3000.00');
      expect(res.newSharesAcbPerUnitCad).toBe('10.00');
    });

    it('should calculate FULL_CASH_DISPOSITION with gain or loss', () => {
      const res = calculateCorporateAction(
        {
          treatment: 'FULL_CASH_DISPOSITION',
          oldSecurityId: 'SEC_A',
          totalCashReceived: '3500',
          statutoryBasis: 'ITA s. 40(1)(a)',
          brokerDescription: 'All-Cash Takeover',
        },
        100,
        3000
      );
      expect(res.realizedCapitalGainCad).toBe('500.00');
      expect(res.realizedCapitalLossCad).toBe('0.00');
      expect(res.oldSharesDisposedQty).toBe('100');
    });

    it('should calculate S85_1_ROLLOVER with correct rollover basis', () => {
      const res = calculateCorporateAction(
        {
          treatment: 'S85_1_ROLLOVER',
          oldSecurityId: 'SEC_A',
          newSharesReceived: '50',
          statutoryBasis: 'ITA s. 85.1 Rollover',
          brokerDescription: 'Tax-Free Rollover',
        },
        100,
        3000
      );
      expect(res.newSharesQty).toBe('50');
      expect(res.newSharesTotalAcbCad).toBe('3000.00');
      expect(res.newSharesAcbPerUnitCad).toBe('60.00');
    });

    it('should calculate S86_1_ELIGIBLE_SPINOFF by apportioning relative FMVs', () => {
      const res = calculateCorporateAction(
        {
          treatment: 'S86_1_ELIGIBLE_SPINOFF',
          oldSecurityId: 'SEC_PARENT',
          newSharesReceived: '10',
          newShareFmvPerShare: '100', // SpinCo FMV = 10 * 100 = $1,000
          targetShareFmvAtEffectiveDate: '40', // Parent FMV = 100 * 40 = $4,000
          ratio: 1,
          statutoryBasis: 'ITA s. 86.1',
          brokerDescription: 'Eligible Spin-off',
        },
        100,
        5000 // Parent total cost base = $5,000
      );

      // Total FMV = 1000 + 4000 = 5000. Spinco is 20%, Parent is 80%.
      // Spinco allocated ACB = 5000 * 0.20 = 1000
      // Parent allocated ACB = 5000 * 0.80 = 4000
      expect(res.newSharesTotalAcbCad).toBe('1000.00');
      expect(res.parentSharesRemainingAcbCad).toBe('4000.00');
    });

    it('should calculate S50_1_BAD_DEBT_ELECTION for worthless securities', () => {
      const res = calculateCorporateAction(
        {
          treatment: 'S50_1_BAD_DEBT_ELECTION',
          oldSecurityId: 'SEC_XYZ',
          statutoryBasis: 'ITA s. 50(1)',
          brokerDescription: 'Worthless Securities Election',
        },
        200,
        4500
      );
      expect(res.realizedCapitalLossCad).toBe('4500.00');
      expect(res.oldSharesDisposedQty).toBe('200');
    });
  });
});
