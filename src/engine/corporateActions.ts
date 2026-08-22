import { d, toMoney, toShares, Decimal } from './decimal';
import { CorporateActionDetails, CorporateActionTreatment } from '../types/tax';

export interface CorporateActionCalculationResult {
  treatment: CorporateActionTreatment;
  statutoryBasis: string;
  
  // Disposition of old shares
  oldSharesDisposedQty: number;
  oldSharesAcbRemovedCad: number;
  proceedsCad: number;
  realizedCapitalGainCad: number;
  realizedCapitalLossCad: number;
  
  // Acquisition of new shares
  newSharesQty: number;
  newSharesTotalAcbCad: number;
  newSharesAcbPerUnitCad: number;
  
  // Remaining parent shares (e.g. for spin-offs or partial tenders)
  parentSharesRemainingQty: number;
  parentSharesRemainingAcbCad: number;
  parentSharesAcbPerUnitCad: number;
  
  // Non-capital income / distributions
  dividendIncomeCad: number;
  returnOfCapitalCad: number;
  
  explanation: string;
  reviewRequired: boolean;
}

/**
 * Classify raw broker corporate action text into a default suggested treatment.
 */
export function classifyBrokerCorporateAction(
  description: string,
  hasCash: boolean,
  hasNewShares: boolean,
  isCanadianTarget: boolean = true
): { suggestedTreatment: CorporateActionTreatment; statutoryBasis: string; confidence: 'high' | 'medium' | 'low'; notes: string } {
  const upper = description.toUpperCase();

  // Splits / Consolidations
  if (upper.includes('SPLIT') || upper.includes('STOCK SPLIT') || upper.includes('SUBDIVISION')) {
    return {
      suggestedTreatment: 'CONTINUITY_SPLIT',
      statutoryBasis: 'ITA s. 47(1) Stock Split Continuity',
      confidence: 'high',
      notes: 'Stock split adjusts quantity. Total ACB remains identical; per-unit ACB is reduced.',
    };
  }

  if (upper.includes('CONSOLIDATION') || upper.includes('REVERSE SPLIT')) {
    return {
      suggestedTreatment: 'CONTINUITY_SPLIT',
      statutoryBasis: 'ITA s. 47(1) Reverse Split Continuity',
      confidence: 'high',
      notes: 'Reverse split consolidates quantity. Total ACB remains identical; per-unit ACB is increased.',
    };
  }

  // Ticker / CUSIP / Name change
  if (upper.includes('NAME CHANGE') || upper.includes('SYMBOL CHANGE') || upper.includes('TICKER CHANGE') || upper.includes('CUSIP CHANGE')) {
    return {
      suggestedTreatment: 'CONTINUITY_TICKER_CHANGE',
      statutoryBasis: 'ITA s. 47 Identity Continuity',
      confidence: 'high',
      notes: 'Same issuer and class. No disposition occurs; existing ACB pool continues uninterrupted.',
    };
  }

  // Spin-offs
  if (upper.includes('SPINOFF') || upper.includes('SPIN-OFF') || upper.includes('DISTRIBUTION OF SHARES')) {
    if (isCanadianTarget) {
      return {
        suggestedTreatment: 'S86_REORGANIZATION',
        statutoryBasis: 'ITA s. 86 Pro-Rata Reorganization',
        confidence: 'medium',
        notes: 'Canadian corporate spin-off. ACB is apportioned between parent and spinco based on relative FMV.',
      };
    } else {
      return {
        suggestedTreatment: 'INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND',
        statutoryBasis: 'ITA s. 90 / s. 248 Foreign Dividend',
        confidence: 'medium',
        notes: 'Foreign spin-off default: treated as foreign dividend equal to spinco FMV, spinco ACB = FMV, parent ACB unchanged. User may elect ITA s. 86.1 if qualified.',
      };
    }
  }

  // Mixed Takeovers (Cash + Stock)
  if (hasCash && hasNewShares) {
    if (upper.includes('DIVIDEND') || upper.includes('SPECIAL DIV') || upper.includes('DISTRIBUTION')) {
      return {
        suggestedTreatment: 'MIXED_TAKEOVER_DIVIDEND',
        statutoryBasis: 'ITA s. 84 Deemed/Actual Takeover Dividend',
        confidence: 'low',
        notes: 'Broker text mentions dividend. Review required: check if cash is a special dividend, ROC, or capital boot.',
      };
    }

    if (isCanadianTarget) {
      return {
        suggestedTreatment: 'MIXED_CAPITAL_BOOT_ROLLOVER',
        statutoryBasis: 'ITA s. 85.1(2) Rollover with Boot',
        confidence: 'medium',
        notes: 'Canadian mixed takeover: Rollover applies to share portion; capital gain recognized only up to cash boot.',
      };
    } else {
      return {
        suggestedTreatment: 'MIXED_CAPITAL_BOOT_TAXABLE',
        statutoryBasis: 'ITA s. 40(1) Taxable Foreign Merger',
        confidence: 'medium',
        notes: 'Foreign mixed takeover: Full disposition at FMV of (cash + new shares). New shares take FMV as opening ACB.',
      };
    }
  }

  // Pure Share-for-share
  if (hasNewShares && !hasCash) {
    if (isCanadianTarget) {
      return {
        suggestedTreatment: 'S85_1_ROLLOVER',
        statutoryBasis: 'ITA s. 85.1 Automatic Share-for-Share Rollover',
        confidence: 'high',
        notes: 'Canadian share exchange rollover. Old ACB rolls over into new purchaser shares with $0 gain/loss recognized.',
      };
    } else {
      return {
        suggestedTreatment: 'FOREIGN_SHARE_EXCHANGE_TAXABLE',
        statutoryBasis: 'ITA s. 40(1) Foreign Share Exchange',
        confidence: 'medium',
        notes: 'Foreign share exchange: Taxable disposition at FMV of consideration unless specific relief is asserted.',
      };
    }
  }

  // All Cash Merger / Takeover
  if (hasCash && !hasNewShares) {
    return {
      suggestedTreatment: 'FULL_CASH_DISPOSITION',
      statutoryBasis: 'ITA s. 40(1)(a) Full Disposition',
      confidence: 'high',
      notes: 'All-cash takeover. Target shares fully disposed at cash proceeds in CAD. Target pool goes to zero.',
    };
  }

  return {
    suggestedTreatment: 'CUSTOM_OVERRIDE',
    statutoryBasis: 'ITA s. 40 / s. 47',
    confidence: 'low',
    notes: 'Complex or unclassified corporate action. Manual review and tax treatment selection required.',
  };
}

/**
 * Execute corporate action calculations deterministically with exact decimal math.
 */
export function calculateCorporateAction(
  details: CorporateActionDetails,
  oldSharesHeldQty: number,
  oldSharesTotalAcbCad: number
): CorporateActionCalculationResult {
  const treatment = details.treatment;
  const oldAcb = d(oldSharesTotalAcbCad);
  const oldQty = d(oldSharesHeldQty);
  const cashCad = d(details.totalCashReceived || 0);

  // 1. Stock Split / Consolidation (Continuity)
  if (treatment === 'CONTINUITY_SPLIT') {
    const ratio = d(details.ratio || 1);
    const newQty = oldQty.times(ratio);
    return {
      treatment,
      statutoryBasis: details.statutoryBasis || 'ITA s. 47(1) Split Continuity',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(oldAcb),
      newSharesAcbPerUnitCad: toMoney(oldAcb.dividedBy(newQty)),
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Split ratio ${details.ratio}:1 applied. Total ACB remains $${toMoney(oldAcb)} CAD across ${toShares(newQty)} units.`,
      reviewRequired: false,
    };
  }

  // 2. All-cash Takeover / Merger
  if (treatment === 'FULL_CASH_DISPOSITION') {
    const proceeds = cashCad;
    const gainOrLoss = proceeds.minus(oldAcb);
    const gain = gainOrLoss.isPositive() ? gainOrLoss : new Decimal(0);
    const loss = gainOrLoss.isNegative() ? gainOrLoss.abs() : new Decimal(0);

    return {
      treatment,
      statutoryBasis: details.statutoryBasis || 'ITA s. 40(1)(a)',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: toMoney(proceeds),
      realizedCapitalGainCad: toMoney(gain),
      realizedCapitalLossCad: toMoney(loss),
      newSharesQty: 0,
      newSharesTotalAcbCad: 0,
      newSharesAcbPerUnitCad: 0,
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `All-cash disposition of ${toShares(oldQty)} units at proceeds $${toMoney(proceeds)} CAD vs ACB $${toMoney(oldAcb)} CAD.`,
      reviewRequired: false,
    };
  }

  // 3. Canadian Share-for-share Rollover (ITA s. 85.1 / s. 86 / s. 87)
  if (treatment === 'S85_1_ROLLOVER' || treatment === 'S86_REORGANIZATION' || treatment === 'S87_AMALGAMATION') {
    const newQty = d(details.newSharesReceived || oldSharesHeldQty);
    return {
      treatment,
      statutoryBasis: details.statutoryBasis || 'ITA s. 85.1 Rollover',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(oldAcb),
      newSharesAcbPerUnitCad: toMoney(oldAcb.dividedBy(newQty)),
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Rollover under ${details.statutoryBasis}. Target ACB of $${toMoney(oldAcb)} CAD carried over into ${toShares(newQty)} new shares with $0 gain/loss recognized.`,
      reviewRequired: false,
    };
  }

  // 4. Foreign Share-for-Share Taxable (Default for US deals)
  if (treatment === 'FOREIGN_SHARE_EXCHANGE_TAXABLE') {
    const newQty = d(details.newSharesReceived || 0);
    const fmvNewPerShare = d(details.newShareFmvPerShare || 0);
    const fmvNewTotal = newQty.times(fmvNewPerShare);
    const proceeds = fmvNewTotal;
    const gainOrLoss = proceeds.minus(oldAcb);
    const gain = gainOrLoss.isPositive() ? gainOrLoss : new Decimal(0);
    const loss = gainOrLoss.isNegative() ? gainOrLoss.abs() : new Decimal(0);

    return {
      treatment,
      statutoryBasis: 'ITA s. 40(1) Foreign Share Exchange Taxable',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: toMoney(proceeds),
      realizedCapitalGainCad: toMoney(gain),
      realizedCapitalLossCad: toMoney(loss),
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(fmvNewTotal),
      newSharesAcbPerUnitCad: toMoney(fmvNewPerShare),
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Foreign share exchange taxable disposition. Target disposed at FMV $${toMoney(proceeds)} CAD; new shares acquired with opening ACB $${toMoney(fmvNewTotal)} CAD.`,
      reviewRequired: false,
    };
  }

  // 5. Mixed Deal: Capital Boot Taxable (Worked Example 4.D.4)
  if (treatment === 'MIXED_CAPITAL_BOOT_TAXABLE') {
    const newQty = d(details.newSharesReceived || 0);
    const fmvNewPerShare = d(details.newShareFmvPerShare || 0);
    const fmvNewTotal = newQty.times(fmvNewPerShare);
    const proceeds = cashCad.plus(fmvNewTotal);
    const gainOrLoss = proceeds.minus(oldAcb);
    const gain = gainOrLoss.isPositive() ? gainOrLoss : new Decimal(0);
    const loss = gainOrLoss.isNegative() ? gainOrLoss.abs() : new Decimal(0);

    return {
      treatment,
      statutoryBasis: 'ITA s. 40(1) Mixed Consideration Taxable',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: toMoney(proceeds),
      realizedCapitalGainCad: toMoney(gain),
      realizedCapitalLossCad: toMoney(loss),
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(fmvNewTotal),
      newSharesAcbPerUnitCad: toMoney(fmvNewPerShare),
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Taxable mixed deal: Consideration = Cash ($${toMoney(cashCad)}) + New Stock FMV ($${toMoney(fmvNewTotal)}) = $${toMoney(proceeds)} CAD. Recognized gain/loss = $${toMoney(gainOrLoss)} CAD. New shares opening ACB = $${toMoney(fmvNewTotal)} CAD.`,
      reviewRequired: false,
    };
  }

  // 6. Mixed Deal: Rollover with Boot (Worked Examples 4.D.5 & 4.D.6)
  if (treatment === 'MIXED_CAPITAL_BOOT_ROLLOVER') {
    const newQty = d(details.newSharesReceived || 0);
    const fmvNewPerShare = d(details.newShareFmvPerShare || 0);
    const fmvNewTotal = newQty.times(fmvNewPerShare);
    const fmvTotal = cashCad.plus(fmvNewTotal);
    const inherentGainOrLoss = fmvTotal.minus(oldAcb);

    if (inherentGainOrLoss.isPositive()) {
      // Inherent gain case (4.D.5)
      const recognizedGain = Decimal.min(inherentGainOrLoss, cashCad);
      const newAcb = oldAcb.minus(cashCad).plus(recognizedGain);
      return {
        treatment,
        statutoryBasis: 'ITA s. 85.1(2) Rollover with Boot (Gain Case)',
        oldSharesDisposedQty: toShares(oldQty),
        oldSharesAcbRemovedCad: toMoney(oldAcb),
        proceedsCad: toMoney(cashCad),
        realizedCapitalGainCad: toMoney(recognizedGain),
        realizedCapitalLossCad: 0,
        newSharesQty: toShares(newQty),
        newSharesTotalAcbCad: toMoney(newAcb),
        newSharesAcbPerUnitCad: toMoney(newAcb.dividedBy(newQty)),
        parentSharesRemainingQty: 0,
        parentSharesRemainingAcbCad: 0,
        parentSharesAcbPerUnitCad: 0,
        dividendIncomeCad: 0,
        returnOfCapitalCad: 0,
        explanation: `Canadian rollover with boot: Inherent gain $${toMoney(inherentGainOrLoss)} CAD. Recognized gain = min(inherent gain, cash) = $${toMoney(recognizedGain)} CAD. New shares ACB = $${toMoney(newAcb)} CAD.`,
        reviewRequired: false,
      };
    } else {
      // Inherent loss case (4.D.6) - Rollover denies immediate loss; ACB reduced by cash received
      const newAcb = oldAcb.minus(cashCad);
      return {
        treatment,
        statutoryBasis: 'ITA s. 85.1(2) Rollover with Boot (Loss Case)',
        oldSharesDisposedQty: toShares(oldQty),
        oldSharesAcbRemovedCad: toMoney(oldAcb),
        proceedsCad: toMoney(cashCad),
        realizedCapitalGainCad: 0,
        realizedCapitalLossCad: 0, // No loss recognized on rollover
        newSharesQty: toShares(newQty),
        newSharesTotalAcbCad: toMoney(newAcb),
        newSharesAcbPerUnitCad: toMoney(newAcb.dividedBy(newQty)),
        parentSharesRemainingQty: 0,
        parentSharesRemainingAcbCad: 0,
        parentSharesAcbPerUnitCad: 0,
        dividendIncomeCad: 0,
        returnOfCapitalCad: 0,
        explanation: `Canadian rollover with boot (inherent loss): No loss recognized under s. 85.1. New shares ACB = Old ACB ($${toMoney(oldAcb)}) - Cash ($${toMoney(cashCad)}) = $${toMoney(newAcb)} CAD.`,
        reviewRequired: false,
      };
    }
  }

  // 7. Mixed Deal: Cash Leg as Takeover Dividend (Worked Example 4.D.7)
  if (treatment === 'MIXED_TAKEOVER_DIVIDEND') {
    const newQty = d(details.newSharesReceived || 0);
    const dividendAmount = cashCad;
    // Rollover for share leg: ACB rolls over into new shares
    const newAcb = oldAcb;

    return {
      treatment,
      statutoryBasis: 'ITA s. 84(2) Takeover Deemed Dividend + s. 85.1 Rollover',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(newAcb),
      newSharesAcbPerUnitCad: toMoney(newAcb.dividedBy(newQty)),
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: toMoney(dividendAmount),
      returnOfCapitalCad: 0,
      explanation: `Cash leg treated as takeover dividend ($${toMoney(dividendAmount)} CAD). Share exchange on rollover: New shares ACB = $${toMoney(newAcb)} CAD. Dividend does not reduce share ACB.`,
      reviewRequired: false,
    };
  }

  // 8. Mixed Deal: Cash Leg as Return of Capital
  if (treatment === 'MIXED_RETURN_OF_CAPITAL') {
    const newQty = d(details.newSharesReceived || 0);
    const rocAmount = cashCad;
    let newAcb = oldAcb.minus(rocAmount);
    let rocCapitalGain = new Decimal(0);

    if (newAcb.isNegative()) {
      rocCapitalGain = newAcb.abs();
      newAcb = new Decimal(0);
    }

    return {
      treatment,
      statutoryBasis: 'ITA s. 53(2)(a) Return of Capital Distribution',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: 0,
      realizedCapitalGainCad: toMoney(rocCapitalGain),
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(newQty),
      newSharesTotalAcbCad: toMoney(newAcb),
      newSharesAcbPerUnitCad: newQty.isPositive() ? toMoney(newAcb.dividedBy(newQty)) : 0,
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: toMoney(rocAmount),
      explanation: `Cash leg treated as Return of Capital ($${toMoney(rocAmount)} CAD). ACB reduced to $${toMoney(newAcb)} CAD. Excess over zero ($${toMoney(rocCapitalGain)} CAD) recognized as capital gain under s. 40(3).`,
      reviewRequired: false,
    };
  }

  // 9. Eligible Foreign Spin-off with s. 86.1 Election
  if (treatment === 'S86_1_ELIGIBLE_SPINOFF') {
    const spincoQty = d(details.newSharesReceived || 0);
    const spincoFmvTotal = d(details.newShareFmvPerShare || 0).times(spincoQty);
    const parentRemainingQty = d(details.ratio ? oldQty.times(details.ratio) : oldQty);
    const parentFmvTotal = d(details.targetShareFmvAtEffectiveDate || 0).times(parentRemainingQty);
    const totalFmv = parentFmvTotal.plus(spincoFmvTotal);

    const spincoAllocatedAcb = totalFmv.isPositive() ? oldAcb.times(spincoFmvTotal.dividedBy(totalFmv)) : oldAcb.times(0.2);
    const parentAllocatedAcb = oldAcb.minus(spincoAllocatedAcb);

    return {
      treatment,
      statutoryBasis: 'ITA s. 86.1 Eligible Foreign Spin-Off Election',
      oldSharesDisposedQty: 0,
      oldSharesAcbRemovedCad: 0,
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(spincoQty),
      newSharesTotalAcbCad: toMoney(spincoAllocatedAcb),
      newSharesAcbPerUnitCad: toMoney(spincoAllocatedAcb.dividedBy(spincoQty)),
      parentSharesRemainingQty: toShares(parentRemainingQty),
      parentSharesRemainingAcbCad: toMoney(parentAllocatedAcb),
      parentSharesAcbPerUnitCad: toMoney(parentAllocatedAcb.dividedBy(parentRemainingQty)),
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Section 86.1 Election: Parent ACB $${toMoney(oldAcb)} CAD allocated pro-rata to FMV between Parent ($${toMoney(parentAllocatedAcb)} CAD) and SpinCo ($${toMoney(spincoAllocatedAcb)} CAD). $0 income inclusion.`,
      reviewRequired: false,
    };
  }

  // 10. Ineligible Foreign Spin-off (Default)
  if (treatment === 'INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND') {
    const spincoQty = d(details.newSharesReceived || 0);
    const spincoFmvPerShare = d(details.newShareFmvPerShare || 0);
    const spincoFmvTotal = spincoQty.times(spincoFmvPerShare);

    return {
      treatment,
      statutoryBasis: 'ITA s. 90 Foreign Dividend in Kind',
      oldSharesDisposedQty: 0,
      oldSharesAcbRemovedCad: 0,
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: 0,
      newSharesQty: toShares(spincoQty),
      newSharesTotalAcbCad: toMoney(spincoFmvTotal),
      newSharesAcbPerUnitCad: toMoney(spincoFmvPerShare),
      parentSharesRemainingQty: toShares(oldQty),
      parentSharesRemainingAcbCad: toMoney(oldAcb),
      parentSharesAcbPerUnitCad: toMoney(oldAcb.dividedBy(oldQty)),
      dividendIncomeCad: toMoney(spincoFmvTotal),
      returnOfCapitalCad: 0,
      explanation: `Ineligible Foreign Spin-off: Taxable foreign dividend of $${toMoney(spincoFmvTotal)} CAD. SpinCo opening ACB = $${toMoney(spincoFmvTotal)} CAD. Parent ACB remains $${toMoney(oldAcb)} CAD.`,
      reviewRequired: false,
    };
  }

  // 11. Worthless Securities s. 50(1) Bad Debt Election
  if (treatment === 'S50_1_BAD_DEBT_ELECTION') {
    return {
      treatment,
      statutoryBasis: 'ITA s. 50(1) Deemed Disposition of Worthless Property',
      oldSharesDisposedQty: toShares(oldQty),
      oldSharesAcbRemovedCad: toMoney(oldAcb),
      proceedsCad: 0,
      realizedCapitalGainCad: 0,
      realizedCapitalLossCad: toMoney(oldAcb),
      newSharesQty: 0,
      newSharesTotalAcbCad: 0,
      newSharesAcbPerUnitCad: 0,
      parentSharesRemainingQty: 0,
      parentSharesRemainingAcbCad: 0,
      parentSharesAcbPerUnitCad: 0,
      dividendIncomeCad: 0,
      returnOfCapitalCad: 0,
      explanation: `Section 50(1) Election: Deemed disposition of ${toShares(oldQty)} worthless shares at $0 proceeds. Capital loss of $${toMoney(oldAcb)} CAD recognized.`,
      reviewRequired: false,
    };
  }

  // Default fallback
  return {
    treatment: 'CUSTOM_OVERRIDE',
    statutoryBasis: 'ITA s. 40',
    oldSharesDisposedQty: 0,
    oldSharesAcbRemovedCad: 0,
    proceedsCad: 0,
    realizedCapitalGainCad: 0,
    realizedCapitalLossCad: 0,
    newSharesQty: 0,
    newSharesTotalAcbCad: 0,
    newSharesAcbPerUnitCad: 0,
    parentSharesRemainingQty: toShares(oldQty),
    parentSharesRemainingAcbCad: toMoney(oldAcb),
    parentSharesAcbPerUnitCad: toMoney(oldAcb.dividedBy(oldQty)),
    dividendIncomeCad: 0,
    returnOfCapitalCad: 0,
    explanation: 'Unclassified corporate action. Manual review needed.',
    reviewRequired: true,
  };
}
