import { d, toMoney, toShares, Decimal } from './decimal';
import { Transaction, Account, SuperficialLossEvent } from '../types/tax';

export interface SuperficialLossCheckResult {
  isSuperficial: boolean;
  rawLossCad: string;
  deniedLossCad: string;
  allowedLossCad: string;
  replacementTransactionId?: string;
  replacementAccountId?: string;
  replacementDate?: string;
  isPermanentlyDeniedInRegistered: boolean;
  status: 'provisional' | 'final';
  explanation: string;
}

/**
 * Check if two dates are within the 61-day Canadian superficial loss window (-30 to +30 calendar days).
 */
export function isWithinSuperficialLossWindow(dispositionDate: string, checkDate: string): boolean {
  const d1 = new Date(dispositionDate).getTime();
  const d2 = new Date(checkDate).getTime();
  const diffDays = Math.abs((d2 - d1) / (1000 * 60 * 60 * 24));
  return diffDays <= 30;
}

/**
 * Check if the disposition is less than 30 days from today (provisional status).
 */
export function isProvisionalWindow(dispositionDate: string, referenceDate: string = '2026-08-22'): boolean {
  const d1 = new Date(dispositionDate).getTime();
  const dNow = new Date(referenceDate).getTime();
  const daysElapsed = (dNow - d1) / (1000 * 60 * 60 * 24);
  return daysElapsed < 30;
}

/**
 * Evaluates whether a realized loss on a disposition is denied under the Canadian Superficial Loss rules.
 */
export function evaluateSuperficialLoss(
  dispositionTx: Transaction,
  dispositionLossCad: Decimal | number | string, // Positive number representing the loss
  disposedSharesQty: Decimal | number | string,
  allTransactions: Transaction[],
  allAccounts: Map<string, Account>,
  postWindowSharesHeld: Decimal | number | string = 0,
  referenceDate: string = '2026-08-22'
): SuperficialLossCheckResult {
  const lossCad = d(dispositionLossCad);
  // If not a loss, superficial loss does not apply
  if (lossCad.isNegative() || lossCad.isZero()) {
    return {
      isSuperficial: false,
      rawLossCad: toMoney(0),
      deniedLossCad: toMoney(0),
      allowedLossCad: toMoney(0),
      isPermanentlyDeniedInRegistered: false,
      status: 'final',
      explanation: 'No capital loss occurred.',
    };
  }

  const disposedQty = d(disposedSharesQty);
  const dispDate = dispositionTx.date;
  const securityId = dispositionTx.securityId;

  // Search for acquisitions of identical property within [-30 days, +30 days] window
  // by the taxpayer or an affiliated account
  let totalAcquiredInWindow = new Decimal(0);
  let replacementTx: Transaction | null = null;
  let isRegisteredReplacement = false;

  for (const tx of allTransactions) {
    if (tx.id === dispositionTx.id || tx.securityId !== securityId) continue;

    // Check if this transaction is an acquisition (BUY, DRIP, ASSIGNED_PUT, TRANSFER_IN)
    const isAcquisition =
      tx.transactionType === 'BUY' ||
      tx.transactionType === 'DIVIDEND_REINVESTED' ||
      tx.transactionType === 'ASSIGNED_SHORT_PUT' ||
      tx.transactionType === 'EXERCISE_LONG_CALL' ||
      tx.transactionType === 'TRANSFER_IN';

    if (!isAcquisition) continue;

    const inWindow = isWithinSuperficialLossWindow(dispDate, tx.date);

    if (inWindow) {
      totalAcquiredInWindow = totalAcquiredInWindow.plus(d(tx.quantity));
      if (!replacementTx) {
        replacementTx = tx;
        const acct = allAccounts.get(tx.accountId);
        if (acct && acct.accountType !== 'taxable' && acct.accountType !== 'spouse_taxable' && acct.accountType !== 'affiliate_taxable') {
          isRegisteredReplacement = true;
        }
      }
    }
  }

  // Also check if taxpayer still holds identical property at the end of the window
  const hasRemainingPosition = d(postWindowSharesHeld).gt(0) || totalAcquiredInWindow.gt(0);

  if (totalAcquiredInWindow.gt(0) && hasRemainingPosition) {
    // Pro-rata denial formula under ITA s. 54:
    // Denied ratio = min(1, min(DisposedQty, AcquiredInWindowQty) / DisposedQty)
    const minOverlapQty = Decimal.min(disposedQty, totalAcquiredInWindow, d(postWindowSharesHeld).plus(totalAcquiredInWindow));
    const denialFraction = minOverlapQty.dividedBy(disposedQty);
    const deniedLoss = lossCad.times(denialFraction);
    const allowedLoss = lossCad.minus(deniedLoss);

    const isProvisional = isProvisionalWindow(dispDate, referenceDate);

    let explanation = `Superficial Loss under ITA s. 54 / s. 40(2)(g)(i): Acquired ${toShares(totalAcquiredInWindow)} identical shares within the 30-day window. Denied $${toMoney(deniedLoss)} CAD loss.`;
    if (isRegisteredReplacement) {
      explanation += ` Replacement acquired inside registered account (${replacementTx?.accountId}). Loss is PERMANENTLY DENIED with NO ACB adjustment.`;
    } else {
      explanation += ` Denied loss of $${toMoney(deniedLoss)} CAD is added to the ACB of the replacement identical property.`;
    }

    return {
      isSuperficial: true,
      rawLossCad: toMoney(lossCad),
      deniedLossCad: toMoney(deniedLoss),
      allowedLossCad: toMoney(allowedLoss),
      replacementTransactionId: replacementTx?.id,
      replacementAccountId: replacementTx?.accountId,
      replacementDate: replacementTx?.date,
      isPermanentlyDeniedInRegistered: isRegisteredReplacement,
      status: isProvisional ? 'provisional' : 'final',
      explanation,
    };
  }

  return {
    isSuperficial: false,
    rawLossCad: toMoney(lossCad),
    deniedLossCad: toMoney(0),
    allowedLossCad: toMoney(lossCad),
    isPermanentlyDeniedInRegistered: false,
    status: 'final',
    explanation: 'No replacement property acquired within 30-day window. Full capital loss recognized.',
  };
}
