import { Transaction, Account, SecurityMaster, OpenPosition } from '../types/tax';
import { runAcbEngine, reconcilePositions } from './acbEngine';

export interface TestFixtureResult {
  id: string;
  name: string;
  category: string;
  description: string;
  statutoryCitations: string[];
  passed: boolean;
  expectedResult: string;
  actualResult: string;
  auditTrail: string[];
  executionTimeMs: number;
}

export function runAllTestFixtures(): TestFixtureResult[] {
  const results: TestFixtureResult[] = [];

  // Default Taxable Account
  const taxableAcct: Account = {
    id: 'ACCT_TAXABLE',
    accountId: 'U100100',
    name: 'IBKR Non-Registered Margin',
    broker: 'IBKR',
    accountType: 'taxable',
    baseCurrency: 'CAD',
    isHouseholdAffiliate: false,
  };

  const tfsaAcct: Account = {
    id: 'ACCT_TFSA',
    accountId: 'U100200',
    name: 'IBKR TFSA',
    broker: 'IBKR',
    accountType: 'tfsa',
    baseCurrency: 'CAD',
    isHouseholdAffiliate: false,
  };

  const secondBrokerAcct: Account = {
    id: 'ACCT_QUESTRADE',
    accountId: 'Q998877',
    name: 'Questrade Taxable Margin',
    broker: 'Questrade',
    accountType: 'taxable',
    baseCurrency: 'CAD',
    isHouseholdAffiliate: false,
  };

  // ==========================================
  // Test 1: Simple Average-Cost Buy/Buy/Sell (ITA s. 47)
  // Buy 100 @ $10 ($1000), Buy 100 @ $20 ($2000) -> Pool 200 @ $15 ($3000). Sell 100 @ $25 ($2500) -> Proceeds $2500, ACB removed $1500, Gain $1000.
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_RY', symbol: 'RY.TO', name: 'Royal Bank of Canada', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T1_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_RY', symbol: 'RY.TO', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000',
        totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T1_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_RY', symbol: 'RY.TO', date: '2024-02-15',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T1_3', accountId: 'ACCT_TAXABLE', securityId: 'SEC_RY', symbol: 'RY.TO', date: '2024-05-20',
        transactionType: 'SELL', quantity: '100', price: '25', currency: 'CAD', commission: '0', totalGrossAmount: '2500',
        totalNetAmount: '2500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2500', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const balance = out.securityBalances.get('SEC_RY');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(balance?.quantity) === 100 && Number(balance?.totalAcbCad) === 1500 && Number(rgl?.recognizedGainLossCad) === 1000;
    results.push({
      id: 'TEST_1',
      name: 'Simple Average Cost Buy/Buy/Sell',
      category: 'Core Tax Engine (ITA s. 47)',
      description: 'Verifies weighted average cost recomputation and disposition gain calculation without lot matching.',
      statutoryCitations: ['ITA s. 47(1)', 'ITA s. 40(1)(a)'],
      passed,
      expectedResult: 'Remaining Qty: 100, Remaining ACB: $1,500.00 CAD, Realized Capital Gain: $1,000.00 CAD',
      actualResult: `Remaining Qty: ${balance?.quantity}, Remaining ACB: $${balance?.totalAcbCad} CAD, Realized Capital Gain: $${rgl?.recognizedGainLossCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 2: USD Buy then CAD-Converted Sell with Different FX (ITA s. 261 Currency Rule)
  // Buy 100 AAPL @ $100 USD (FX 1.30) = $13,000 CAD. Sell 100 AAPL @ $110 USD (FX 1.35) = $14,850 CAD.
  // Gain = $14,850 - $13,000 = $1,850 CAD (FX embedded).
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_AAPL', symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'STK', currency: 'USD' };
    const txs: Transaction[] = [
      {
        id: 'T2_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_AAPL', symbol: 'AAPL', date: '2024-01-15',
        transactionType: 'BUY', quantity: '100', price: '100', currency: 'USD', commission: '0', totalGrossAmount: '10000',
        totalNetAmount: '10000', fxRate: '1.30', fxRateSource: 'BANK_OF_CANADA', amountCad: '13000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T2_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_AAPL', symbol: 'AAPL', date: '2024-06-15',
        transactionType: 'SELL', quantity: '100', price: '110', currency: 'USD', commission: '0', totalGrossAmount: '11000',
        totalNetAmount: '11000', fxRate: '1.35', fxRateSource: 'BANK_OF_CANADA', amountCad: '14850', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const rgl = out.realizedGainsLosses[0];
    const passed = Number(rgl?.recognizedGainLossCad) === 1850 && Number(rgl?.grossProceedsCad) === 14850 && Number(rgl?.acbOfUnitsDisposedCad) === 13000;

    results.push({
      id: 'TEST_2',
      name: 'USD Security with Embedded FX on Transaction Dates',
      category: 'Foreign Currency (ITA s. 261)',
      description: 'Ensures foreign currency is converted on transaction date; FX gain/loss is embedded into security capital gain.',
      statutoryCitations: ['ITA s. 261', 'ITA s. 40(1)(a)'],
      passed,
      expectedResult: 'Proceeds: $14,850.00 CAD, ACB: $13,000.00 CAD, Embedded Realized Gain: $1,850.00 CAD',
      actualResult: `Proceeds: $${rgl?.grossProceedsCad} CAD, ACB: $${rgl?.acbOfUnitsDisposedCad} CAD, Realized Gain: $${rgl?.recognizedGainLossCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 3: Superficial Loss Repurchase in Taxable Account (ITA s. 54 & s. 40(2)(g)(i))
  // Buy 100 @ $50 = $5,000. Sell 100 @ $30 = $3,000 (Raw Loss $2,000). Repurchase 100 @ $32 = $3,200 on D+10.
  // Loss denied $2,000 (Schedule 3 $0). Replacement ACB = $3,200 + $2,000 = $5,200 ($52/unit).
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_SHOP', symbol: 'SHOP.TO', name: 'Shopify Inc.', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T3_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_SHOP', symbol: 'SHOP.TO', date: '2024-03-01',
        transactionType: 'BUY', quantity: '100', price: '50', currency: 'CAD', commission: '0', totalGrossAmount: '5000',
        totalNetAmount: '5000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '5000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T3_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_SHOP', symbol: 'SHOP.TO', date: '2024-04-01',
        transactionType: 'SELL', quantity: '100', price: '30', currency: 'CAD', commission: '0', totalGrossAmount: '3000',
        totalNetAmount: '3000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '3000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T3_3', accountId: 'ACCT_TAXABLE', securityId: 'SEC_SHOP', symbol: 'SHOP.TO', date: '2024-04-10',
        transactionType: 'BUY', quantity: '100', price: '32', currency: 'CAD', commission: '0', totalGrossAmount: '3200',
        totalNetAmount: '3200', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '3200', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const balance = out.securityBalances.get('SEC_SHOP');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(rgl?.recognizedGainLossCad) === 0 && Number(rgl?.superficialLossDeniedCad) === 2000 && Number(balance?.totalAcbCad) === 5200;

    results.push({
      id: 'TEST_3',
      name: 'Superficial Loss Repurchase in Taxable Account',
      category: 'Superficial Loss (ITA s. 54)',
      description: 'Capital loss within 30 days is denied on Schedule 3 ($0) and added back into the replacement ACB.',
      statutoryCitations: ['ITA s. 54', 'ITA s. 40(2)(g)(i)', 'ITA s. 53(1)(f)'],
      passed,
      expectedResult: 'Recognized Loss: $0.00 CAD, Denied Loss: $2,000.00 CAD, Replacement ACB: $5,200.00 CAD ($52.00/unit)',
      actualResult: `Recognized Loss: $${rgl?.recognizedGainLossCad} CAD, Denied Loss: $${rgl?.superficialLossDeniedCad} CAD, Replacement ACB: $${balance?.totalAcbCad} CAD ($${balance?.acbPerUnitCad}/unit)`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 4: Superficial Loss Repurchase in TFSA (Permanently Denied)
  // Sell 100 SHOP in Taxable at loss of $2,000. Repurchase 100 in TFSA on D+5.
  // Recognized Loss: $0. Denied: $2,000. Permanently Denied = true (No ACB bump in taxable).
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_SHOP2', symbol: 'SHOP.TO', name: 'Shopify Inc.', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T4_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_SHOP2', symbol: 'SHOP.TO', date: '2024-03-01',
        transactionType: 'BUY', quantity: '100', price: '50', currency: 'CAD', commission: '0', totalGrossAmount: '5000',
        totalNetAmount: '5000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '5000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T4_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_SHOP2', symbol: 'SHOP.TO', date: '2024-04-01',
        transactionType: 'SELL', quantity: '100', price: '30', currency: 'CAD', commission: '0', totalGrossAmount: '3000',
        totalNetAmount: '3000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '3000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T4_3', accountId: 'ACCT_TFSA', securityId: 'SEC_SHOP2', symbol: 'SHOP.TO', date: '2024-04-05',
        transactionType: 'BUY', quantity: '100', price: '30', currency: 'CAD', commission: '0', totalGrossAmount: '3000',
        totalNetAmount: '3000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '3000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct, tfsaAcct], [sec]);
    const rgl = out.realizedGainsLosses[0];
    const sl = out.superficialLosses[0];

    const passed = Number(rgl?.recognizedGainLossCad) === 0 && sl?.isPermanentlyDeniedInRegistered === true;

    results.push({
      id: 'TEST_4',
      name: 'Superficial Loss Repurchase in TFSA / Registered Account',
      category: 'Superficial Loss (Registered Trap)',
      description: 'Repurchasing identical property inside TFSA/RRSP permanently denies the capital loss with zero ACB recovery.',
      statutoryCitations: ['ITA s. 40(2)(g)(i)', 'ITA s. 54'],
      passed,
      expectedResult: 'Recognized Loss: $0.00 CAD, Permanently Denied: true, Taxable ACB recovery: $0.00 CAD',
      actualResult: `Recognized Loss: $${rgl?.recognizedGainLossCad} CAD, Permanently Denied: ${sl?.isPermanentlyDeniedInRegistered}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 5: Stock Split 2-for-1 then Sell (ITA s. 47)
  // Buy 100 @ $50 ($5,000). Split 2:1 -> 200 @ $25 ($5,000). Sell 50 @ $30 ($1,500).
  // ACB removed = 50 * $25 = $1,250. Gain = $1,500 - $1,250 = $250. Remaining: 150 @ $25 = $3,750.
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_NVDA', symbol: 'NVDA', name: 'Nvidia Corp', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T5_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_NVDA', symbol: 'NVDA', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '50', currency: 'CAD', commission: '0', totalGrossAmount: '5000',
        totalNetAmount: '5000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '5000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T5_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_NVDA', symbol: 'NVDA', date: '2024-03-01',
        transactionType: 'STOCK_SPLIT', quantity: '0', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '0',
        totalNetAmount: '0', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '0', commissionCad: '0', totalOutlaysCad: '0',
        corporateAction: {
          treatment: 'CONTINUITY_SPLIT',
          statutoryBasis: 'ITA s. 47(1) Stock Split',
          brokerDescription: 'Forward Stock Split 2 for 1',
          oldSecurityId: 'SEC_NVDA',
          ratio: 2,
        },
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T5_3', accountId: 'ACCT_TAXABLE', securityId: 'SEC_NVDA', symbol: 'NVDA', date: '2024-04-01',
        transactionType: 'SELL', quantity: '50', price: '30', currency: 'CAD', commission: '0', totalGrossAmount: '1500',
        totalNetAmount: '1500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1500', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const balance = out.securityBalances.get('SEC_NVDA');
    const sellRgl = out.realizedGainsLosses.find((r) => r.dispositionTransactionId === 'T5_3') || out.realizedGainsLosses[0];

    const passed = Number(balance?.quantity) === 150 && Number(balance?.totalAcbCad) === 3750 && Number(sellRgl?.recognizedGainLossCad) === 250;

    results.push({
      id: 'TEST_5',
      name: 'Stock Split 2-for-1 Continuity & Subsequent Disposition',
      category: 'Corporate Actions (Continuity)',
      description: 'Stock split doubles unit count while total ACB remains constant; subsequent sale uses updated per-unit ACB.',
      statutoryCitations: ['ITA s. 47(1)'],
      passed,
      expectedResult: 'Remaining Qty: 150, Remaining ACB: $3,750.00 CAD ($25.00/unit), Realized Gain: $250.00 CAD',
      actualResult: `Remaining Qty: ${balance?.quantity}, Remaining ACB: $${balance?.totalAcbCad} CAD ($${balance?.acbPerUnitCad}/unit), Realized Gain: $${sellRgl?.recognizedGainLossCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 6: ROC Reducing ACB Below Zero -> Capital Gain (ITA s. 53(2)(a) & s. 40(3))
  // Buy 100 @ $10 = $1,000. ROC distribution = $1,200.
  // Total ACB drops to $0. Excess $200 recognized as deemed capital gain.
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_REIT', symbol: 'REIT.UN', name: 'Canadian REIT', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T6_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_REIT', symbol: 'REIT.UN', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000',
        totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T6_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_REIT', symbol: 'REIT.UN', date: '2024-06-15',
        transactionType: 'RETURN_OF_CAPITAL', quantity: '0', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '1200',
        totalNetAmount: '1200', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1200', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const balance = out.securityBalances.get('SEC_REIT');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(balance?.totalAcbCad) === 0 && Number(rgl?.recognizedGainLossCad) === 200;

    results.push({
      id: 'TEST_6',
      name: 'Return of Capital (ROC) Below Zero Deemed Capital Gain',
      category: 'Distributions (ITA s. 53 & s. 40(3))',
      description: 'ROC reduces ACB dollar-for-dollar; any negative balance is deemed an immediate capital gain and resets ACB to $0.',
      statutoryCitations: ['ITA s. 53(2)(a)', 'ITA s. 40(3)'],
      passed,
      expectedResult: 'Remaining Total ACB: $0.00 CAD, Deemed Capital Gain: $200.00 CAD',
      actualResult: `Remaining Total ACB: $${balance?.totalAcbCad} CAD, Deemed Capital Gain: $${rgl?.recognizedGainLossCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 7: Worked Example 4.D.4 - Mixed Consideration Taxable (No Rollover)
  // 100 shares, ACB $20/sh = $2,000. Deal: $10 cash + 0.5 NEW shares (FMV $30/sh = $15/sh old).
  // Total consideration = 100 * ($10 + $15) = $2,500. Gain = $500. New 50 shares opening ACB = $1,500 ($30/sh).
  // ==========================================
  {
    const start = performance.now();
    const oldSec: SecurityMaster = { id: 'SEC_TARGET_4D4', symbol: 'TGT', name: 'Target US Corp', assetClass: 'STK', currency: 'CAD' };
    const newSec: SecurityMaster = { id: 'SEC_ACQ_4D4', symbol: 'ACQ', name: 'Acquirer Inc', assetClass: 'STK', currency: 'CAD' };

    const txs: Transaction[] = [
      {
        id: 'T7_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D4', symbol: 'TGT', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T7_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D4', symbol: 'TGT', date: '2024-05-15',
        transactionType: 'MERGER_MIXED', quantity: '100', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '1000',
        totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0',
        corporateAction: {
          treatment: 'MIXED_CAPITAL_BOOT_TAXABLE',
          statutoryBasis: 'ITA s. 40(1) Taxable Foreign Merger',
          brokerDescription: 'Merger: $10 Cash + 0.5 ACQ shares per TGT share',
          oldSecurityId: 'SEC_TARGET_4D4',
          newSecurityId: 'SEC_ACQ_4D4',
          totalCashReceived: '1000',
          newSharesReceived: '50',
          newShareFmvPerShare: '30', // 50 * 30 = $1,500
        },
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [oldSec, newSec]);
    const oldBalance = out.securityBalances.get('SEC_TARGET_4D4');
    const newBalance = out.securityBalances.get('SEC_ACQ_4D4');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(oldBalance?.quantity) === 0 && Number(rgl?.recognizedGainLossCad) === 500 && Number(newBalance?.quantity) === 50 && Number(newBalance?.totalAcbCad) === 1500;

    results.push({
      id: 'TEST_7',
      name: 'Worked Example 4.D.4: Taxable Mixed Deal (No Rollover)',
      category: 'Corporate Actions (Mixed Deals)',
      description: 'Target fully disposed at (Cash + New Share FMV) = $2,500. Realized gain = $500. New shares opening ACB = $1,500.',
      statutoryCitations: ['ITA s. 40(1)(a)'],
      passed,
      expectedResult: 'Target Qty: 0, Realized Gain: $500.00 CAD, New Shares Qty: 50, New Shares ACB: $1,500.00 CAD',
      actualResult: `Target Qty: ${oldBalance?.quantity}, Realized Gain: $${rgl?.recognizedGainLossCad} CAD, New Shares Qty: ${newBalance?.quantity}, New Shares ACB: $${newBalance?.totalAcbCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 8: Worked Example 4.D.6 - Mixed Deal Rollover with Inherent Loss (ITA s. 85.1)
  // ACB $2,000, Cash $400, FMV_new $1,200 (FMV total $1,600 -> Inherent Loss $400).
  // Rollover rule: NO loss recognized. ACB_new = Old ACB ($2,000) - Cash ($400) = $1,600.
  // ==========================================
  {
    const start = performance.now();
    const oldSec: SecurityMaster = { id: 'SEC_TARGET_4D6', symbol: 'TGT6', name: 'Target Canadian Corp', assetClass: 'STK', currency: 'CAD' };
    const newSec: SecurityMaster = { id: 'SEC_ACQ_4D6', symbol: 'ACQ6', name: 'Acquirer Canadian Corp', assetClass: 'STK', currency: 'CAD' };

    const txs: Transaction[] = [
      {
        id: 'T8_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D6', symbol: 'TGT6', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T8_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D6', symbol: 'TGT6', date: '2024-05-15',
        transactionType: 'MERGER_MIXED', quantity: '100', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '400',
        totalNetAmount: '400', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '400', commissionCad: '0', totalOutlaysCad: '0',
        corporateAction: {
          treatment: 'MIXED_CAPITAL_BOOT_ROLLOVER',
          statutoryBasis: 'ITA s. 85.1(2) Rollover with Boot (Loss Case)',
          brokerDescription: 'Merger: $4 Cash + 50 ACQ shares',
          oldSecurityId: 'SEC_TARGET_4D6',
          newSecurityId: 'SEC_ACQ_4D6',
          totalCashReceived: '400',
          newSharesReceived: '50',
          newShareFmvPerShare: '24', // 50 * 24 = $1,200
        },
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [oldSec, newSec]);
    const newBalance = out.securityBalances.get('SEC_ACQ_4D6');
    const rglCount = out.realizedGainsLosses.length;

    const passed = rglCount === 0 && Number(newBalance?.totalAcbCad) === 1600 && Number(newBalance?.quantity) === 50;

    results.push({
      id: 'TEST_8',
      name: 'Worked Example 4.D.6: Rollover with Boot Inherent Loss',
      category: 'Corporate Actions (Mixed Deals)',
      description: 'Under s. 85.1 rollover with boot, inherent loss is not recognized immediately; ACB of new shares = Old ACB - Cash = $1,600.',
      statutoryCitations: ['ITA s. 85.1(2)'],
      passed,
      expectedResult: 'Recognized Loss: $0.00 CAD, New Shares ACB: $1,600.00 CAD ($32.00/unit)',
      actualResult: `Realized Gain/Loss events: ${rglCount}, New Shares ACB: $${newBalance?.totalAcbCad} CAD ($${newBalance?.acbPerUnitCad}/unit)`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 9: Worked Example 4.D.7 - Cash Leg as Takeover Dividend
  // 100 shares, ACB $2,000. 50 NEW shares (FMV $1,500) + $1,000 special takeover dividend.
  // Dividend income = $1,000 (not proceeds). Share exchange rollover: ACB_new = $2,000.
  // ==========================================
  {
    const start = performance.now();
    const oldSec: SecurityMaster = { id: 'SEC_TARGET_4D7', symbol: 'TGT7', name: 'Target Corp', assetClass: 'STK', currency: 'CAD' };
    const newSec: SecurityMaster = { id: 'SEC_ACQ_4D7', symbol: 'ACQ7', name: 'Acquirer Corp', assetClass: 'STK', currency: 'CAD' };

    const txs: Transaction[] = [
      {
        id: 'T9_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D7', symbol: 'TGT7', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T9_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_TARGET_4D7', symbol: 'TGT7', date: '2024-05-15',
        transactionType: 'MERGER_MIXED', quantity: '100', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '1000',
        totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0',
        corporateAction: {
          treatment: 'MIXED_TAKEOVER_DIVIDEND',
          statutoryBasis: 'ITA s. 84(2) Takeover Deemed Dividend + s. 85.1 Rollover',
          brokerDescription: 'Merger + Special Takeover Dividend $1,000',
          oldSecurityId: 'SEC_TARGET_4D7',
          newSecurityId: 'SEC_ACQ_4D7',
          totalCashReceived: '1000',
          newSharesReceived: '50',
          newShareFmvPerShare: '30',
        },
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [oldSec, newSec]);
    const newBalance = out.securityBalances.get('SEC_ACQ_4D7');
    const divIncome = out.incomeDistributions.dividendsCad;

    const passed = Number(newBalance?.totalAcbCad) === 2000 && Number(divIncome) === 1000;

    results.push({
      id: 'TEST_9',
      name: 'Worked Example 4.D.7: Cash Leg as Takeover Dividend',
      category: 'Corporate Actions (Review Card)',
      description: 'Cash characterized as special dividend is reported as dividend income; share rollover ACB carries over at full $2,000.',
      statutoryCitations: ['ITA s. 84(2)', 'ITA s. 85.1'],
      passed,
      expectedResult: 'Dividend Income: $1,000.00 CAD, New Shares ACB: $2,000.00 CAD ($40.00/unit)',
      actualResult: `Dividend Income: $${divIncome} CAD, New Shares ACB: $${newBalance?.totalAcbCad} CAD ($${newBalance?.acbPerUnitCad}/unit)`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 10: Option Four-Way Matrix - Long Call Exercise Basis Rollover (ITA s. 49(3))
  // Buy 1 Call Strike $100 for $500 premium. Exercise Call -> Buy 100 shares @ $100 ($10,000).
  // Total share ACB = $10,000 + $500 = $10,500 ($105/share). Option basis transferred ($0 option gain).
  // ==========================================
  {
    const start = performance.now();
    const secOpt: SecurityMaster = {
      id: 'SEC_XYZ_OPT', symbol: 'XYZ C100', name: 'XYZ Call', assetClass: 'OPT', currency: 'CAD',
      optionDetails: { underlyingSymbol: 'XYZ', putOrCall: 'CALL', strike: 100, expiryDate: '2024-06-21', multiplier: 100 }
    };
    const secStk: SecurityMaster = {
      id: 'SEC_XYZ', symbol: 'XYZ', name: 'XYZ Corp', assetClass: 'STK', currency: 'CAD'
    };
    const txs: Transaction[] = [
      {
        id: 'T10_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_XYZ_OPT', symbol: 'XYZ C100', date: '2024-01-15',
        transactionType: 'BUY_TO_OPEN_OPT', quantity: '1', price: '5', currency: 'CAD', commission: '0', totalGrossAmount: '500',
        totalNetAmount: '500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '500', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T10_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_XYZ_OPT', symbol: 'XYZ C100', date: '2024-06-20',
        transactionType: 'EXERCISE_LONG_CALL', quantity: '1', price: '100', currency: 'CAD', commission: '0', totalGrossAmount: '10000',
        totalNetAmount: '10000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '10000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [secOpt, secStk]);
    const balance = out.securityBalances.get('SEC_XYZ');

    const passed = Number(balance?.quantity) === 100 && Number(balance?.totalAcbCad) === 10500 && Number(balance?.acbPerUnitCad) === 105;

    results.push({
      id: 'TEST_10',
      name: 'Option Four-Way Matrix: Long Call Exercise Basis Rollover',
      category: 'Option Matrix (ITA s. 49)',
      description: 'Long call premium is added directly to acquired shares ACB; no standalone option gain or loss.',
      statutoryCitations: ['ITA s. 49(3)'],
      passed,
      expectedResult: 'Acquired Shares: 100, Share Total ACB: $10,500.00 CAD ($105.00/unit)',
      actualResult: `Acquired Shares: ${balance?.quantity}, Share Total ACB: $${balance?.totalAcbCad} CAD ($${balance?.acbPerUnitCad}/unit)`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 11: Two Taxable Accounts at Different Brokers, Same Stock = Single ACB Pool (ITA s. 47)
  // Buy 100 BNS @ $60 at IBKR ($6,000). Buy 100 BNS @ $80 at Questrade ($8,000).
  // Total Taxpayer Pool = 200 @ $70 ($14,000). Sell 100 at Questrade @ $90 ($9,000).
  // Proceeds = $9,000, ACB removed = $7,000, Gain = $2,000. Remaining = 100 @ $70 ($7,000).
  // ==========================================
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_BNS', symbol: 'BNS.TO', name: 'Bank of Nova Scotia', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'T11_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_BNS', symbol: 'BNS.TO', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '60', currency: 'CAD', commission: '0', totalGrossAmount: '6000',
        totalNetAmount: '6000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '6000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T11_2', accountId: 'ACCT_QUESTRADE', securityId: 'SEC_BNS', symbol: 'BNS.TO', date: '2024-02-15',
        transactionType: 'BUY', quantity: '100', price: '80', currency: 'CAD', commission: '0', totalGrossAmount: '8000',
        totalNetAmount: '8000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '8000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T11_3', accountId: 'ACCT_QUESTRADE', securityId: 'SEC_BNS', symbol: 'BNS.TO', date: '2024-04-20',
        transactionType: 'SELL', quantity: '100', price: '90', currency: 'CAD', commission: '0', totalGrossAmount: '9000',
        totalNetAmount: '9000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '9000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct, secondBrokerAcct], [sec]);
    const balance = out.securityBalances.get('SEC_BNS');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(balance?.quantity) === 100 && Number(balance?.totalAcbCad) === 7000 && Number(rgl?.recognizedGainLossCad) === 2000;

    results.push({
      id: 'TEST_11',
      name: 'Multi-Broker Non-Registered Taxpayer Level Single ACB Pool',
      category: 'Core Tax Engine (ITA s. 47)',
      description: 'ACB is pooled across all non-registered accounts at all brokers. Disposing at one broker uses the consolidated taxpayer-level ACB average.',
      statutoryCitations: ['ITA s. 47(1)'],
      passed,
      expectedResult: 'Realized Gain: $2,000.00 CAD, Consolidated Remaining ACB: $7,000.00 CAD ($70.00/unit)',
      actualResult: `Realized Gain: $${rgl?.recognizedGainLossCad} CAD, Consolidated Remaining ACB: $${balance?.totalAcbCad} CAD ($${balance?.acbPerUnitCad}/unit)`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // ==========================================
  // Test 12: Ineligible Foreign Spin-Off vs s. 86.1 Election
  // Parent 100 @ $100 ($10,000). Spin-off 100 SpinCo shares @ $20 FMV ($2,000).
  // Ineligible default: Foreign dividend $2,000, SpinCo opening ACB $2,000, Parent ACB remains $10,000.
  // ==========================================
  {
    const start = performance.now();
    const parentSec: SecurityMaster = { id: 'SEC_PARENT', symbol: 'PARENT', name: 'Parent US Corp', assetClass: 'STK', currency: 'CAD' };
    const spinSec: SecurityMaster = { id: 'SEC_SPINCO', symbol: 'SPINCO', name: 'SpinCo Inc', assetClass: 'STK', currency: 'CAD' };

    const txs: Transaction[] = [
      {
        id: 'T12_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_PARENT', symbol: 'PARENT', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '100', currency: 'CAD', commission: '0', totalGrossAmount: '10000',
        totalNetAmount: '10000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '10000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'T12_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_PARENT', symbol: 'PARENT', date: '2024-05-15',
        transactionType: 'SPINOFF', quantity: '0', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '0',
        totalNetAmount: '0', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '0', commissionCad: '0', totalOutlaysCad: '0',
        corporateAction: {
          treatment: 'INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND',
          statutoryBasis: 'ITA s. 90 Foreign Dividend in Kind',
          brokerDescription: 'Spin-off: 1 SpinCo per Parent share',
          oldSecurityId: 'SEC_PARENT',
          newSecurityId: 'SEC_SPINCO',
          newSharesReceived: '100',
          newShareFmvPerShare: '20',
        },
        status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [parentSec, spinSec]);
    const parentBal = out.securityBalances.get('SEC_PARENT');
    const spinBal = out.securityBalances.get('SEC_SPINCO');
    const divIncome = out.incomeDistributions.dividendsCad;

    const passed = Number(parentBal?.totalAcbCad) === 10000 && Number(spinBal?.totalAcbCad) === 2000 && Number(divIncome) === 2000;

    results.push({
      id: 'TEST_12',
      name: 'Ineligible Foreign Spin-Off (Default Treatment)',
      category: 'Corporate Actions (Spin-Offs)',
      description: 'Without s. 86.1 election, foreign spin-off is a taxable foreign dividend equal to FMV; SpinCo opening ACB = FMV, Parent ACB unchanged.',
      statutoryCitations: ['ITA s. 90', 'ITA s. 86.1', 'ITA s. 248'],
      passed,
      expectedResult: 'Foreign Dividend: $2,000.00 CAD, SpinCo ACB: $2,000.00 CAD, Parent ACB: $10,000.00 CAD',
      actualResult: `Foreign Dividend: $${divIncome} CAD, SpinCo ACB: $${spinBal?.totalAcbCad} CAD, Parent ACB: $${parentBal?.totalAcbCad} CAD`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // --- Strict Fixtures from V2 Spec ---

  const strictAccounts: Account[] = [
    { id: 'TAXABLE1', accountId: 'TAXABLE1', name: 'Taxable', broker: 'IBKR', accountType: 'taxable', baseCurrency: 'CAD', isHouseholdAffiliate: false }
  ];
  const strictSecurities: SecurityMaster[] = [
    { id: 'SEC1', symbol: 'ABC', name: 'ABC Corp', assetClass: 'STK', currency: 'CAD' }
  ];

  // 13. ROC Below Zero -> Capital Gain
  {
    const start = performance.now();
    const txs: Transaction[] = [
      { id: '1', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000', totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '2', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-01', transactionType: 'RETURN_OF_CAPITAL', quantity: '0', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '1100', totalNetAmount: '1100', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1100', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' }
    ];
    const out = runAcbEngine(txs, strictAccounts, strictSecurities);
    const bal = out.securityBalances.get('SEC1');
    const cg = out.totalNetRealizedGainLossCad;
    const passed = Number(bal?.totalAcbCad) === 0 && Number(cg) === 100;
    
    results.push({
      id: 'strict-1-roc-below-zero',
      name: 'ROC Reducing ACB Below Zero',
      category: 'ROC & Distributions',
      description: 'A Return of Capital that exceeds the current ACB should reduce ACB to 0 and trigger an immediate capital gain for the excess.',
      statutoryCitations: ['ITA s. 53(2)(a)', 'ITA s. 40(3)'],
      passed,
      expectedResult: 'ACB: $0, Capital Gain: $100',
      actualResult: `ACB: $${bal?.totalAcbCad || 0}, Capital Gain: $${cg}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 14. TFSA Superficial Loss Permanent Denial
  {
    const start = performance.now();
    const txs: Transaction[] = [
      { id: '1', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000', totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '2', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-01', transactionType: 'SELL', quantity: '100', price: '5', currency: 'CAD', commission: '0', totalGrossAmount: '500', totalNetAmount: '500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '500', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '3', accountId: 'TFSA_1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-05', transactionType: 'BUY', quantity: '100', price: '4', currency: 'CAD', commission: '0', totalGrossAmount: '400', totalNetAmount: '400', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '400', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' }
    ];
    const tfsaAccounts: Account[] = [...strictAccounts, { id: 'TFSA_1', accountId: 'TFSA_1', name: 'TFSA', broker: 'IBKR', accountType: 'tfsa', baseCurrency: 'CAD', isHouseholdAffiliate: true }];
    const out = runAcbEngine(txs, tfsaAccounts, strictSecurities);
    const sl = out.superficialLosses[0];
    const cg = out.totalNetRealizedGainLossCad;
    const passed = Number(cg) === 0 && sl?.isPermanentlyDeniedInRegistered === true && Number(sl?.deniedLossCad) === 500 && Number(sl?.allowedLossCad) === 0;
    
    results.push({
      id: 'strict-2-tfsa-sl',
      name: 'TFSA Superficial Loss Permanent Denial',
      category: 'Superficial Losses',
      description: 'Repurchasing identical property in a registered account (TFSA/RRSP) triggers a superficial loss that is permanently denied.',
      statutoryCitations: ['ITA s. 54', 'ITA s. 40(2)(g)(i)'],
      passed,
      expectedResult: 'Loss permanently denied, Taxable ACB unaffected, Net CG: $0',
      actualResult: `Loss permanently denied: ${sl?.isPermanentlyDeniedInRegistered}, Taxable ACB unaffected, Net CG: $${cg}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 15. Intraday ordering
  {
    const start = performance.now();
    const txs: Transaction[] = [
      { id: '2', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'SELL', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000', totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '1', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'BUY', quantity: '100', price: '5', currency: 'CAD', commission: '0', totalGrossAmount: '500', totalNetAmount: '500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '500', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' }
    ];
    const out = runAcbEngine(txs, strictAccounts, strictSecurities);
    const cg = out.totalNetRealizedGainLossCad;
    const passed = Number(cg) === 500;
    
    results.push({
      id: 'strict-3-intraday',
      name: 'Intraday Ordering (Buy before Sell)',
      category: 'Intraday Ordering',
      description: 'Acquisitions must be processed before dispositions occurring on the same day.',
      statutoryCitations: ['ITA s. 47(1)'],
      passed,
      expectedResult: 'Capital Gain: $500',
      actualResult: `Capital Gain: $${cg}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 16. Needs Review Takeover
  {
    const start = performance.now();
    const txs: Transaction[] = [
      { id: '1', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000', totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '2', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-01', transactionType: 'MERGER_MIXED', quantity: '100', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '0', totalNetAmount: '0', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '0', commissionCad: '0', totalOutlaysCad: '0', status: 'needs_review', source: 'TEST_FIXTURE', corporateAction: { treatment: 'CUSTOM_OVERRIDE', statutoryBasis: '', brokerDescription: '', oldSecurityId: 'SEC1' } }
    ];
    const out = runAcbEngine(txs, strictAccounts, strictSecurities);
    const passed = out.ledger.filter(l => l.transactionType === 'MERGER_MIXED').length === 0;
    
    results.push({
      id: 'strict-4-needs-review',
      name: 'Needs Review Blocks Ledger',
      category: 'System Integrity',
      description: 'Transactions flagged as needs_review must not be automatically processed or forced through provisional math.',
      statutoryCitations: ['System Integrity'],
      passed,
      expectedResult: 'Merger skipped',
      actualResult: passed ? 'Merger skipped' : 'Merger auto-processed',
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 17. Option Assignment Deduplication
  {
    const start = performance.now();
    const txs: Transaction[] = [
      // Sell 1 Put Contract
      { id: '1', accountId: 'TAXABLE1', securityId: 'OPT1', symbol: 'ABC PUT', date: '2024-01-01', transactionType: 'SELL_TO_OPEN_OPT', quantity: '1', price: '2', currency: 'CAD', commission: '0', totalGrossAmount: '200', totalNetAmount: '200', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '200', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      // IBKR Flex sends BOTH the ASSIGNED_SHORT_PUT for the option AND the ASSIGNED_SHORT_PUT for the stock leg on the same day
      { id: '2', accountId: 'TAXABLE1', securityId: 'OPT1', symbol: 'ABC PUT', date: '2024-02-01', transactionType: 'ASSIGNED_SHORT_PUT', quantity: '1', price: '0', currency: 'CAD', commission: '0', totalGrossAmount: '0', totalNetAmount: '0', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '0', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      // This is the stock leg from parser:
      { id: '3', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-01', transactionType: 'ASSIGNED_SHORT_PUT', quantity: '100', price: '50', currency: 'CAD', commission: '0', totalGrossAmount: '5000', totalNetAmount: '5000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '5000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' }
    ];
    const out = runAcbEngine(txs, strictAccounts, [{...strictSecurities[0]}, {id: 'OPT1', symbol: 'ABC PUT', name: 'ABC PUT', assetClass: 'OPT', currency: 'CAD', optionDetails: { underlyingSymbol: 'ABC', putOrCall: 'PUT', strike: 50, expiryDate: '2024-02-01', multiplier: 100 }}]);
    const bal = out.securityBalances.get('SEC1');
    const passed = Number(bal?.quantity) === 100 && Number(bal?.totalAcbCad) === 4800; // Strike 5000 - 200 premium = 4800
    
    results.push({
      id: 'strict-5-option-dedupe',
      name: 'Option Assignment Deduplication',
      category: 'Options & Derivatives',
      description: 'IBKR assignment trades that send both OPT and STK legs must not double-count the share acquisition.',
      statutoryCitations: ['ITA s. 49(4)'],
      passed,
      expectedResult: 'Qty: 100, ACB: $4800',
      actualResult: `Qty: ${bal?.quantity || 0}, ACB: $${bal?.totalAcbCad || 0}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 18. Two Open Lots Reconcile as 125
  {
    const start = performance.now();
    const txs: Transaction[] = [
      { id: '1', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-01-01', transactionType: 'BUY', quantity: '100', price: '10', currency: 'CAD', commission: '0', totalGrossAmount: '1000', totalNetAmount: '1000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1000', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
      { id: '2', accountId: 'TAXABLE1', securityId: 'SEC1', symbol: 'ABC', date: '2024-02-01', transactionType: 'BUY', quantity: '25', price: '12', currency: 'CAD', commission: '0', totalGrossAmount: '300', totalNetAmount: '300', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '300', commissionCad: '0', totalOutlaysCad: '0', status: 'auto_approved', source: 'TEST_FIXTURE' },
    ];
    const out = runAcbEngine(txs, strictAccounts, strictSecurities);
    const openPositions: OpenPosition[] = [
      { accountId: 'TAXABLE1', symbol: 'ABC', quantity: '100', costBasisCad: '1000', reportDate: '2024-12-31' },
      { accountId: 'TAXABLE1', symbol: 'ABC', quantity: '25', costBasisCad: '300', reportDate: '2024-12-31' },
    ];
    const breaks = reconcilePositions(out.securityBalances, openPositions);
    const bal = out.securityBalances.get('SEC1');
    const passed = Number(bal?.quantity) === 125 && breaks.length === 0;

    results.push({
      id: 'strict-6-open-positions-reconcile',
      name: 'Open Position Lot Reconciliation',
      category: 'Reconciliation',
      description: 'Two open lots of 100 and 25 for same security must sum using Decimal and reconcile cleanly as 125 without breaks.',
      statutoryCitations: ['Reconciliation Engine'],
      passed,
      expectedResult: 'Calculated Qty: 125, Reconciliation Breaks: 0',
      actualResult: `Calculated Qty: ${bal?.quantity || 0}, Reconciliation Breaks: ${breaks.length}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start
    });
  }

  // 19. In-kind 100 shares ACB $20 to TFSA at FMV $15 -> $0 allowed loss, permanently denied
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_X1', symbol: 'XFER1', name: 'Transfer Co 1', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'X1_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_X1', symbol: 'XFER1', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'X1_2', accountId: 'ACCT_TAXABLE', targetAccountId: 'ACCT_TFSA', destinationAccountType: 'tfsa', securityId: 'SEC_X1', symbol: 'XFER1', date: '2024-03-15',
        transactionType: 'TRANSFER_OUT', quantity: '100', price: '15', currency: 'CAD', commission: '0', totalGrossAmount: '1500',
        totalNetAmount: '1500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1500', commissionCad: '0', totalOutlaysCad: '0',
        reviewNotes: 'In-kind transfer to TFSA', status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct, tfsaAcct], [sec]);
    const balance = out.securityBalances.get('SEC_X1');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(balance?.quantity || 0) === 0 &&
      Number(balance?.totalAcbCad || 0) === 0 &&
      Number(rgl?.recognizedGainLossCad || 0) === 0 &&
      Number(rgl?.superficialLossDeniedCad || 0) === 500;

    results.push({
      id: 'transfer-tfsa-loss-denied',
      name: 'In-Kind Transfer to TFSA at Loss (ITA s. 40(2)(g)(iv))',
      category: 'Transfers',
      description: 'Transfer 100 shares ACB $20 ($2,000) to TFSA at FMV $15 ($1,500). Raw loss -$500 is 100% permanently denied ($0 allowed loss).',
      statutoryCitations: ['ITA s. 40(2)(g)(iv)'],
      passed,
      expectedResult: 'Recognized Gain/Loss: $0.00 CAD, Denied Loss: $500.00 CAD, Remaining Taxable Qty: 0',
      actualResult: `Recognized Gain/Loss: $${rgl?.recognizedGainLossCad} CAD, Denied Loss: $${rgl?.superficialLossDeniedCad} CAD, Remaining Taxable Qty: ${balance?.quantity || 0}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // 20. Same shares to TFSA at FMV $25 -> $500 gain
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_X2', symbol: 'XFER2', name: 'Transfer Co 2', assetClass: 'STK', currency: 'CAD' };
    const txs: Transaction[] = [
      {
        id: 'X2_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_X2', symbol: 'XFER2', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'X2_2', accountId: 'ACCT_TAXABLE', targetAccountId: 'ACCT_TFSA', destinationAccountType: 'tfsa', securityId: 'SEC_X2', symbol: 'XFER2', date: '2024-03-15',
        transactionType: 'TRANSFER_OUT', quantity: '100', price: '25', currency: 'CAD', commission: '0', totalGrossAmount: '2500',
        totalNetAmount: '2500', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2500', commissionCad: '0', totalOutlaysCad: '0',
        reviewNotes: 'In-kind transfer to TFSA', status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct, tfsaAcct], [sec]);
    const balance = out.securityBalances.get('SEC_X2');
    const rgl = out.realizedGainsLosses[0];

    const passed = Number(balance?.quantity || 0) === 0 &&
      Number(balance?.totalAcbCad || 0) === 0 &&
      Number(rgl?.recognizedGainLossCad || 0) === 500;

    results.push({
      id: 'transfer-tfsa-gain-recognized',
      name: 'In-Kind Transfer to TFSA at Gain (ITA s. 69 / s. 40(1))',
      category: 'Transfers',
      description: 'Transfer 100 shares ACB $20 ($2,000) to TFSA at FMV $25 ($2,500). $500 capital gain recognized in full.',
      statutoryCitations: ['ITA s. 40(1)'],
      passed,
      expectedResult: 'Recognized Gain: $500.00 CAD, Remaining Taxable Qty: 0',
      actualResult: `Recognized Gain: $${rgl?.recognizedGainLossCad} CAD, Remaining Taxable Qty: ${balance?.quantity || 0}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // 21. Taxable account A -> taxable account B, same taxpayer -> pool qty and ACB unchanged
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_X3', symbol: 'XFER3', name: 'Transfer Co 3', assetClass: 'STK', currency: 'CAD' };
    const taxableAcctB: Account = {
      id: 'ACCT_TAXABLE_B', accountId: 'U100101', name: 'IBKR Margin B', broker: 'IBKR', accountType: 'taxable', baseCurrency: 'CAD', isHouseholdAffiliate: false
    };

    const txs: Transaction[] = [
      {
        id: 'X3_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_X3', symbol: 'XFER3', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'X3_2', accountId: 'ACCT_TAXABLE', targetAccountId: 'ACCT_TAXABLE_B', destinationAccountType: 'taxable', securityId: 'SEC_X3', symbol: 'XFER3', date: '2024-03-15',
        transactionType: 'TRANSFER_OUT', quantity: '100', price: '22', currency: 'CAD', commission: '0', totalGrossAmount: '2200',
        totalNetAmount: '2200', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2200', commissionCad: '0', totalOutlaysCad: '0',
        reviewNotes: 'Transfer to Margin B', status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'X3_3', accountId: 'ACCT_TAXABLE_B', sourceAccountId: 'ACCT_TAXABLE', sourceAccountType: 'taxable', securityId: 'SEC_X3', symbol: 'XFER3', date: '2024-03-15',
        transactionType: 'TRANSFER_IN', quantity: '100', price: '22', currency: 'CAD', commission: '0', totalGrossAmount: '2200',
        totalNetAmount: '2200', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2200', commissionCad: '0', totalOutlaysCad: '0',
        reviewNotes: 'Transfer from Margin A', status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct, taxableAcctB], [sec]);
    const balance = out.securityBalances.get('SEC_X3');

    const passed = Number(balance?.quantity || 0) === 100 &&
      Number(balance?.totalAcbCad || 0) === 2000 &&
      out.realizedGainsLosses.length === 0;

    results.push({
      id: 'transfer-taxable-to-taxable',
      name: 'Taxable-to-Taxable Transfer (ITA s. 47 Unified Pool)',
      category: 'Transfers',
      description: 'Transfer 100 shares between Taxable A and Taxable B (same taxpayer). Pool quantity (100) and ACB ($2,000) remain unchanged with zero dispositions.',
      statutoryCitations: ['ITA s. 47(1)'],
      passed,
      expectedResult: 'Pool Qty: 100, Pool ACB: $2,000.00 CAD, Realized Dispositions: 0',
      actualResult: `Pool Qty: ${balance?.quantity || 0}, Pool ACB: $${balance?.totalAcbCad || 0} CAD, Realized Dispositions: ${out.realizedGainsLosses.length}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  // 22. Transfer OUT/IN with unknown account -> status needs_review, no deemed disposition posted
  {
    const start = performance.now();
    const sec: SecurityMaster = { id: 'SEC_X4', symbol: 'XFER4', name: 'Transfer Co 4', assetClass: 'STK', currency: 'CAD' };

    const txs: Transaction[] = [
      {
        id: 'X4_1', accountId: 'ACCT_TAXABLE', securityId: 'SEC_X4', symbol: 'XFER4', date: '2024-01-10',
        transactionType: 'BUY', quantity: '100', price: '20', currency: 'CAD', commission: '0', totalGrossAmount: '2000',
        totalNetAmount: '2000', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '2000', commissionCad: '0', totalOutlaysCad: '0',
        status: 'approved', source: 'TEST_FIXTURE',
      },
      {
        id: 'X4_2', accountId: 'ACCT_TAXABLE', securityId: 'SEC_X4', symbol: 'XFER4', date: '2024-03-15',
        transactionType: 'TRANSFER_OUT', quantity: '50', price: '25', currency: 'CAD', commission: '0', totalGrossAmount: '1250',
        totalNetAmount: '1250', fxRate: '1', fxRateSource: 'BANK_OF_CANADA', amountCad: '1250', commissionCad: '0', totalOutlaysCad: '0',
        reviewNotes: 'Transfer to unknown account', status: 'approved', source: 'TEST_FIXTURE',
      },
    ];

    const out = runAcbEngine(txs, [taxableAcct], [sec]);
    const balance = out.securityBalances.get('SEC_X4');

    const passed = txs[1].status === 'needs_review' &&
      Number(balance?.quantity || 0) === 100 &&
      Number(balance?.totalAcbCad || 0) === 2000 &&
      out.realizedGainsLosses.length === 0;

    results.push({
      id: 'transfer-unknown-account-needs-review',
      name: 'Transfer to Unknown Account (Needs Review, No Disposition)',
      category: 'Transfers',
      description: 'Transfer OUT to unknown destination marks transaction needs_review and does not post a deemed disposition.',
      statutoryCitations: [],
      passed,
      expectedResult: 'Status: needs_review, Pool Qty: 100, Dispositions: 0',
      actualResult: `Status: ${txs[1].status}, Pool Qty: ${balance?.quantity || 0}, Dispositions: ${out.realizedGainsLosses.length}`,
      auditTrail: out.auditTrail,
      executionTimeMs: performance.now() - start,
    });
  }

  return results;
}
