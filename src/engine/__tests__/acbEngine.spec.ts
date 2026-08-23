import { describe, it, expect } from 'vitest';
import { runAcbEngine } from '../acbEngine';
import { createMockAccount, createMockSecurity, createMockTransaction } from '../../../test/helpers';
import { d } from '../decimal';

describe('Canadian ACB Regression Suite - acbEngine (CPA-style)', () => {
  const taxableAcct = createMockAccount({ id: 'ACCT_TAXABLE', accountId: 'U100100' });
  const tfsaAcct = createMockAccount({ id: 'ACCT_TFSA', accountId: 'U100200', accountType: 'tfsa' });
  const otherBrokerAcct = createMockAccount({ id: 'ACCT_QUESTRADE', accountId: 'Q998877', broker: 'Questrade' });

  // ==========================================
  // MATRIX A: SECTION 47 POOLS
  // ==========================================
  describe('Matrix A: Section 47 Pools (Average Cost & Multi-Broker Consolidation)', () => {
    it('should compute weighted average cost correctly under s. 47(1) for Buy/Buy/Sell', () => {
      const sec = createMockSecurity({ id: 'SEC_RY', symbol: 'RY.TO' });
      const txs = [
        createMockTransaction({
          id: 'T1_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_RY',
          symbol: 'RY.TO',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '10',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T1_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_RY',
          symbol: 'RY.TO',
          date: '2024-02-15',
          transactionType: 'BUY',
          quantity: '100',
          price: '20',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T1_3',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_RY',
          symbol: 'RY.TO',
          date: '2024-05-20',
          transactionType: 'SELL',
          quantity: '100',
          price: '25',
          commission: '0',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const balance = out.securityBalances.get('SEC_RY');
      const rgl = out.realizedGainsLosses[0];

      expect(balance).toBeDefined();
      expect(d(balance?.quantity).toNumber()).toBe(100);
      expect(d(balance?.totalAcbCad).toNumber()).toBe(1500);
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(15);
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(1000);
    });

    it('should consolidate pools across different brokers (taxpayer level single pool)', () => {
      const sec = createMockSecurity({ id: 'SEC_BNS', symbol: 'BNS.TO' });
      const txs = [
        createMockTransaction({
          id: 'T2_1',
          accountId: 'ACCT_TAXABLE', // IBKR
          securityId: 'SEC_BNS',
          symbol: 'BNS.TO',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '60',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T2_2',
          accountId: 'ACCT_QUESTRADE', // Questrade
          securityId: 'SEC_BNS',
          symbol: 'BNS.TO',
          date: '2024-02-15',
          transactionType: 'BUY',
          quantity: '100',
          price: '80',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T2_3',
          accountId: 'ACCT_QUESTRADE', // Questrade
          securityId: 'SEC_BNS',
          symbol: 'BNS.TO',
          date: '2024-04-20',
          transactionType: 'SELL',
          quantity: '100',
          price: '90',
          commission: '0',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct, otherBrokerAcct], [sec]);
      const balance = out.securityBalances.get('SEC_BNS');
      const rgl = out.realizedGainsLosses[0];

      expect(balance).toBeDefined();
      expect(d(balance?.quantity).toNumber()).toBe(100);
      expect(d(balance?.totalAcbCad).toNumber()).toBe(7000);
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(2000);
    });

    it('should convert USD to CAD correctly using explicit transaction date FX rates under s. 261', () => {
      const sec = createMockSecurity({ id: 'SEC_AAPL', symbol: 'AAPL', currency: 'USD' });
      const txs = [
        createMockTransaction({
          id: 'T3_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_AAPL',
          symbol: 'AAPL',
          date: '2024-01-15',
          transactionType: 'BUY',
          quantity: '100',
          price: '100',
          currency: 'USD',
          fxRate: '1.30',
        }),
        createMockTransaction({
          id: 'T3_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_AAPL',
          symbol: 'AAPL',
          date: '2024-06-15',
          transactionType: 'SELL',
          quantity: '100',
          price: '110',
          currency: 'USD',
          fxRate: '1.35',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const rgl = out.realizedGainsLosses[0];

      expect(rgl).toBeDefined();
      expect(d(rgl?.grossProceedsCad).toNumber()).toBe(14850); // 100 * 110 * 1.35
      expect(d(rgl?.acbOfUnitsDisposedCad).toNumber()).toBe(13000); // 100 * 100 * 1.30
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(1850); // 14850 - 13000
    });
  });

  // ==========================================
  // MATRIX B: SUPERFICIAL LOSSES
  // ==========================================
  describe('Matrix B: Superficial Losses (ITA s. 54 & s. 40(2)(g)(i))', () => {
    it('should deny loss and add back to replacement ACB for 30-day repurchase rule in taxable account', () => {
      const sec = createMockSecurity({ id: 'SEC_SHOP', symbol: 'SHOP.TO' });
      const txs = [
        createMockTransaction({
          id: 'T4_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SHOP',
          symbol: 'SHOP.TO',
          date: '2024-03-01',
          transactionType: 'BUY',
          quantity: '100',
          price: '50',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T4_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SHOP',
          symbol: 'SHOP.TO',
          date: '2024-04-01',
          transactionType: 'SELL',
          quantity: '100',
          price: '30',
          commission: '0',
        }),
        createMockTransaction({
          id: 'T4_3',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SHOP',
          symbol: 'SHOP.TO',
          date: '2024-04-10', // Repurchase on D+9
          transactionType: 'BUY',
          quantity: '100',
          price: '32',
          commission: '0',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const balance = out.securityBalances.get('SEC_SHOP');
      const rgl = out.realizedGainsLosses[0];

      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(0);
      expect(d(rgl?.superficialLossDeniedCad).toNumber()).toBe(2000); // 100 * (50 - 30)
      expect(balance).toBeDefined();
      expect(d(balance?.totalAcbCad).toNumber()).toBe(5200); // 3200 + 2000
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(52);
    });

    it('should permanently deny superficial loss without ACB adjustment if repurchased inside a registered account', () => {
      const sec = createMockSecurity({ id: 'SEC_SHOP2', symbol: 'SHOP.TO' });
      const txs = [
        createMockTransaction({
          id: 'T5_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SHOP2',
          symbol: 'SHOP.TO',
          date: '2024-03-01',
          transactionType: 'BUY',
          quantity: '100',
          price: '50',
        }),
        createMockTransaction({
          id: 'T5_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SHOP2',
          symbol: 'SHOP.TO',
          date: '2024-04-01',
          transactionType: 'SELL',
          quantity: '100',
          price: '30',
        }),
        createMockTransaction({
          id: 'T5_3',
          accountId: 'ACCT_TFSA', // TFSA replacement
          securityId: 'SEC_SHOP2',
          symbol: 'SHOP.TO',
          date: '2024-04-05',
          transactionType: 'BUY',
          quantity: '100',
          price: '30',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct, tfsaAcct], [sec]);
      const rgl = out.realizedGainsLosses[0];
      const balance = out.securityBalances.get('SEC_SHOP2');

      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(0);
      expect(d(rgl?.superficialLossDeniedCad).toNumber()).toBe(2000);
      expect(rgl?.isPermanentlyDeniedInRegistered).toBe(true);

      // Taxable account has 0 shares remaining and total ACB is 0 (did not get the bump)
      expect(balance).toBeDefined();
      expect(d(balance?.quantity).isZero()).toBe(true);
      expect(d(balance?.totalAcbCad).isZero()).toBe(true);
    });

    it('should apply partial denial formula correctly when only a portion of shares is repurchased', () => {
      const sec = createMockSecurity({ id: 'SEC_BMO', symbol: 'BMO.TO' });
      const txs = [
        createMockTransaction({
          id: 'T6_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_BMO',
          symbol: 'BMO.TO',
          date: '2023-12-15', // More than 30 days lookback to avoid being treated as a window replacement buy
          transactionType: 'BUY',
          quantity: '100',
          price: '100',
        }),
        createMockTransaction({
          id: 'T6_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_BMO',
          symbol: 'BMO.TO',
          date: '2024-02-01',
          transactionType: 'SELL',
          quantity: '100',
          price: '80', // raw loss is $2,000
        }),
        createMockTransaction({
          id: 'T6_3',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_BMO',
          symbol: 'BMO.TO',
          date: '2024-02-15',
          transactionType: 'BUY',
          quantity: '40', // partial repurchase of 40%
          price: '85',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const rgl = out.realizedGainsLosses[0];
      const balance = out.securityBalances.get('SEC_BMO');

      // 40% of the loss should be denied: 40% of $2,000 = $800
      expect(rgl).toBeDefined();
      expect(d(rgl?.superficialLossDeniedCad).toNumber()).toBe(800);
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(-1200); // -$1,200 is allowed

      // Replacement ACB should be 40 * 85 + 800 = 3400 + 800 = 4200
      expect(balance).toBeDefined();
      expect(d(balance?.totalAcbCad).toNumber()).toBe(4200);
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(105);
    });

    it('should process BUY before SELL on the same day (same-day ordering)', () => {
      const sec = createMockSecurity({ id: 'SEC_SAME', symbol: 'SAME.TO' });
      // SELL is first in array, but engine should reorder and process BUY first
      const txs = [
        createMockTransaction({
          id: 'T7_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SAME',
          symbol: 'SAME.TO',
          date: '2024-05-15',
          transactionType: 'SELL',
          quantity: '100',
          price: '12',
        }),
        createMockTransaction({
          id: 'T7_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_SAME',
          symbol: 'SAME.TO',
          date: '2024-05-15',
          transactionType: 'BUY',
          quantity: '100',
          price: '10',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const rgl = out.realizedGainsLosses[0];
      const balance = out.securityBalances.get('SEC_SAME');

      // Position should be 0, total net gain is $200, no QTY_SHORTFALL triggered
      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(200);
      expect(balance).toBeDefined();
      expect(d(balance?.quantity).isZero()).toBe(true);
    });
  });

  // ==========================================
  // MATRIX C: RETURN OF CAPITAL
  // ==========================================
  describe('Matrix C: Return of Capital (ROC)', () => {
    it('should reduce ACB pool dollar-for-dollar for ROC', () => {
      const sec = createMockSecurity({ id: 'SEC_REIT', symbol: 'REIT.UN' });
      const txs = [
        createMockTransaction({
          id: 'T8_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_REIT',
          symbol: 'REIT.UN',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '10',
        }),
        createMockTransaction({
          id: 'T8_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_REIT',
          symbol: 'REIT.UN',
          date: '2024-06-15',
          transactionType: 'RETURN_OF_CAPITAL',
          quantity: '0',
          price: '0',
          amountCad: '300', // ROC is $300
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const balance = out.securityBalances.get('SEC_REIT');

      // Total ACB should drop from $1000 to $700. Per unit drops from $10 to $7.
      expect(balance).toBeDefined();
      expect(d(balance?.totalAcbCad).toNumber()).toBe(700);
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(7);
      expect(d(balance?.quantity).toNumber()).toBe(100);
    });

    it('should trigger an immediate capital gain under s. 40(3) and reset ACB to 0 if ROC reduces ACB below zero', () => {
      const sec = createMockSecurity({ id: 'SEC_REIT2', symbol: 'REIT2.UN' });
      const txs = [
        createMockTransaction({
          id: 'T9_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_REIT2',
          symbol: 'REIT2.UN',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '10',
        }),
        createMockTransaction({
          id: 'T9_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_REIT2',
          symbol: 'REIT2.UN',
          date: '2024-06-15',
          transactionType: 'RETURN_OF_CAPITAL',
          quantity: '0',
          price: '0',
          amountCad: '1200', // ROC of $1,200 is greater than $1,000 ACB
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const balance = out.securityBalances.get('SEC_REIT2');
      const rgl = out.realizedGainsLosses[0];

      // Remaining total ACB resets to 0, excess $200 is realized capital gain
      expect(balance).toBeDefined();
      expect(d(balance?.totalAcbCad).toNumber()).toBe(0);
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(0);
      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(200);
    });
  });

  // ==========================================
  // MATRIX D: CORPORATE ACTIONS
  // ==========================================
  describe('Matrix D: Corporate Actions (Continuity & Mixed Deals)', () => {
    it('should handle stock splits (continuity of cost pool, unit count adjusted)', () => {
      const sec = createMockSecurity({ id: 'SEC_NVDA', symbol: 'NVDA' });
      const txs = [
        createMockTransaction({
          id: 'T10_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_NVDA',
          symbol: 'NVDA',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '50',
        }),
        createMockTransaction({
          id: 'T10_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_NVDA',
          symbol: 'NVDA',
          date: '2024-03-01',
          transactionType: 'STOCK_SPLIT',
          quantity: '0',
          price: '0',
          corporateAction: {
            treatment: 'CONTINUITY_SPLIT',
            statutoryBasis: 'ITA s. 47(1) Stock Split',
            brokerDescription: 'Forward Stock Split 2 for 1',
            oldSecurityId: 'SEC_NVDA',
            ratio: 2,
          },
        }),
        createMockTransaction({
          id: 'T10_3',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_NVDA',
          symbol: 'NVDA',
          date: '2024-04-01',
          transactionType: 'SELL',
          quantity: '50',
          price: '30',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const balance = out.securityBalances.get('SEC_NVDA');
      const rgl = out.realizedGainsLosses[0];

      // After 2-for-1 split: 200 shares, total ACB remains $5000, per unit is $25.
      // After Sell of 50 shares: 150 shares left, total ACB $3750, gain is 50 * ($30 - $25) = $250.
      expect(balance).toBeDefined();
      expect(d(balance?.quantity).toNumber()).toBe(150);
      expect(d(balance?.totalAcbCad).toNumber()).toBe(3750);
      expect(d(balance?.acbPerUnitCad).toNumber()).toBe(25);
      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(250);
    });

    it('should process taxable foreign mixed deals with capital boot under s. 40(1)', () => {
      const oldSec = createMockSecurity({ id: 'SEC_TGT', symbol: 'TGT' });
      const newSec = createMockSecurity({ id: 'SEC_ACQ', symbol: 'ACQ' });
      const txs = [
        createMockTransaction({
          id: 'T11_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_TGT',
          symbol: 'TGT',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '20',
        }),
        createMockTransaction({
          id: 'T11_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_TGT',
          symbol: 'TGT',
          date: '2024-05-15',
          transactionType: 'MERGER_MIXED',
          quantity: '100',
          price: '0',
          amountCad: '1000', // Cash consideration of $1,000 received
          corporateAction: {
            treatment: 'MIXED_CAPITAL_BOOT_TAXABLE',
            statutoryBasis: 'ITA s. 40(1) Taxable Foreign Merger',
            brokerDescription: 'Merger: $10 Cash + 0.5 ACQ shares per TGT share',
            oldSecurityId: 'SEC_TGT',
            newSecurityId: 'SEC_ACQ',
            totalCashReceived: '1000',
            newSharesReceived: '50',
            newShareFmvPerShare: '30', // New shares value = 50 * 30 = $1,500
          },
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [oldSec, newSec]);
      const oldBal = out.securityBalances.get('SEC_TGT');
      const newBal = out.securityBalances.get('SEC_ACQ');
      const rgl = out.realizedGainsLosses[0];

      // Old security is fully disposed. Proceeds = $1,000 cash + $1,500 FMV share value = $2,500.
      // Gain = $2,500 - $2,000 (old ACB) = $500.
      // New security opening ACB = $1,500.
      expect(oldBal).toBeDefined();
      expect(d(oldBal?.quantity).isZero()).toBe(true);
      expect(newBal).toBeDefined();
      expect(d(newBal?.quantity).toNumber()).toBe(50);
      expect(d(newBal?.totalAcbCad).toNumber()).toBe(1500);
      expect(rgl).toBeDefined();
      expect(d(rgl?.recognizedGainLossCad).toNumber()).toBe(500);
    });

    it('should handle s. 85.1 rollover mixed deals with boot (gain deferred)', () => {
      const oldSec = createMockSecurity({ id: 'SEC_TGT85', symbol: 'TGT85' });
      const newSec = createMockSecurity({ id: 'SEC_ACQ85', symbol: 'ACQ85' });
      const txs = [
        createMockTransaction({
          id: 'T12_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_TGT85',
          symbol: 'TGT85',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '20', // ACB is $2,000
        }),
        createMockTransaction({
          id: 'T12_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_TGT85',
          symbol: 'TGT85',
          date: '2024-05-15',
          transactionType: 'MERGER_MIXED',
          quantity: '100',
          price: '0',
          amountCad: '400', // Cash received is $400 (boot)
          corporateAction: {
            treatment: 'MIXED_CAPITAL_BOOT_ROLLOVER',
            statutoryBasis: 'ITA s. 85.1(2) Rollover with Boot (Loss Case)',
            brokerDescription: 'Merger: $4 Cash + 50 ACQ shares',
            oldSecurityId: 'SEC_TGT85',
            newSecurityId: 'SEC_ACQ85',
            totalCashReceived: '400',
            newSharesReceived: '50',
            newShareFmvPerShare: '24', // New shares value = 50 * 24 = $1,200 (Total deal value $1,600, inherent loss $400)
          },
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [oldSec, newSec]);
      const newBal = out.securityBalances.get('SEC_ACQ85');
      const rglCount = out.realizedGainsLosses.length;

      // Inherent loss is deferred. New shares ACB = Old ACB ($2,000) - cash boot ($400) = $1,600.
      expect(rglCount).toBe(0);
      expect(newBal).toBeDefined();
      expect(d(newBal?.quantity).toNumber()).toBe(50);
      expect(d(newBal?.totalAcbCad).toNumber()).toBe(1600);
    });

    it('should default ineligible foreign spinoff to foreign dividend under s. 90 with parent ACB unchanged', () => {
      const parentSec = createMockSecurity({ id: 'SEC_PARENT', symbol: 'PARENT' });
      const spinSec = createMockSecurity({ id: 'SEC_SPINCO', symbol: 'SPINCO' });
      const txs = [
        createMockTransaction({
          id: 'T13_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_PARENT',
          symbol: 'PARENT',
          date: '2024-01-10',
          transactionType: 'BUY',
          quantity: '100',
          price: '100', // ACB is $10,000
        }),
        createMockTransaction({
          id: 'T13_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_PARENT',
          symbol: 'PARENT',
          date: '2024-05-15',
          transactionType: 'SPINOFF',
          quantity: '0',
          price: '0',
          corporateAction: {
            treatment: 'INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND',
            statutoryBasis: 'ITA s. 90 Foreign Dividend in Kind',
            brokerDescription: 'Spin-off: 1 SpinCo per Parent share',
            oldSecurityId: 'SEC_PARENT',
            newSecurityId: 'SEC_SPINCO',
            newSharesReceived: '100',
            newShareFmvPerShare: '20', // Total SpinCo value = $2,000
          },
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [parentSec, spinSec]);
      const parentBal = out.securityBalances.get('SEC_PARENT');
      const spinBal = out.securityBalances.get('SEC_SPINCO');
      const divIncome = out.incomeDistributions.dividendsCad;

      // Parent ACB remains unchanged at $10,000. SpinCo opening ACB is $2,000. Foreign dividend is $2,000.
      expect(parentBal).toBeDefined();
      expect(d(parentBal?.totalAcbCad).toNumber()).toBe(10000);
      expect(spinBal).toBeDefined();
      expect(d(spinBal?.totalAcbCad).toNumber()).toBe(2000);
      expect(d(divIncome).toNumber()).toBe(2000);
    });
  });

  // ==========================================
  // MATRIX E: OPTIONS MATRIX
  // ==========================================
  describe('Matrix E: Options Matrix (Standalone, Assignment & Exercises)', () => {
    it('should add long call premium directly to acquired shares ACB on exercise under s. 49(3)', () => {
      const secOpt = createMockSecurity({
        id: 'SEC_XYZ_OPT',
        symbol: 'XYZ C100',
        assetClass: 'OPT',
        optionDetails: { underlyingSymbol: 'XYZ', putOrCall: 'CALL', strike: 100, expiryDate: '2024-06-21', multiplier: 100 },
      });
      const secStk = createMockSecurity({ id: 'SEC_XYZ', symbol: 'XYZ' });
      const txs = [
        createMockTransaction({
          id: 'T14_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_XYZ_OPT',
          symbol: 'XYZ C100',
          date: '2024-01-15',
          transactionType: 'BUY_TO_OPEN_OPT',
          quantity: '1',
          price: '500', // Override price to 500 to yield total premium of $500
        }),
        createMockTransaction({
          id: 'T14_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_XYZ_OPT',
          symbol: 'XYZ C100',
          date: '2024-06-20',
          transactionType: 'EXERCISE_LONG_CALL',
          quantity: '1',
          price: '100', // Strike price is $100 ($10,000 share outlay)
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [secOpt, secStk]);
      const shareBal = out.securityBalances.get('SEC_XYZ');

      // Total share ACB should be $10,000 strike outlay + $500 premium = $10,500. Per unit is $105.
      expect(shareBal).toBeDefined();
      expect(d(shareBal?.quantity).toNumber()).toBe(100);
      expect(d(shareBal?.totalAcbCad).toNumber()).toBe(10500);
      expect(d(shareBal?.acbPerUnitCad).toNumber()).toBe(105);
    });
  });

  // ==========================================
  // MATRIX F: MISSING ACB & SHORTFALL STATUS
  // ==========================================
  describe('Matrix F: Missing ACB and QTY Shortfalls', () => {
    it('should flag transaction as needs_review and missing_acb if sold from a zero balance position', () => {
      const sec = createMockSecurity({ id: 'SEC_MSFT', symbol: 'MSFT' });
      const txs = [
        createMockTransaction({
          id: 'T15_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_MSFT',
          symbol: 'MSFT',
          date: '2024-05-10',
          transactionType: 'SELL',
          quantity: '50',
          price: '300',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const matchingLedger = out.ledger.find((l) => l.transactionId === 'T15_1');
      const matchingTx = txs[0];

      // Needs review should be flagged
      expect(matchingTx.status).toBe('needs_review');
      expect(matchingTx.reasonCode).toBe('MISSING_ACB');
      // A special missing-ACB ledger item should exist
      expect(matchingLedger).toBeDefined();
      expect(matchingLedger?.realizedGainLossCad).toBeUndefined();
      expect(matchingLedger?.statutoryRule).toBe('ACB Unknown — Missing Acquisition Cost');
    });

    it('should flag QTY_SHORTFALL if disposed shares exceed available pool balance', () => {
      const sec = createMockSecurity({ id: 'SEC_NFLX', symbol: 'NFLX' });
      const txs = [
        createMockTransaction({
          id: 'T16_1',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_NFLX',
          symbol: 'NFLX',
          date: '2024-05-10',
          transactionType: 'BUY',
          quantity: '10',
          price: '400', // ACB is $4,000
        }),
        createMockTransaction({
          id: 'T16_2',
          accountId: 'ACCT_TAXABLE',
          securityId: 'SEC_NFLX',
          symbol: 'NFLX',
          date: '2024-05-15',
          transactionType: 'SELL',
          quantity: '15', // exceeds 10 shares held!
          price: '500',
        }),
      ];

      const out = runAcbEngine(txs, [taxableAcct], [sec]);
      const matchingTx = txs[1];

      expect(matchingTx.status).toBe('needs_review');
      expect(matchingTx.reasonCode).toBe('QTY_SHORTFALL');
    });
  });
});
