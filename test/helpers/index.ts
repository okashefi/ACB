import { Account, SecurityMaster, Transaction, TransactionType, Currency } from '../../src/types/tax';
import { d, toMoney, toShares, toRate, Decimal } from '../../src/engine/decimal';

export function createMockAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'ACCT_TAXABLE',
    accountId: 'U100100',
    name: 'Standard Taxable Account',
    broker: 'IBKR',
    accountType: 'taxable',
    baseCurrency: 'CAD',
    isHouseholdAffiliate: false,
    ...overrides,
  };
}

export function createMockSecurity(overrides: Partial<SecurityMaster> = {}): SecurityMaster {
  const symbol = overrides.symbol || 'ABC';
  return {
    id: `SEC_${symbol}`,
    symbol,
    name: `${symbol} Corporation`,
    assetClass: 'STK',
    currency: 'CAD',
    ...overrides,
  };
}

export function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const qty = d(overrides.quantity !== undefined ? overrides.quantity : 100);
  const prc = d(overrides.price !== undefined ? overrides.price : 10);
  const fx = d(overrides.fxRate !== undefined ? overrides.fxRate : 1);
  const comm = d(overrides.commission !== undefined ? overrides.commission : 0);
  const txType: TransactionType = overrides.transactionType || 'BUY';
  const currency: Currency = overrides.currency || 'CAD';

  const grossAmt = qty.times(prc);
  // Net amount for buy/adds is usually gross + commission, for sell is gross - commission
  const netAmt = txType.startsWith('SELL') || txType === 'TRANSFER_OUT'
    ? grossAmt.minus(comm)
    : grossAmt.plus(comm);

  const amountCad = toMoney(grossAmt.times(fx));
  const commissionCad = toMoney(comm.times(fx));
  const totalOutlaysCad = toMoney(comm.times(fx));

  return {
    id: `TX_${Math.random().toString(36).substr(2, 9)}`,
    accountId: 'ACCT_TAXABLE',
    securityId: 'SEC_ABC',
    symbol: 'ABC',
    date: '2026-01-02',
    transactionType: txType,
    quantity: toShares(qty),
    price: toMoney(prc),
    currency,
    commission: toMoney(comm),
    totalGrossAmount: toMoney(grossAmt),
    totalNetAmount: toMoney(netAmt),
    fxRate: toRate(fx),
    fxRateSource: fx.equals(1) ? 'BANK_OF_CANADA' : 'IBKR_ACTUAL',
    amountCad,
    commissionCad,
    totalOutlaysCad,
    status: 'approved',
    source: 'TEST_FIXTURE',
    ...overrides,
  };
}

/**
 * Asserts that two Decimal-like values are exactly equal to two decimal places
 */
export function expectDecimalEqual(actual: string | number | Decimal, expected: string | number | Decimal): boolean {
  return d(actual).equals(d(expected));
}

/**
 * Asserts that two Decimal-like values are within a given small epsilon (tolerance)
 */
export function expectDecimalCloseTo(actual: string | number | Decimal, expected: string | number | Decimal, precision: number = 0.0001): boolean {
  return d(actual).minus(d(expected)).abs().lessThan(precision);
}
