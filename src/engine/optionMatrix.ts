import { d, toMoney, toShares, Decimal } from './decimal';
import { Transaction, RealizedGainLoss } from '../types/tax';

export interface OptionPositionState {
  seriesKey: string;
  underlyingSymbol: string;
  putOrCall: 'PUT' | 'CALL';
  strike: number;
  expiryDate: string;
  multiplier: number;
  
  // Long contracts pool
  longContracts: number;
  totalLongAcbCad: number;
  longAcbPerContractCad: number;
  
  // Short contracts pool
  shortContracts: number;
  totalUnearnedPremiumCad: number;
  unearnedPremiumPerContractCad: number;
}

export interface OptionTaxEffect {
  isShareTransaction: boolean;
  shareDeltaQty: number;
  shareCostCad: number; // Added to share ACB
  shareProceedsCad: number; // Proceeds of disposition for shares
  
  isOptionDisposition: boolean;
  optionGainLossCad: number;
  optionExplanation: string;
  statutoryBasis: string;
}

/**
 * Generate a unique identical property series key for an option contract.
 */
export function getOptionSeriesKey(
  underlyingSymbol: string,
  putOrCall: 'PUT' | 'CALL',
  strike: number,
  expiryDate: string,
  multiplier: number = 100
): string {
  return `OPT_${underlyingSymbol.toUpperCase()}_${putOrCall.toUpperCase()}_${strike.toFixed(2)}_${expiryDate}_M${multiplier}`;
}

/**
 * Calculate the exact Canadian tax effect for option lifecycle events under CRA capital property practice.
 */
export function evaluateOptionTaxEffect(
  tx: Transaction,
  optionState: OptionPositionState,
  underlyingCurrentSharesHeld: number = 0,
  underlyingCurrentAcbCad: number = 0
): { effect: OptionTaxEffect; updatedState: OptionPositionState } {
  const multiplier = optionState.multiplier || 100;
  const contracts = d(tx.quantity);
  const premiumCad = d(tx.amountCad).abs();
  const commCad = d(tx.commissionCad || 0);
  const strikeTotalCad = d(optionState.strike).times(contracts).times(multiplier).times(tx.fxRate || 1);

  let updated = { ...optionState };

  switch (tx.transactionType) {
    // 1. BUY TO OPEN LONG OPTION
    case 'BUY_TO_OPEN_OPT': {
      const addedAcb = premiumCad.plus(commCad);
      const newLongQty = d(updated.longContracts).plus(contracts);
      const newLongAcb = d(updated.totalLongAcbCad).plus(addedAcb);

      updated.longContracts = toShares(newLongQty);
      updated.totalLongAcbCad = toMoney(newLongAcb);
      updated.longAcbPerContractCad = newLongQty.isPositive() ? toMoney(newLongAcb.dividedBy(newLongQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: false,
          optionGainLossCad: 0,
          optionExplanation: `Bought ${tx.quantity} long option contracts. Added $${toMoney(addedAcb)} CAD to option ACB pool.`,
          statutoryBasis: 'ITA s. 47(1) Option ACB Pool',
        },
        updatedState: updated,
      };
    }

    // 2. SELL TO CLOSE LONG OPTION
    case 'SELL_TO_CLOSE_OPT': {
      const perUnitAcb = d(updated.longAcbPerContractCad);
      const acbRemoved = perUnitAcb.times(contracts);
      const netProceeds = premiumCad.minus(commCad);
      const gainOrLoss = netProceeds.minus(acbRemoved);

      const remainingQty = Decimal.max(0, d(updated.longContracts).minus(contracts));
      const remainingAcb = Decimal.max(0, d(updated.totalLongAcbCad).minus(acbRemoved));

      updated.longContracts = toShares(remainingQty);
      updated.totalLongAcbCad = toMoney(remainingAcb);
      updated.longAcbPerContractCad = remainingQty.isPositive() ? toMoney(remainingAcb.dividedBy(remainingQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: true,
          optionGainLossCad: toMoney(gainOrLoss),
          optionExplanation: `Sold to close ${tx.quantity} long option contracts. Proceeds $${toMoney(netProceeds)} CAD vs ACB $${toMoney(acbRemoved)} CAD. Realized gain/loss: $${toMoney(gainOrLoss)} CAD.`,
          statutoryBasis: 'ITA s. 40(1)(a) Long Option Disposition',
        },
        updatedState: updated,
      };
    }

    // 3. SELL TO OPEN SHORT OPTION (WRITING)
    case 'SELL_TO_OPEN_OPT': {
      const netPremiumReceived = premiumCad.minus(commCad);
      const newShortQty = d(updated.shortContracts).plus(contracts);
      const newUnearned = d(updated.totalUnearnedPremiumCad).plus(netPremiumReceived);

      updated.shortContracts = toShares(newShortQty);
      updated.totalUnearnedPremiumCad = toMoney(newUnearned);
      updated.unearnedPremiumPerContractCad = newShortQty.isPositive() ? toMoney(newUnearned.dividedBy(newShortQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: false,
          optionGainLossCad: 0,
          optionExplanation: `Wrote ${tx.quantity} short contracts. Parked $${toMoney(netPremiumReceived)} CAD as unearned premium.`,
          statutoryBasis: 'ITA s. 49(1) Grant of Option (Unearned Premium)',
        },
        updatedState: updated,
      };
    }

    // 4. BUY TO CLOSE SHORT OPTION
    case 'BUY_TO_CLOSE_OPT': {
      const perUnitUnearned = d(updated.unearnedPremiumPerContractCad);
      const unearnedClosed = perUnitUnearned.times(contracts);
      const costToClose = premiumCad.plus(commCad);
      const gainOrLoss = unearnedClosed.minus(costToClose);

      const remainingShortQty = Decimal.max(0, d(updated.shortContracts).minus(contracts));
      const remainingUnearned = Decimal.max(0, d(updated.totalUnearnedPremiumCad).minus(unearnedClosed));

      updated.shortContracts = toShares(remainingShortQty);
      updated.totalUnearnedPremiumCad = toMoney(remainingUnearned);
      updated.unearnedPremiumPerContractCad = remainingShortQty.isPositive() ? toMoney(remainingUnearned.dividedBy(remainingShortQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: true,
          optionGainLossCad: toMoney(gainOrLoss),
          optionExplanation: `Bought to close ${tx.quantity} short contracts. Unearned premium $${toMoney(unearnedClosed)} CAD vs closing cost $${toMoney(costToClose)} CAD. Realized gain/loss: $${toMoney(gainOrLoss)} CAD.`,
          statutoryBasis: 'ITA s. 49(2) Short Option Buy-to-Close',
        },
        updatedState: updated,
      };
    }

    // 5. LONG OPTION EXPIRES WORTHLESS
    case 'OPT_EXPIRY_LONG': {
      const perUnitAcb = d(updated.longAcbPerContractCad);
      const lossAmount = perUnitAcb.times(contracts);

      const remainingQty = Decimal.max(0, d(updated.longContracts).minus(contracts));
      const remainingAcb = Decimal.max(0, d(updated.totalLongAcbCad).minus(lossAmount));

      updated.longContracts = toShares(remainingQty);
      updated.totalLongAcbCad = toMoney(remainingAcb);
      updated.longAcbPerContractCad = remainingQty.isPositive() ? toMoney(remainingAcb.dividedBy(remainingQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: true,
          optionGainLossCad: toMoney(lossAmount.negated()),
          optionExplanation: `Long option expired worthless. Capital loss realized equal to option ACB: -$${toMoney(lossAmount)} CAD.`,
          statutoryBasis: 'ITA s. 40(1)(a) & s. 54 Long Option Expiry',
        },
        updatedState: updated,
      };
    }

    // 6. SHORT OPTION EXPIRES UNEXERCISED
    case 'OPT_EXPIRY_SHORT': {
      const perUnitUnearned = d(updated.unearnedPremiumPerContractCad);
      const gainAmount = perUnitUnearned.times(contracts);

      const remainingShortQty = Decimal.max(0, d(updated.shortContracts).minus(contracts));
      const remainingUnearned = Decimal.max(0, d(updated.totalUnearnedPremiumCad).minus(gainAmount));

      updated.shortContracts = toShares(remainingShortQty);
      updated.totalUnearnedPremiumCad = toMoney(remainingUnearned);
      updated.unearnedPremiumPerContractCad = remainingShortQty.isPositive() ? toMoney(remainingUnearned.dividedBy(remainingShortQty)) : 0;

      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: true,
          optionGainLossCad: toMoney(gainAmount),
          optionExplanation: `Short option expired unexercised. Capital gain realized equal to unearned premium: +$${toMoney(gainAmount)} CAD.`,
          statutoryBasis: 'ITA s. 49(2) Short Option Expiry Gain',
        },
        updatedState: updated,
      };
    }

    // 7. EXERCISE LONG CALL (Acquires shares, rolls premium into share ACB)
    case 'EXERCISE_LONG_CALL': {
      const perUnitAcb = d(updated.longAcbPerContractCad);
      const optionAcbTransferred = perUnitAcb.times(contracts);
      const totalShareCost = strikeTotalCad.plus(optionAcbTransferred).plus(commCad);
      const sharesAcquired = contracts.times(multiplier);

      const remainingQty = Decimal.max(0, d(updated.longContracts).minus(contracts));
      const remainingAcb = Decimal.max(0, d(updated.totalLongAcbCad).minus(optionAcbTransferred));

      updated.longContracts = toShares(remainingQty);
      updated.totalLongAcbCad = toMoney(remainingAcb);
      updated.longAcbPerContractCad = remainingQty.isPositive() ? toMoney(remainingAcb.dividedBy(remainingQty)) : 0;

      return {
        effect: {
          isShareTransaction: true,
          shareDeltaQty: toShares(sharesAcquired),
          shareCostCad: toMoney(totalShareCost),
          shareProceedsCad: 0,
          isOptionDisposition: false, // Basis rolled into shares; no separate option gain
          optionGainLossCad: 0,
          optionExplanation: `Exercised Long Call: Acquired ${toShares(sharesAcquired)} shares. Share ACB = Strike ($${toMoney(strikeTotalCad)}) + Option Premium ($${toMoney(optionAcbTransferred)}) + Comm ($${toMoney(commCad)}) = $${toMoney(totalShareCost)} CAD.`,
          statutoryBasis: 'ITA s. 49(3) Long Call Exercise Basis Rollover',
        },
        updatedState: updated,
      };
    }

    // 8. ASSIGNED ON SHORT CALL (Shares called away)
    case 'ASSIGNED_SHORT_CALL': {
      const perUnitUnearned = d(updated.unearnedPremiumPerContractCad);
      const unearnedPremiumTransferred = perUnitUnearned.times(contracts);
      const shareProceeds = strikeTotalCad.plus(unearnedPremiumTransferred).minus(commCad);
      const sharesDelivered = contracts.times(multiplier);

      const remainingShortQty = Decimal.max(0, d(updated.shortContracts).minus(contracts));
      const remainingUnearned = Decimal.max(0, d(updated.totalUnearnedPremiumCad).minus(unearnedPremiumTransferred));

      updated.shortContracts = toShares(remainingShortQty);
      updated.totalUnearnedPremiumCad = toMoney(remainingUnearned);
      updated.unearnedPremiumPerContractCad = remainingShortQty.isPositive() ? toMoney(remainingUnearned.dividedBy(remainingShortQty)) : 0;

      return {
        effect: {
          isShareTransaction: true,
          shareDeltaQty: toShares(sharesDelivered.negated()),
          shareCostCad: 0,
          shareProceedsCad: toMoney(shareProceeds),
          isOptionDisposition: false, // Rolled into share proceeds
          optionGainLossCad: 0,
          optionExplanation: `Assigned on Short Call: Delivered ${toShares(sharesDelivered)} shares. Total share proceeds = Strike ($${toMoney(strikeTotalCad)}) + Option Premium Received ($${toMoney(unearnedPremiumTransferred)}) - Comm ($${toMoney(commCad)}) = $${toMoney(shareProceeds)} CAD.`,
          statutoryBasis: 'ITA s. 49(4) Short Call Assignment Share Disposition',
        },
        updatedState: updated,
      };
    }

    // 9. EXERCISE LONG PUT (Disposes shares)
    case 'EXERCISE_LONG_PUT': {
      const perUnitAcb = d(updated.longAcbPerContractCad);
      const optionAcbTransferred = perUnitAcb.times(contracts);
      const shareProceeds = strikeTotalCad.minus(optionAcbTransferred).minus(commCad);
      const sharesDelivered = contracts.times(multiplier);

      const remainingQty = Decimal.max(0, d(updated.longContracts).minus(contracts));
      const remainingAcb = Decimal.max(0, d(updated.totalLongAcbCad).minus(optionAcbTransferred));

      updated.longContracts = toShares(remainingQty);
      updated.totalLongAcbCad = toMoney(remainingAcb);
      updated.longAcbPerContractCad = remainingQty.isPositive() ? toMoney(remainingAcb.dividedBy(remainingQty)) : 0;

      return {
        effect: {
          isShareTransaction: true,
          shareDeltaQty: toShares(sharesDelivered.negated()),
          shareCostCad: 0,
          shareProceedsCad: toMoney(shareProceeds),
          isOptionDisposition: false,
          optionGainLossCad: 0,
          optionExplanation: `Exercised Long Put: Delivered ${toShares(sharesDelivered)} shares. Total share proceeds = Strike ($${toMoney(strikeTotalCad)}) - Option Premium Paid ($${toMoney(optionAcbTransferred)}) - Comm ($${toMoney(commCad)}) = $${toMoney(shareProceeds)} CAD.`,
          statutoryBasis: 'ITA s. 49(3) Long Put Exercise Share Disposition',
        },
        updatedState: updated,
      };
    }

    // 10. ASSIGNED ON SHORT PUT (Shares put to you)
    case 'ASSIGNED_SHORT_PUT': {
      const perUnitUnearned = d(updated.unearnedPremiumPerContractCad);
      const unearnedPremiumTransferred = perUnitUnearned.times(contracts);
      const totalShareCost = strikeTotalCad.minus(unearnedPremiumTransferred).plus(commCad);
      const sharesAcquired = contracts.times(multiplier);

      const remainingShortQty = Decimal.max(0, d(updated.shortContracts).minus(contracts));
      const remainingUnearned = Decimal.max(0, d(updated.totalUnearnedPremiumCad).minus(unearnedPremiumTransferred));

      updated.shortContracts = toShares(remainingShortQty);
      updated.totalUnearnedPremiumCad = toMoney(remainingUnearned);
      updated.unearnedPremiumPerContractCad = remainingShortQty.isPositive() ? toMoney(remainingUnearned.dividedBy(remainingShortQty)) : 0;

      return {
        effect: {
          isShareTransaction: true,
          shareDeltaQty: toShares(sharesAcquired),
          shareCostCad: toMoney(totalShareCost),
          shareProceedsCad: 0,
          isOptionDisposition: false,
          optionGainLossCad: 0,
          optionExplanation: `Assigned on Short Put: Put ${toShares(sharesAcquired)} shares. Share ACB = Strike ($${toMoney(strikeTotalCad)}) - Option Premium Received ($${toMoney(unearnedPremiumTransferred)}) + Comm ($${toMoney(commCad)}) = $${toMoney(totalShareCost)} CAD.`,
          statutoryBasis: 'ITA s. 49(4) Short Put Assignment Basis Reduction',
        },
        updatedState: updated,
      };
    }

    default:
      return {
        effect: {
          isShareTransaction: false,
          shareDeltaQty: 0,
          shareCostCad: 0,
          shareProceedsCad: 0,
          isOptionDisposition: false,
          optionGainLossCad: 0,
          optionExplanation: 'Unrecognized option transaction type',
          statutoryBasis: 'ITA s. 40',
        },
        updatedState: updated,
      };
  }
}
