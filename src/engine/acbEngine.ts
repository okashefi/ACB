import { d, toMoney, toShares, toRate, Decimal } from './decimal';
import {
  Transaction,
  Account,
  SecurityMaster,
  AcbLedgerEntry,
  RealizedGainLoss,
  SuperficialLossEvent,
  SecurityRollforward,
  CalculationEngineOutput,
  TaxSettings,
  OpenPosition,
  ReconciliationBreak,
} from '../types/tax';
import { calculateCorporateAction } from './corporateActions';
import { evaluateOptionTaxEffect, OptionPositionState, getOptionSeriesKey } from './optionMatrix';
import { evaluateSuperficialLoss } from './superficialLoss';

interface SecurityBookState {
  securityId: string;
  symbol: string;
  quantity: Decimal;
  totalAcbCad: Decimal;
  acbPerUnitCad: Decimal;
  shortQuantity: Decimal;
  totalShortProceedsCad: Decimal;
}

export function runAcbEngine(
  transactions: Transaction[],
  accounts: Account[],
  securities: SecurityMaster[],
  settings?: Partial<TaxSettings>,
  referenceDate: string = '2026-08-22'
): CalculationEngineOutput {
  const accountMap = new Map<string, Account>();
  accounts.forEach((a) => accountMap.set(a.id || a.accountId, a));

  const securityMap = new Map<string, SecurityMaster>();
  securities.forEach((s) => securityMap.set(s.id || s.symbol, s));

  // Filter out cancelled transactions
  const activeTx = transactions.filter((t) => !t.isCancelled);

  // Group by date, respecting intraday order:
  // 1. Splits / Consolidations (priority 1)
  // 2. Other Corporate Actions (priority 2)
  // 3. Acquisitions / Buys / DRIPs (priority 3)
  // 4. Dispositions / Sells / Exercises (priority 4)
  // 5. ROC / Cash Distributions (priority 5)
  const getPriority = (tx: Transaction): number => {
    if (tx.transactionType === 'STOCK_SPLIT' || tx.transactionType === 'STOCK_CONSOLIDATION') return 1;
    if (tx.transactionType.startsWith('MERGER_') || tx.transactionType === 'SPINOFF' || tx.transactionType === 'RIGHTS_ISSUE') return 2;
    if (
      tx.transactionType === 'BUY' ||
      tx.transactionType === 'BUY_TO_COVER' ||
      tx.transactionType === 'DIVIDEND_REINVESTED' ||
      tx.transactionType === 'TRANSFER_IN' ||
      tx.transactionType === 'OPENING_BALANCE' ||
      tx.transactionType === 'BUY_TO_OPEN_OPT' ||
      tx.transactionType === 'BUY_TO_CLOSE_OPT' ||
      tx.transactionType === 'ASSIGNED_SHORT_PUT' ||
      tx.transactionType === 'EXERCISE_LONG_CALL'
    ) return 3;
    if (
      tx.transactionType === 'SELL' ||
      tx.transactionType === 'SELL_SHORT' ||
      tx.transactionType === 'TRANSFER_OUT' ||
      tx.transactionType === 'SELL_TO_CLOSE_OPT' ||
      tx.transactionType === 'SELL_TO_OPEN_OPT' ||
      tx.transactionType === 'EXERCISE_LONG_PUT' ||
      tx.transactionType === 'ASSIGNED_SHORT_CALL' ||
      tx.transactionType === 'OPT_EXPIRY_LONG' ||
      tx.transactionType === 'OPT_EXPIRY_SHORT' ||
      tx.transactionType === 'WORTHLESS_SECURITIES_S50'
    ) return 4;
    return 5;
  };

  const sortedTx = [...activeTx].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return getPriority(a) - getPriority(b);
  });

  const books = new Map<string, SecurityBookState>();
  const optionBooks = new Map<string, OptionPositionState>();
  const blockedSecurities = new Set<string>();

  const getBook = (secId: string, sym: string): SecurityBookState => {
    if (!books.has(secId)) {
      books.set(secId, {
        securityId: secId,
        symbol: sym,
        quantity: new Decimal(0),
        totalAcbCad: new Decimal(0),
        acbPerUnitCad: new Decimal(0),
        shortQuantity: new Decimal(0),
        totalShortProceedsCad: new Decimal(0),
      });
    }
    return books.get(secId)!;
  };

  const ledger: AcbLedgerEntry[] = [];
  const realizedGainsLosses: RealizedGainLoss[] = [];
  const superficialLosses: SuperficialLossEvent[] = [];
  const rollforwardsByYear = new Map<number, Map<string, SecurityRollforward>>();
  const auditTrail: string[] = [];

  let totalDivCad = new Decimal(0);
  let totalRocCad = new Decimal(0);
  let totalWhtCad = new Decimal(0);
  let totalOptPremiumsCad = new Decimal(0);

  // Helper to record rollforwards
  const recordRollforward = (
    year: number,
    secId: string,
    sym: string,
    name: string,
    updater: (rf: SecurityRollforward) => void
  ) => {
    if (!rollforwardsByYear.has(year)) {
      rollforwardsByYear.set(year, new Map());
    }
    const yearMap = rollforwardsByYear.get(year)!;
    if (!yearMap.has(secId)) {
      yearMap.set(secId, {
        securityId: secId,
        symbol: sym,
        name: name || sym,
        taxYear: year,
        openingQuantity: '0',
        openingAcbCad: '0.00',
        openingAcbPerUnitCad: '0.00',
        acquisitionsQuantity: '0',
        acquisitionsCostCad: '0.00',
        dispositionsQuantity: '0',
        dispositionsAcbRemovedCad: '0.00',
        rocAdjustmentsCad: '0.00',
        superficialLossAdditionsCad: '0.00',
        corporateActionAdjustmentsCad: '0.00',
        closingQuantity: '0',
        closingTotalAcbCad: '0.00',
        closingAcbPerUnitCad: '0.00',
        realizedGainLossTotalCad: '0.00',
      });
    }
    updater(yearMap.get(secId)!);
  };

  // MAIN REPLAY LOOP
  for (const tx of sortedTx) {
    const acct = accountMap.get(tx.accountId);
    const isTaxable = !acct || acct.accountType === 'taxable' || acct.accountType === 'spouse_taxable' || acct.accountType === 'affiliate_taxable';
    const txYear = parseInt(tx.date.substring(0, 4), 10);
    const sec = securityMap.get(tx.securityId);
    const secName = sec?.name || tx.symbol;

    if (tx.isExcludedFromTax) {
      auditTrail.push(`[${tx.date}] EXCLUDED FROM TAX: ${tx.symbol} ${tx.transactionType} (${tx.exclusionReason || 'User flagged'})`);
      continue;
    }

    if (tx.status === 'needs_review') {
      blockedSecurities.add(tx.securityId);
    }
    if (blockedSecurities.has(tx.securityId)) {
      continue;
    }

    // Skip the stock leg of an IBKR assignment to prevent double-counting, rely on the OPT leg
    if (sec?.assetClass === 'STK' && (tx.transactionType.startsWith('EXERCISE_') || tx.transactionType.startsWith('ASSIGNED_'))) {
      continue;
    }

    // Track Income / Distributions
    if (tx.transactionType === 'DIVIDEND_CASH' || tx.transactionType === 'DIVIDEND_REINVESTED') {
      totalDivCad = totalDivCad.plus(d(tx.amountCad));
    }
    if (tx.transactionType === 'WITHHOLDING_TAX') {
      totalWhtCad = totalWhtCad.plus(d(tx.amountCad));
    }

    // Registered account operations don't alter non-registered taxable ACB pool
    if (!isTaxable) {
      continue;
    }

    const book = getBook(tx.securityId, tx.symbol);

    // ==========================================
    // 1. CORPORATE ACTIONS (Splits, Mergers, Spins)
    // ==========================================
    if (tx.corporateAction) {
      const caResult = calculateCorporateAction(
        tx.corporateAction,
        book.quantity,
        book.totalAcbCad
      );

      const oldSharesDisposed = d(caResult.oldSharesDisposedQty);
      const oldAcbRemoved = d(caResult.oldSharesAcbRemovedCad);
      const newSharesQty = d(caResult.newSharesQty);
      const newSharesTotalAcb = d(caResult.newSharesTotalAcbCad);
      const realizedGain = d(caResult.realizedCapitalGainCad);
      const realizedLoss = d(caResult.realizedCapitalLossCad);
      const proceeds = d(caResult.proceedsCad);
      const divInc = d(caResult.dividendIncomeCad);
      const rocInc = d(caResult.returnOfCapitalCad);

      // Apply old shares removal
      if (oldSharesDisposed.isPositive()) {
        book.quantity = Decimal.max(0, book.quantity.minus(oldSharesDisposed));
        book.totalAcbCad = Decimal.max(0, book.totalAcbCad.minus(oldAcbRemoved));
        book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);
      }

      // Apply new shares addition (if same or different security)
      const targetSecId = tx.corporateAction.newSecurityId || tx.securityId;
      const targetBook = getBook(targetSecId, tx.symbol);

      if (newSharesQty.isPositive()) {
        targetBook.quantity = targetBook.quantity.plus(newSharesQty);
        targetBook.totalAcbCad = targetBook.totalAcbCad.plus(newSharesTotalAcb);
        targetBook.acbPerUnitCad = targetBook.quantity.isPositive()
          ? targetBook.totalAcbCad.dividedBy(targetBook.quantity)
          : new Decimal(0);
      }

      // Record capital gains / losses if recognized
      if (realizedGain.isPositive() || realizedLoss.isPositive()) {
        const netGainLoss = realizedGain.isPositive() ? realizedGain : realizedLoss.negated();

        realizedGainsLosses.push({
          id: `RGL_${tx.id}`,
          taxYear: txYear,
          dispositionDate: tx.date,
          securityId: tx.securityId,
          symbol: tx.symbol,
          securityName: secName,
          assetClass: sec?.assetClass || 'STK',
          quantityDisposed: toShares(oldSharesDisposed),
          grossProceedsCad: toMoney(proceeds),
          dispositionOutlaysCad: toMoney(0),
          netProceedsCad: toMoney(proceeds),
          acbPerUnitPriorCad: toMoney(book.acbPerUnitCad),
          acbOfUnitsDisposedCad: toMoney(oldAcbRemoved),
          rawGainLossCad: toMoney(netGainLoss),
          isSuperficialLoss: false,
          superficialLossDeniedCad: toMoney(0),
          isPermanentlyDeniedInRegistered: false,
          recognizedGainLossCad: toMoney(netGainLoss),
          dispositionTransactionId: tx.id,
          statutoryCitations: [caResult.statutoryBasis],
          explanation: caResult.explanation,
        });
      }

      // Record income / ROC from CA
      if (divInc.isPositive()) {
        totalDivCad = totalDivCad.plus(divInc);
      }
      if (rocInc.isPositive()) {
        totalRocCad = totalRocCad.plus(rocInc);
      }

      // Ledger entry
      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Corporate Action: ${tx.corporateAction.treatment} (${caResult.statutoryBasis})`,
        quantityChange: toShares(newSharesQty.minus(oldSharesDisposed)),
        runningQuantity: toShares(targetBook.quantity),
        costChangeCad: toMoney(newSharesTotalAcb.minus(oldAcbRemoved)),
        runningTotalAcbCad: toMoney(targetBook.totalAcbCad),
        runningAcbPerUnitCad: toMoney(targetBook.acbPerUnitCad),
        realizedGainLossCad: realizedGain.isPositive() ? toMoney(realizedGain) : (realizedLoss.isPositive() ? toMoney(realizedLoss.negated()) : undefined),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: caResult.statutoryBasis,
        notes: caResult.explanation,
      });

      auditTrail.push(`[${tx.date}] ${tx.symbol} Corporate Action ${tx.corporateAction.treatment}: ${caResult.explanation}`);
      continue;
    }

    // ==========================================
    // 2. OPTIONS 4-WAY MATRIX
    // ==========================================
    if (
      tx.transactionType.includes('_OPT') ||
      tx.transactionType.startsWith('EXERCISE_') ||
      tx.transactionType.startsWith('ASSIGNED_') ||
      tx.transactionType.startsWith('OPT_EXPIRY_')
    ) {
      const strikeVal = d(sec?.optionDetails?.strike ?? tx.price ?? 100);
      const multVal = d(sec?.optionDetails?.multiplier ?? 100).toNumber();
      const optDetails = {
        underlyingSymbol: sec?.optionDetails?.underlyingSymbol || tx.symbol.split(' ')[0] || tx.symbol,
        putOrCall: (sec?.optionDetails?.putOrCall || (tx.transactionType.includes('PUT') ? 'PUT' : 'CALL')) as 'PUT' | 'CALL',
        strike: strikeVal.toString(),
        expiryDate: sec?.optionDetails?.expiryDate || tx.date,
        multiplier: multVal,
      };

      const seriesKey = getOptionSeriesKey(
        optDetails.underlyingSymbol,
        optDetails.putOrCall,
        strikeVal.toNumber(),
        optDetails.expiryDate,
        optDetails.multiplier
      );

      if (!optionBooks.has(seriesKey)) {
        optionBooks.set(seriesKey, {
          seriesKey,
          underlyingSymbol: optDetails.underlyingSymbol,
          putOrCall: optDetails.putOrCall,
          strike: toMoney(strikeVal),
          expiryDate: optDetails.expiryDate,
          multiplier: optDetails.multiplier,
          longContracts: '0',
          totalLongAcbCad: '0.00',
          longAcbPerContractCad: '0.00',
          shortContracts: '0',
          totalUnearnedPremiumCad: '0.00',
          unearnedPremiumPerContractCad: '0.00',
        });
      }

      const optState = optionBooks.get(seriesKey)!;
      const { effect, updatedState } = evaluateOptionTaxEffect(
        tx,
        optState,
        book.quantity,
        book.totalAcbCad
      );
      optionBooks.set(seriesKey, updatedState);

      // If option lifecycle creates or disposes underlying shares
      if (effect.isShareTransaction) {
        const underlyingSymbol = optState.underlyingSymbol;
        const underlyingSec = securities.find(s => s.symbol === underlyingSymbol && s.assetClass === 'STK');
        const targetBookId = underlyingSec ? underlyingSec.id : tx.securityId + '_UNDERLYING';
        const targetBook = getBook(targetBookId, underlyingSymbol);
        
        const deltaQty = d(effect.shareDeltaQty);
        if (deltaQty.isPositive()) {
          // Acquire shares (e.g. Exercise Long Call, Assigned Short Put)
          const addedQty = deltaQty;
          const addedCost = d(effect.shareCostCad);

          targetBook.quantity = targetBook.quantity.plus(addedQty);
          targetBook.totalAcbCad = targetBook.totalAcbCad.plus(addedCost);
          targetBook.acbPerUnitCad = targetBook.quantity.isPositive() ? targetBook.totalAcbCad.dividedBy(targetBook.quantity) : new Decimal(0);

          recordRollforward(txYear, targetBookId, underlyingSymbol, underlyingSec?.name || underlyingSymbol, (rf) => {
            rf.acquisitionsQuantity = toShares(d(rf.acquisitionsQuantity).plus(addedQty));
            rf.acquisitionsCostCad = toMoney(d(rf.acquisitionsCostCad).plus(addedCost));
          });
        } else if (deltaQty.isNegative()) {
          // Dispose shares (e.g. Assigned Short Call, Exercise Long Put)
          const disposedQty = deltaQty.abs();
          const perUnitAcb = targetBook.acbPerUnitCad;
          const acbRemoved = perUnitAcb.times(disposedQty);
          const grossProceeds = d(effect.shareProceedsCad);
          const netGainLoss = grossProceeds.minus(acbRemoved);

          targetBook.quantity = Decimal.max(0, targetBook.quantity.minus(disposedQty));
          targetBook.totalAcbCad = Decimal.max(0, targetBook.totalAcbCad.minus(acbRemoved));
          targetBook.acbPerUnitCad = targetBook.quantity.isPositive() ? targetBook.totalAcbCad.dividedBy(targetBook.quantity) : new Decimal(0);

          realizedGainsLosses.push({
            id: `RGL_${tx.id}`,
            taxYear: txYear,
            dispositionDate: tx.date,
            securityId: targetBookId,
            symbol: underlyingSymbol,
            securityName: underlyingSec?.name || underlyingSymbol,
            assetClass: 'STK',
            quantityDisposed: toShares(disposedQty),
            grossProceedsCad: toMoney(grossProceeds),
            dispositionOutlaysCad: toMoney(tx.commissionCad),
            netProceedsCad: toMoney(grossProceeds),
            acbPerUnitPriorCad: toMoney(perUnitAcb),
            acbOfUnitsDisposedCad: toMoney(acbRemoved),
            rawGainLossCad: toMoney(netGainLoss),
            isSuperficialLoss: false,
            superficialLossDeniedCad: toMoney(0),
            isPermanentlyDeniedInRegistered: false,
            recognizedGainLossCad: toMoney(netGainLoss),
            dispositionTransactionId: tx.id,
            statutoryCitations: [effect.statutoryBasis],
            explanation: effect.optionExplanation,
          });
        }
      }

      // If standalone option disposition/expiry
      if (effect.isOptionDisposition) {
        realizedGainsLosses.push({
          id: `RGL_${tx.id}`,
          taxYear: txYear,
          dispositionDate: tx.date,
          securityId: tx.securityId,
          symbol: tx.symbol,
          securityName: `Option: ${seriesKey}`,
          assetClass: 'OPT',
          quantityDisposed: toShares(tx.quantity),
          grossProceedsCad: toMoney(d(tx.amountCad)),
          dispositionOutlaysCad: toMoney(tx.commissionCad),
          netProceedsCad: toMoney(d(tx.amountCad).minus(d(tx.commissionCad))),
          acbPerUnitPriorCad: toMoney(optState.longAcbPerContractCad || optState.unearnedPremiumPerContractCad),
          acbOfUnitsDisposedCad: toMoney(d(optState.longAcbPerContractCad).times(d(tx.quantity))),
          rawGainLossCad: effect.optionGainLossCad,
          isSuperficialLoss: false,
          superficialLossDeniedCad: toMoney(0),
          isPermanentlyDeniedInRegistered: false,
          recognizedGainLossCad: effect.optionGainLossCad,
          dispositionTransactionId: tx.id,
          statutoryCitations: [effect.statutoryBasis],
          explanation: effect.optionExplanation,
        });
      }

      const qChange = effect.isShareTransaction
        ? effect.shareDeltaQty
        : (tx.transactionType.includes('BUY') ? toShares(tx.quantity) : toShares(d(tx.quantity).negated()));
      const cChange = effect.shareCostCad || (tx.transactionType.includes('BUY') ? toMoney(d(tx.amountCad)) : '0.00');

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: effect.optionExplanation,
        quantityChange: qChange,
        runningQuantity: toShares(book.quantity),
        costChangeCad: cChange,
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        realizedGainLossCad: effect.optionGainLossCad !== '0.00' ? effect.optionGainLossCad : undefined,
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: effect.statutoryBasis,
        notes: effect.optionExplanation,
      });

      auditTrail.push(`[${tx.date}] Option Event ${tx.transactionType} (${tx.symbol}): ${effect.optionExplanation}`);
      continue;
    }

    // ==========================================
    // 3. ACQUISITIONS (Buy, DRIP, Transfer In, Opening Balance)
    // ==========================================
    if (tx.transactionType === 'TRANSFER_IN') {
      const srcAcct = tx.sourceAccountId ? accountMap.get(tx.sourceAccountId) : undefined;
      const srcAcctType = tx.sourceAccountType || (srcAcct ? srcAcct.accountType : undefined);
      const notes = (tx.reviewNotes || '').toUpperCase();

      const isFromRegistered = ['tfsa', 'rrsp', 'rrif', 'fhsa', 'resp', 'rdsp', 'lira', 'other_registered'].includes(srcAcctType || '') ||
        notes.includes('TFSA') || notes.includes('RRSP') || notes.includes('FHSA');
      const isFromTaxable = srcAcctType === 'taxable' || notes.includes('MARGIN') || notes.includes('TAXABLE');

      if (isFromTaxable && !isFromRegistered) {
        // Taxable -> Taxable (same taxpayer): ignore both legs under unified ITA s. 47 pool
        auditTrail.push(`[${tx.date}] TRANSFER_IN ${toShares(d(tx.quantity))} ${tx.symbol}: Taxable-to-taxable transfer ignored under unified ITA s. 47 pool.`);
        continue;
      }

      // Registered -> Taxable or External -> Taxable: acquisition at FMV
      const qty = d(tx.quantity);
      const costCad = d(tx.amountCad).plus(d(tx.commissionCad));

      book.quantity = book.quantity.plus(qty);
      book.totalAcbCad = book.totalAcbCad.plus(costCad);
      book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

      recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
        rf.acquisitionsQuantity = toShares(d(rf.acquisitionsQuantity).plus(qty));
        rf.acquisitionsCostCad = toMoney(d(rf.acquisitionsCostCad).plus(costCad));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Transfer In of ${toShares(qty)} units at $${toMoney(costCad)} CAD FMV`,
        quantityChange: toShares(qty),
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(costCad),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: isFromRegistered ? 'In-Kind Registered-to-Taxable Transfer Acquisition at FMV' : 'ITA s. 47(1) Average Cost Pool Recomputation',
      });

      auditTrail.push(`[${tx.date}] TRANSFER_IN ${toShares(qty)} ${tx.symbol}: New Total ACB = $${toMoney(book.totalAcbCad)} CAD ($${toMoney(book.acbPerUnitCad)}/unit)`);
      continue;
    }

    if (
      tx.transactionType === 'BUY' ||
      tx.transactionType === 'DIVIDEND_REINVESTED' ||
      tx.transactionType === 'OPENING_BALANCE'
    ) {
      const qty = d(tx.quantity);
      // Acquisition cost includes price x qty in CAD + commissions + expenses
      const costCad = d(tx.amountCad).plus(d(tx.commissionCad));

      book.quantity = book.quantity.plus(qty);
      book.totalAcbCad = book.totalAcbCad.plus(costCad);
      book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

      recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
        rf.acquisitionsQuantity = toShares(d(rf.acquisitionsQuantity).plus(qty));
        rf.acquisitionsCostCad = toMoney(d(rf.acquisitionsCostCad).plus(costCad));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Acquisition of ${toShares(qty)} units at $${toMoney(costCad)} CAD (incl. $${toMoney(tx.commissionCad)} comm)`,
        quantityChange: toShares(qty),
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(costCad),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: 'ITA s. 47(1) Average Cost Pool Recomputation',
      });

      auditTrail.push(
        `[${tx.date}] BUY ${toShares(qty)} ${tx.symbol}: New Total ACB = $${toMoney(book.totalAcbCad)} CAD ($${toMoney(book.acbPerUnitCad)}/unit)`
      );
      continue;
    }

    // ==========================================
    // 4. DISPOSITIONS (Sell, Transfer Out, Worthless s.50)
    // ==========================================
    if (tx.transactionType === 'TRANSFER_OUT') {
      const dstAcct = tx.targetAccountId ? accountMap.get(tx.targetAccountId) : undefined;
      const dstAcctType = tx.destinationAccountType || (dstAcct ? dstAcct.accountType : undefined);
      const notes = (tx.reviewNotes || '').toUpperCase();

      const isToRegistered = ['tfsa', 'rrsp', 'rrif', 'fhsa', 'resp', 'rdsp', 'lira', 'other_registered'].includes(dstAcctType || '') ||
        notes.includes('TFSA') || notes.includes('RRSP') || notes.includes('FHSA');
      const isToTaxable = dstAcctType === 'taxable' || notes.includes('MARGIN') || notes.includes('TAXABLE');

      if (isToTaxable && !isToRegistered) {
        // Taxable -> Taxable (same taxpayer): ignore both legs under unified ITA s. 47 pool
        auditTrail.push(`[${tx.date}] TRANSFER_OUT ${toShares(d(tx.quantity))} ${tx.symbol}: Taxable-to-taxable transfer ignored under unified ITA s. 47 pool.`);
        continue;
      }

      // Taxable -> Registered transfer: deemed disposition at FMV on the taxable pool
      const qtyDisposed = d(tx.quantity);
      const perUnitAcb = book.acbPerUnitCad;
      const acbRemoved = perUnitAcb.times(qtyDisposed);
      const grossProceeds = d(tx.amountCad); // FMV in CAD
      const outlays = d(tx.commissionCad).plus(d(tx.taxes || 0));
      const netProceeds = grossProceeds.minus(outlays);
      const rawGainLoss = netProceeds.minus(acbRemoved);

      // Update pool
      book.quantity = Decimal.max(0, book.quantity.minus(qtyDisposed));
      book.totalAcbCad = Decimal.max(0, book.totalAcbCad.minus(acbRemoved));
      book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

      const isLoss = rawGainLoss.isNegative();
      const recognizedGainLoss = isLoss ? d(0) : rawGainLoss;

      if (isLoss) {
        const deniedAmt = rawGainLoss.abs();
        superficialLosses.push({
          dispositionTransactionId: tx.id,
          securityId: tx.securityId,
          symbol: tx.symbol,
          dispositionDate: tx.date,
          rawCapitalLossCad: toMoney(deniedAmt),
          deniedLossCad: toMoney(deniedAmt),
          allowedLossCad: '0.00',
          replacementAccountId: tx.targetAccountId || tx.accountId,
          replacementDate: tx.date,
          isPermanentlyDeniedInRegistered: true,
          status: 'final',
          explanation: 'Loss on transfer to registered account (TFSA/RRSP/FHSA) permanently denied under ITA s. 40(2)(g)(iv).',
        });
      }

      realizedGainsLosses.push({
        id: `RGL_${tx.id}`,
        taxYear: txYear,
        dispositionDate: tx.date,
        settlementDate: tx.settlementDate,
        securityId: tx.securityId,
        symbol: tx.symbol,
        securityName: secName,
        assetClass: sec?.assetClass || 'STK',
        quantityDisposed: toShares(qtyDisposed),
        grossProceedsCad: toMoney(grossProceeds),
        dispositionOutlaysCad: toMoney(outlays),
        netProceedsCad: toMoney(netProceeds),
        acbPerUnitPriorCad: toMoney(perUnitAcb),
        acbOfUnitsDisposedCad: toMoney(acbRemoved),
        rawGainLossCad: toMoney(rawGainLoss),
        isSuperficialLoss: isLoss,
        superficialLossDeniedCad: isLoss ? toMoney(rawGainLoss.abs()) : '0.00',
        isPermanentlyDeniedInRegistered: isLoss,
        recognizedGainLossCad: toMoney(recognizedGainLoss),
        dispositionTransactionId: tx.id,
        statutoryCitations: isLoss ? ['ITA s. 40(2)(g)(iv)'] : ['ITA s. 70(5)', 'ITA s. 40(1)'],
        explanation: isLoss
          ? 'Transfer to registered account at loss: loss permanently denied under ITA s. 40(2)(g)(iv).'
          : `Transfer to registered account at FMV proceeds $${toMoney(grossProceeds)} CAD vs ACB $${toMoney(acbRemoved)} CAD. Capital gain recognized.`,
      });

      recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
        rf.dispositionsQuantity = toShares(d(rf.dispositionsQuantity).plus(qtyDisposed));
        rf.dispositionsAcbRemovedCad = toMoney(d(rf.dispositionsAcbRemovedCad).plus(acbRemoved));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Transfer Out (In-Kind Deemed Disposition) of ${toShares(qtyDisposed)} units to ${dstAcctType?.toUpperCase() || 'REGISTERED'}. Proceeds: $${toMoney(grossProceeds)} CAD`,
        quantityChange: toShares(qtyDisposed.negated()),
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(acbRemoved.negated()),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        realizedGainLossCad: toMoney(recognizedGainLoss),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: isLoss ? 'ITA s. 40(2)(g)(iv) Loss Permanently Denied on Registered Transfer' : 'ITA s. 70(5) Deemed Disposition at FMV',
      });

      auditTrail.push(
        `[${tx.date}] TRANSFER_OUT ${toShares(qtyDisposed)} ${tx.symbol} to ${dstAcctType || 'REGISTERED'}: Realized Gain/Loss = $${toMoney(recognizedGainLoss)} CAD`
      );
      continue;
    }

    if (
      tx.transactionType === 'SELL' ||
      tx.transactionType === 'WORTHLESS_SECURITIES_S50'
    ) {
      const qtyDisposed = d(tx.quantity);
      const perUnitAcb = book.acbPerUnitCad;
      const acbRemoved = perUnitAcb.times(qtyDisposed);
      const grossProceeds = d(tx.amountCad);
      const outlays = d(tx.commissionCad).plus(d(tx.taxes || 0));
      const netProceeds = grossProceeds.minus(outlays);
      const rawGainLoss = netProceeds.minus(acbRemoved);

      // Update pool: disposition removes qty x acb_per_unit; per-unit ACB is unchanged
      book.quantity = Decimal.max(0, book.quantity.minus(qtyDisposed));
      book.totalAcbCad = Decimal.max(0, book.totalAcbCad.minus(acbRemoved));
      book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

      // Check Superficial Loss
      const isLoss = rawGainLoss.isNegative();

      const slCheck = evaluateSuperficialLoss(
        tx,
        isLoss ? rawGainLoss.abs() : new Decimal(0),
        qtyDisposed,
        sortedTx,
        accountMap,
        book.quantity,
        referenceDate
      );

      let finalRecognizedGainLoss = rawGainLoss;

      if (slCheck.isSuperficial) {
        const deniedAmt = slCheck.deniedLossCad;
        const allowedAmt = slCheck.allowedLossCad;
        finalRecognizedGainLoss = d(allowedAmt).negated();

        superficialLosses.push({
          dispositionTransactionId: tx.id,
          securityId: tx.securityId,
          symbol: tx.symbol,
          dispositionDate: tx.date,
          rawCapitalLossCad: toMoney(rawGainLoss.abs()),
          deniedLossCad: toMoney(deniedAmt),
          allowedLossCad: toMoney(allowedAmt),
          replacementTransactionId: slCheck.replacementTransactionId,
          replacementAccountId: slCheck.replacementAccountId,
          replacementDate: slCheck.replacementDate,
          isPermanentlyDeniedInRegistered: slCheck.isPermanentlyDeniedInRegistered,
          status: slCheck.status,
          explanation: slCheck.explanation,
        });

        // Add denied loss back to replacement ACB if in taxable account
        if (!slCheck.isPermanentlyDeniedInRegistered && d(slCheck.deniedLossCad).isPositive()) {
          book.totalAcbCad = book.totalAcbCad.plus(d(slCheck.deniedLossCad));
          book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

          recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
            rf.superficialLossAdditionsCad = toMoney(d(rf.superficialLossAdditionsCad).plus(d(slCheck.deniedLossCad)));
          });
        }
      }

      recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
        rf.dispositionsQuantity = toShares(d(rf.dispositionsQuantity).plus(qtyDisposed));
        rf.dispositionsAcbRemovedCad = toMoney(d(rf.dispositionsAcbRemovedCad).plus(acbRemoved));
        rf.realizedGainLossTotalCad = toMoney(d(rf.realizedGainLossTotalCad).plus(finalRecognizedGainLoss));
      });

      realizedGainsLosses.push({
        id: `RGL_${tx.id}`,
        taxYear: txYear,
        dispositionDate: tx.date,
        settlementDate: tx.settlementDate,
        securityId: tx.securityId,
        symbol: tx.symbol,
        securityName: secName,
        assetClass: sec?.assetClass || 'STK',
        quantityDisposed: toShares(qtyDisposed),
        grossProceedsCad: toMoney(grossProceeds),
        dispositionOutlaysCad: toMoney(outlays),
        netProceedsCad: toMoney(netProceeds),
        acbPerUnitPriorCad: toMoney(perUnitAcb),
        acbOfUnitsDisposedCad: toMoney(acbRemoved),
        rawGainLossCad: toMoney(rawGainLoss),
        isSuperficialLoss: slCheck.isSuperficial,
        superficialLossDeniedCad: slCheck.deniedLossCad,
        replacementTargetSecurityId: slCheck.replacementTransactionId,
        isPermanentlyDeniedInRegistered: slCheck.isPermanentlyDeniedInRegistered,
        recognizedGainLossCad: toMoney(finalRecognizedGainLoss),
        dispositionTransactionId: tx.id,
        statutoryCitations: slCheck.isSuperficial
          ? ['ITA s. 40(1)(a)', 'ITA s. 47', 'ITA s. 54 Superficial Loss']
          : ['ITA s. 40(1)(a)', 'ITA s. 47'],
        explanation: slCheck.isSuperficial
          ? slCheck.explanation
          : `Disposed ${toShares(qtyDisposed)} units at net proceeds $${toMoney(netProceeds)} CAD vs ACB $${toMoney(acbRemoved)} CAD. Recognized gain/loss: $${toMoney(finalRecognizedGainLoss)} CAD.`,
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Disposition of ${toShares(qtyDisposed)} units at proceeds $${toMoney(netProceeds)} CAD vs ACB $${toMoney(acbRemoved)} CAD`,
        quantityChange: toShares(qtyDisposed.negated()),
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(acbRemoved.negated()),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        realizedGainLossCad: toMoney(finalRecognizedGainLoss),
        superficialLossAdjustmentCad: slCheck.deniedLossCad !== '0.00' ? slCheck.deniedLossCad : undefined,
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: 'ITA s. 40(1)(a) Capital Gain/Loss Disposition',
        notes: slCheck.explanation,
      });

      auditTrail.push(
        `[${tx.date}] SELL ${toShares(qtyDisposed)} ${tx.symbol}: Realized Gain/Loss = $${toMoney(finalRecognizedGainLoss)} CAD`
      );
      continue;
    }

    // ==========================================
    // 5. RETURN OF CAPITAL (ROC) / ACB REDUCTION
    // ==========================================
    if (tx.transactionType === 'RETURN_OF_CAPITAL') {
      const rocAmount = d(tx.amountCad);
      totalRocCad = totalRocCad.plus(rocAmount);

      let newTotalAcb = book.totalAcbCad.minus(rocAmount);
      let excessGain = new Decimal(0);

      // Under ITA s. 53(2)(a) and s. 40(3), if ACB drops below zero, recognize capital gain for excess and set ACB to 0
      if (newTotalAcb.isNegative()) {
        excessGain = newTotalAcb.abs();
        newTotalAcb = new Decimal(0);

        realizedGainsLosses.push({
          id: `RGL_ROC_${tx.id}`,
          taxYear: txYear,
          dispositionDate: tx.date,
          securityId: tx.securityId,
          symbol: tx.symbol,
          securityName: secName,
          assetClass: sec?.assetClass || 'STK',
          quantityDisposed: '0',
          grossProceedsCad: toMoney(excessGain),
          dispositionOutlaysCad: '0.00',
          netProceedsCad: toMoney(excessGain),
          acbPerUnitPriorCad: '0.00',
          acbOfUnitsDisposedCad: '0.00',
          rawGainLossCad: toMoney(excessGain),
          isSuperficialLoss: false,
          superficialLossDeniedCad: '0.00',
          isPermanentlyDeniedInRegistered: false,
          recognizedGainLossCad: toMoney(excessGain),
          dispositionTransactionId: tx.id,
          statutoryCitations: ['ITA s. 53(2)(a)', 'ITA s. 40(3) Negative ACB Deemed Capital Gain'],
          explanation: `Return of Capital exceeded total ACB by $${toMoney(excessGain)} CAD. Deemed capital gain recognized under ITA s. 40(3); ACB reset to $0.`,
        });
      }

      book.totalAcbCad = newTotalAcb;
      book.acbPerUnitCad = book.quantity.isPositive() ? book.totalAcbCad.dividedBy(book.quantity) : new Decimal(0);

      recordRollforward(txYear, tx.securityId, tx.symbol, secName, (rf) => {
        rf.rocAdjustmentsCad = toMoney(d(rf.rocAdjustmentsCad).plus(rocAmount));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: tx.securityId,
        symbol: tx.symbol,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Return of Capital distribution of $${toMoney(rocAmount)} CAD. ${excessGain.isPositive() ? `Excess $${toMoney(excessGain)} deemed capital gain.` : ''}`,
        quantityChange: '0',
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(rocAmount.minus(excessGain).negated()),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        realizedGainLossCad: excessGain.isPositive() ? toMoney(excessGain) : undefined,
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: 'ITA s. 53(2)(a) & s. 40(3) ROC Reduction',
      });

      auditTrail.push(`[${tx.date}] ROC ${tx.symbol}: -$${toMoney(rocAmount)} CAD (New ACB = $${toMoney(book.totalAcbCad)})`);
    }
  }

  // Update rollforward closing balances
  rollforwardsByYear.forEach((yearMap) => {
    yearMap.forEach((rf, secId) => {
      const book = books.get(secId);
      if (book) {
        rf.closingQuantity = toShares(book.quantity);
        rf.closingTotalAcbCad = toMoney(book.totalAcbCad);
        rf.closingAcbPerUnitCad = toMoney(book.acbPerUnitCad);
      }
    });
  });

  const securityBalances = new Map<string, { quantity: string; totalAcbCad: string; acbPerUnitCad: string; symbol: string; name: string }>();
  books.forEach((book, secId) => {
    securityBalances.set(secId, {
      quantity: toShares(book.quantity),
      totalAcbCad: toMoney(book.totalAcbCad),
      acbPerUnitCad: toMoney(book.acbPerUnitCad),
      symbol: book.symbol,
      name: securityMap.get(secId)?.name || book.symbol,
    });
  });

  let totalGain = new Decimal(0);
  let totalLoss = new Decimal(0);
  realizedGainsLosses.forEach((rgl) => {
    const amount = d(rgl.recognizedGainLossCad);
    if (amount.isPositive()) {
      totalGain = totalGain.plus(amount);
    } else if (amount.isNegative()) {
      totalLoss = totalLoss.plus(amount.abs());
    }
  });

  return {
    ledger,
    realizedGainsLosses,
    superficialLosses,
    rollforwardsByYear,
    securityBalances,
    incomeDistributions: {
      dividendsCad: toMoney(totalDivCad),
      rocCad: toMoney(totalRocCad),
      withholdingTaxCad: toMoney(totalWhtCad),
      optionPremiumsCad: toMoney(totalOptPremiumsCad),
    },
    totalRealizedGainCad: toMoney(totalGain),
    totalRealizedLossCad: toMoney(totalLoss),
    totalNetRealizedGainLossCad: toMoney(totalGain.minus(totalLoss)),
    auditTrail,
  };
}

export function reconcilePositions(
  securityBalances: Map<string, { symbol: string; quantity: string; totalAcbCad: string }>,
  openPositions: OpenPosition[]
): ReconciliationBreak[] {
  const breaks: ReconciliationBreak[] = [];
  const openPosMap = new Map<string, Decimal>();

  openPositions.forEach((pos) => {
    const symbol = pos.symbol;
    if (!symbol) return;
    const qty = d(pos.quantity || '0');
    const existing = openPosMap.get(symbol) || d(0);
    openPosMap.set(symbol, existing.plus(qty));
  });

  securityBalances.forEach((bal, secId) => {
    const calcQty = d(bal.quantity);
    if (calcQty.isPositive()) {
      const brokerReported = openPosMap.get(bal.symbol) || d(0);
      const diff = calcQty.minus(brokerReported).abs();
      if (diff.greaterThan(0.0001)) {
        breaks.push({
          securityId: secId,
          symbol: bal.symbol,
          calculatedQuantity: bal.quantity,
          brokerReportedQuantity: brokerReported.toString(),
          quantityDiscrepancy: calcQty.minus(brokerReported).toString(),
          calculatedAcbCad: bal.totalAcbCad,
          status: 'QUANTITY_BREAK',
          explanation: `Calculated quantity (${bal.quantity}) differs from IBKR Open Position (${brokerReported.toString()})`,
        });
      }
    }
  });

  return breaks;
}
