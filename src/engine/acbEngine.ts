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
import { isNonEquityOrCash } from '../parsers/ibkrFlexXmlParser';

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
  securities.forEach((s) => {
    if (s.id) securityMap.set(s.id, s);
    if (s.symbol) securityMap.set(s.symbol, s);
  });

  // Canonical Security Map (prefer CON_*, merge SYM_* into CON_*)
  const canonicalSecIdMap = new Map<string, string>();
  const canonicalSymbolMap = new Map<string, string>();

  function registerCanonical(conid?: string, isin?: string, symbol?: string, existingId?: string) {
    const cConid = (conid || '').trim();
    const cIsin = (isin || '').trim();
    const cSym = (symbol || '').trim();
    const cBaseSym = cSym.replace(/\.(TO|V|UN|U|NE)$/i, '');

    if (isNonEquityOrCash(cSym)) return;

    let targetId = '';
    if (cConid) {
      targetId = `CON_${cConid}`;
    } else if (existingId && existingId.startsWith('CON_')) {
      targetId = existingId;
    } else if (cIsin && canonicalSecIdMap.has(`ISIN_${cIsin}`)) {
      targetId = canonicalSecIdMap.get(`ISIN_${cIsin}`)!;
    } else if (cSym && canonicalSecIdMap.has(`SYM_${cSym}`)) {
      targetId = canonicalSecIdMap.get(`SYM_${cSym}`)!;
    } else if (cBaseSym && canonicalSecIdMap.has(`SYM_${cBaseSym}`)) {
      targetId = canonicalSecIdMap.get(`SYM_${cBaseSym}`)!;
    } else if (cIsin) {
      targetId = `ISIN_${cIsin}`;
    } else if (cSym) {
      targetId = `SYM_${cSym}`;
    }

    if (!targetId) return;

    if (cConid && !targetId.startsWith('CON_')) {
      targetId = `CON_${cConid}`;
    }

    if (cConid) canonicalSecIdMap.set(`CON_${cConid}`, targetId);
    if (cIsin) canonicalSecIdMap.set(`ISIN_${cIsin}`, targetId);
    if (cSym) {
      canonicalSecIdMap.set(`SYM_${cSym}`, targetId);
      canonicalSecIdMap.set(cSym, targetId);
    }
    if (cBaseSym) {
      canonicalSecIdMap.set(`SYM_${cBaseSym}`, targetId);
      canonicalSecIdMap.set(cBaseSym, targetId);
    }
    if (existingId) canonicalSecIdMap.set(existingId, targetId);

    if (cSym && (!canonicalSymbolMap.has(targetId) || cSym.length < (canonicalSymbolMap.get(targetId)?.length || 99))) {
      canonicalSymbolMap.set(targetId, cSym);
    }
  }

  securities.forEach((s) => {
    registerCanonical(s.conid, s.isin, s.symbol, s.id);
  });

  transactions.forEach((t) => {
    registerCanonical(undefined, undefined, t.symbol, t.securityId);
  });

  function resolveId(secId?: string, symbol?: string): string {
    if (secId && canonicalSecIdMap.has(secId)) return canonicalSecIdMap.get(secId)!;
    if (symbol && canonicalSecIdMap.has(`SYM_${symbol}`)) return canonicalSecIdMap.get(`SYM_${symbol}`)!;
    if (symbol && canonicalSecIdMap.has(symbol)) return canonicalSecIdMap.get(symbol)!;
    if (secId) return secId;
    if (symbol) return `SYM_${symbol}`;
    return 'SYM_UNKNOWN';
  }

  function resolveSymbol(targetId: string, fallbackSym: string): string {
    return canonicalSymbolMap.get(targetId) || fallbackSym;
  }

  // Filter out cancelled transactions
  const activeTx = transactions.filter((t) => !t.isCancelled);

  // Group by date, respecting intraday order
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

  const updateBookAverages = (book: SecurityBookState) => {
    if (book.quantity.isZero() || !book.quantity.isPositive() || book.quantity.isNaN() || !book.quantity.isFinite()) {
      book.quantity = new Decimal(0);
      book.totalAcbCad = new Decimal(0);
      book.acbPerUnitCad = new Decimal(0);
    } else {
      if (book.totalAcbCad.isNaN() || !book.totalAcbCad.isFinite() || !book.totalAcbCad.isPositive()) {
        book.totalAcbCad = new Decimal(0);
        book.acbPerUnitCad = new Decimal(0);
      } else {
        const perUnit = book.totalAcbCad.dividedBy(book.quantity);
        book.acbPerUnitCad = perUnit.isNaN() || !perUnit.isFinite() ? new Decimal(0) : perUnit;
      }
    }
  };

  const ledger: AcbLedgerEntry[] = [];
  const realizedGainsLosses: RealizedGainLoss[] = [];
  const superficialLosses: SuperficialLossEvent[] = [];
  const rollforwardsByYear = new Map<number, Map<string, SecurityRollforward>>();
  const auditTrail: string[] = [];
  const pendingSuperficialLossByTxId = new Map<string, Decimal>();

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
    const sec = securityMap.get(tx.securityId) || securityMap.get(tx.symbol);

    // Filter CASH and FOREX/Currency Pair trades from equity pool tracking
    if (isNonEquityOrCash(tx.symbol, sec?.assetClass, tx.securityId)) {
      if (tx.transactionType === 'DIVIDEND_CASH' || tx.transactionType === 'DIVIDEND_REINVESTED') {
        const divAmt = d(tx.amountCad);
        if (!divAmt.isNaN() && divAmt.isFinite()) totalDivCad = totalDivCad.plus(divAmt);
      }
      if (tx.transactionType === 'WITHHOLDING_TAX') {
        const whtAmt = d(tx.amountCad);
        if (!whtAmt.isNaN() && whtAmt.isFinite()) totalWhtCad = totalWhtCad.plus(whtAmt);
      }
      continue;
    }

    const canonicalId = resolveId(tx.securityId, tx.symbol);
    const canonicalSym = resolveSymbol(canonicalId, tx.symbol);
    const secName = sec?.name || canonicalSym;

    if (tx.isExcludedFromTax) {
      auditTrail.push(`[${tx.date}] EXCLUDED FROM TAX: ${canonicalSym} ${tx.transactionType} (${tx.exclusionReason || 'User flagged'})`);
      continue;
    }

    // Amount and FX validation: Do not write NaN
    const amountVal = d(tx.amountCad);
    const fxVal = d(tx.fxRate || 1);
    if (
      tx.amountCad === undefined ||
      tx.amountCad === null ||
      tx.amountCad === 'NaN' ||
      amountVal.isNaN() ||
      !amountVal.isFinite() ||
      fxVal.isNaN() ||
      !fxVal.isFinite() ||
      fxVal.isZero()
    ) {
      tx.status = 'needs_review';
      blockedSecurities.add(canonicalId);
      auditTrail.push(`[${tx.date}] Transaction ${tx.id} (${canonicalSym}) has invalid amount/FX. Marked needs_review and skipped.`);
      continue;
    }

    if (tx.status === 'needs_review') {
      blockedSecurities.add(canonicalId);
    }
    if (blockedSecurities.has(canonicalId)) {
      continue;
    }

    // Skip the stock leg of an IBKR assignment to prevent double-counting, rely on the OPT leg
    if (sec?.assetClass === 'STK' && (tx.transactionType.startsWith('EXERCISE_') || tx.transactionType.startsWith('ASSIGNED_'))) {
      continue;
    }

    // Track Income / Distributions
    if (tx.transactionType === 'DIVIDEND_CASH' || tx.transactionType === 'DIVIDEND_REINVESTED') {
      totalDivCad = totalDivCad.plus(amountVal);
    }
    if (tx.transactionType === 'WITHHOLDING_TAX') {
      totalWhtCad = totalWhtCad.plus(amountVal);
    }

    // Registered account operations don't alter non-registered taxable ACB pool
    if (!isTaxable) {
      continue;
    }

    const book = getBook(canonicalId, canonicalSym);

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

      const priorPerUnitAcb = book.acbPerUnitCad;

      // Apply old shares removal
      if (oldSharesDisposed.greaterThan(0)) {
        book.quantity = Decimal.max(0, book.quantity.minus(oldSharesDisposed));
        book.totalAcbCad = Decimal.max(0, book.totalAcbCad.minus(oldAcbRemoved));
        updateBookAverages(book);
      }

      // Apply new shares addition (if same or different security)
      const targetSecId = tx.corporateAction.newSecurityId ? resolveId(tx.corporateAction.newSecurityId) : canonicalId;
      const targetBook = getBook(targetSecId, canonicalSym);

      if (newSharesQty.greaterThan(0)) {
        targetBook.quantity = targetBook.quantity.plus(newSharesQty);
        targetBook.totalAcbCad = targetBook.totalAcbCad.plus(newSharesTotalAcb);
        updateBookAverages(targetBook);
      }

      // Record capital gains / losses if recognized or if event is a real taxable disposition
      const isTaxableDispositionCa =
        tx.corporateAction.treatment === 'FULL_CASH_DISPOSITION' ||
        tx.corporateAction.treatment === 'FOREIGN_SHARE_EXCHANGE_TAXABLE' ||
        tx.corporateAction.treatment === 'MIXED_CAPITAL_BOOT_TAXABLE';

      const hasRecognizedGainOrLoss = realizedGain.greaterThan(0) || realizedLoss.greaterThan(0);

      if (hasRecognizedGainOrLoss || isTaxableDispositionCa) {
        const netGainLoss = realizedGain.greaterThan(0)
          ? realizedGain
          : (realizedLoss.greaterThan(0) ? realizedLoss.negated() : new Decimal(0));

        realizedGainsLosses.push({
          id: `RGL_${tx.id}`,
          taxYear: txYear,
          dispositionDate: tx.date,
          securityId: canonicalId,
          symbol: canonicalSym,
          securityName: secName,
          assetClass: sec?.assetClass || 'STK',
          quantityDisposed: toShares(oldSharesDisposed),
          grossProceedsCad: toMoney(proceeds),
          dispositionOutlaysCad: toMoney(0),
          netProceedsCad: toMoney(proceeds),
          acbPerUnitPriorCad: toMoney(priorPerUnitAcb),
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
        securityId: canonicalId,
        symbol: canonicalSym,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Corporate Action: ${tx.corporateAction.treatment} (${caResult.statutoryBasis})`,
        quantityChange: toShares(newSharesQty.minus(oldSharesDisposed)),
        runningQuantity: toShares(targetBook.quantity),
        costChangeCad: toMoney(newSharesTotalAcb.minus(oldAcbRemoved)),
        runningTotalAcbCad: toMoney(targetBook.totalAcbCad),
        runningAcbPerUnitCad: toMoney(targetBook.acbPerUnitCad),
        realizedGainLossCad: realizedGain.greaterThan(0) ? toMoney(realizedGain) : (realizedLoss.greaterThan(0) ? toMoney(realizedLoss.negated()) : undefined),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: caResult.statutoryBasis,
        notes: caResult.explanation,
      });

      auditTrail.push(`[${tx.date}] ${canonicalSym} Corporate Action ${tx.corporateAction.treatment}: ${caResult.explanation}`);
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
        const targetBookId = resolveId(undefined, underlyingSymbol);
        const targetBook = getBook(targetBookId, underlyingSymbol);
        
        const deltaQty = d(effect.shareDeltaQty);
        if (deltaQty.isPositive()) {
          // Acquire shares (e.g. Exercise Long Call, Assigned Short Put)
          const addedQty = deltaQty;
          const addedCost = d(effect.shareCostCad);

          targetBook.quantity = targetBook.quantity.plus(addedQty);
          targetBook.totalAcbCad = targetBook.totalAcbCad.plus(addedCost);
          updateBookAverages(targetBook);

          recordRollforward(txYear, targetBookId, underlyingSymbol, underlyingSymbol, (rf) => {
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
          updateBookAverages(targetBook);

          realizedGainsLosses.push({
            id: `RGL_${tx.id}`,
            taxYear: txYear,
            dispositionDate: tx.date,
            securityId: targetBookId,
            symbol: underlyingSymbol,
            securityName: underlyingSymbol,
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
          securityId: canonicalId,
          symbol: canonicalSym,
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
        securityId: canonicalId,
        symbol: canonicalSym,
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

      auditTrail.push(`[${tx.date}] Option Event ${tx.transactionType} (${canonicalSym}): ${effect.optionExplanation}`);
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

      if (tx.status === 'needs_review' || (!isFromRegistered && !isFromTaxable)) {
        tx.status = 'needs_review';
        auditTrail.push(`[${tx.date}] TRANSFER_IN ${toShares(d(tx.quantity))} ${canonicalSym}: Source account type unknown. Transaction marked needs_review; pool unchanged.`);
        continue;
      }

      if (isFromTaxable && !isFromRegistered) {
        // Taxable -> Taxable (same taxpayer): ignore both legs under unified ITA s. 47 pool
        auditTrail.push(`[${tx.date}] TRANSFER_IN ${toShares(d(tx.quantity))} ${canonicalSym}: Taxable-to-taxable transfer ignored under unified ITA s. 47 pool.`);
        continue;
      }

      // Registered -> Taxable or External -> Taxable: acquisition at FMV
      const qty = d(tx.quantity);
      const costCad = d(tx.amountCad).plus(d(tx.commissionCad));

      book.quantity = book.quantity.plus(qty);
      book.totalAcbCad = book.totalAcbCad.plus(costCad);
      updateBookAverages(book);

      recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
        rf.acquisitionsQuantity = toShares(d(rf.acquisitionsQuantity).plus(qty));
        rf.acquisitionsCostCad = toMoney(d(rf.acquisitionsCostCad).plus(costCad));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: canonicalId,
        symbol: canonicalSym,
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

      auditTrail.push(`[${tx.date}] TRANSFER_IN ${toShares(qty)} ${canonicalSym}: New Total ACB = $${toMoney(book.totalAcbCad)} CAD ($${toMoney(book.acbPerUnitCad)}/unit)`);
      continue;
    }

    if (
      tx.transactionType === 'BUY' ||
      tx.transactionType === 'DIVIDEND_REINVESTED' ||
      tx.transactionType === 'OPENING_BALANCE'
    ) {
      const qty = d(tx.quantity);
      const pendingSl = pendingSuperficialLossByTxId.get(tx.id) || new Decimal(0);
      // Acquisition cost includes price x qty in CAD + commissions + expenses + any superficial loss addition
      let costCad = d(tx.amountCad).plus(d(tx.commissionCad)).plus(pendingSl);
      if (costCad.isZero() && qty.isPositive() && d(tx.price).isPositive()) {
        costCad = qty.times(d(tx.price)).times(d(tx.fxRate || 1)).plus(d(tx.commissionCad)).plus(pendingSl);
      }

      book.quantity = book.quantity.plus(qty);
      book.totalAcbCad = book.totalAcbCad.plus(costCad);
      updateBookAverages(book);

      recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
        rf.acquisitionsQuantity = toShares(d(rf.acquisitionsQuantity).plus(qty));
        rf.acquisitionsCostCad = toMoney(d(rf.acquisitionsCostCad).plus(costCad));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: canonicalId,
        symbol: canonicalSym,
        transactionId: tx.id,
        transactionType: tx.transactionType,
        description: `Acquisition of ${toShares(qty)} units at $${toMoney(costCad)} CAD (incl. $${toMoney(tx.commissionCad)} comm${pendingSl.isPositive() ? ` + $${toMoney(pendingSl)} superficial loss addition` : ''})`,
        quantityChange: toShares(qty),
        runningQuantity: toShares(book.quantity),
        costChangeCad: toMoney(costCad),
        runningTotalAcbCad: toMoney(book.totalAcbCad),
        runningAcbPerUnitCad: toMoney(book.acbPerUnitCad),
        originalCurrency: tx.currency,
        fxRateUsed: toRate(d(tx.fxRate || 1)),
        fxRateSource: tx.fxRateSource,
        statutoryRule: pendingSl.isPositive() ? 'ITA s. 47(1) & s. 53(1)(f) Superficial Loss Cost Addition' : 'ITA s. 47(1) Average Cost Pool Recomputation',
      });

      auditTrail.push(
        `[${tx.date}] BUY ${toShares(qty)} ${canonicalSym}: New Total ACB = $${toMoney(book.totalAcbCad)} CAD ($${toMoney(book.acbPerUnitCad)}/unit)`
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

      if (tx.status === 'needs_review' || (!isToRegistered && !isToTaxable)) {
        tx.status = 'needs_review';
        auditTrail.push(`[${tx.date}] TRANSFER_OUT ${toShares(d(tx.quantity))} ${canonicalSym}: Destination account type unknown. Transaction marked needs_review; no deemed disposition posted.`);
        continue;
      }

      if (isToTaxable && !isToRegistered) {
        // Taxable -> Taxable (same taxpayer): ignore both legs under unified ITA s. 47 pool
        auditTrail.push(`[${tx.date}] TRANSFER_OUT ${toShares(d(tx.quantity))} ${canonicalSym}: Taxable-to-taxable transfer ignored under unified ITA s. 47 pool.`);
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
      updateBookAverages(book);

      const isLoss = rawGainLoss.isNegative();
      const recognizedGainLoss = isLoss ? d(0) : rawGainLoss;

      if (isLoss) {
        const deniedAmt = rawGainLoss.abs();
        superficialLosses.push({
          dispositionTransactionId: tx.id,
          securityId: canonicalId,
          symbol: canonicalSym,
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
        securityId: canonicalId,
        symbol: canonicalSym,
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
        statutoryCitations: isLoss ? ['ITA s. 40(2)(g)(iv)'] : ['ITA s. 69', 'ITA s. 40(1)'],
        explanation: isLoss
          ? 'Transfer to registered account at loss: loss permanently denied under ITA s. 40(2)(g)(iv).'
          : `Transfer to registered account at FMV proceeds $${toMoney(grossProceeds)} CAD vs ACB $${toMoney(acbRemoved)} CAD. Capital gain recognized.`,
      });

      recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
        rf.dispositionsQuantity = toShares(d(rf.dispositionsQuantity).plus(qtyDisposed));
        rf.dispositionsAcbRemovedCad = toMoney(d(rf.dispositionsAcbRemovedCad).plus(acbRemoved));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: canonicalId,
        symbol: canonicalSym,
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
        statutoryRule: isLoss ? 'ITA s. 40(2)(g)(iv) Loss Permanently Denied on Registered Transfer' : 'ITA s. 69 / s. 40(1) Deemed Disposition at FMV',
      });

      auditTrail.push(
        `[${tx.date}] TRANSFER_OUT ${toShares(qtyDisposed)} ${canonicalSym} to ${dstAcctType || 'REGISTERED'}: Realized Gain/Loss = $${toMoney(recognizedGainLoss)} CAD`
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

      // Update pool: disposition removes qty x acb_per_unit
      book.quantity = Decimal.max(0, book.quantity.minus(qtyDisposed));
      book.totalAcbCad = Decimal.max(0, book.totalAcbCad.minus(acbRemoved));
      updateBookAverages(book);

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
          securityId: canonicalId,
          symbol: canonicalSym,
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
          const deniedLoss = d(slCheck.deniedLossCad);
          if (slCheck.replacementTransactionId && slCheck.replacementDate && slCheck.replacementDate >= tx.date) {
            const currentPending = pendingSuperficialLossByTxId.get(slCheck.replacementTransactionId) || new Decimal(0);
            pendingSuperficialLossByTxId.set(slCheck.replacementTransactionId, currentPending.plus(deniedLoss));
          } else {
            book.totalAcbCad = book.totalAcbCad.plus(deniedLoss);
            updateBookAverages(book);
          }

          recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
            rf.superficialLossAdditionsCad = toMoney(d(rf.superficialLossAdditionsCad).plus(deniedLoss));
          });
        }
      }

      recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
        rf.dispositionsQuantity = toShares(d(rf.dispositionsQuantity).plus(qtyDisposed));
        rf.dispositionsAcbRemovedCad = toMoney(d(rf.dispositionsAcbRemovedCad).plus(acbRemoved));
        rf.realizedGainLossTotalCad = toMoney(d(rf.realizedGainLossTotalCad).plus(finalRecognizedGainLoss));
      });

      realizedGainsLosses.push({
        id: `RGL_${tx.id}`,
        taxYear: txYear,
        dispositionDate: tx.date,
        settlementDate: tx.settlementDate,
        securityId: canonicalId,
        symbol: canonicalSym,
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
        securityId: canonicalId,
        symbol: canonicalSym,
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
        `[${tx.date}] SELL ${toShares(qtyDisposed)} ${canonicalSym}: Realized Gain/Loss = $${toMoney(finalRecognizedGainLoss)} CAD`
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
          securityId: canonicalId,
          symbol: canonicalSym,
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
      updateBookAverages(book);

      recordRollforward(txYear, canonicalId, canonicalSym, secName, (rf) => {
        rf.rocAdjustmentsCad = toMoney(d(rf.rocAdjustmentsCad).plus(rocAmount));
      });

      ledger.push({
        id: `LED_${tx.id}`,
        date: tx.date,
        securityId: canonicalId,
        symbol: canonicalSym,
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

      auditTrail.push(`[${tx.date}] ROC ${canonicalSym}: -$${toMoney(rocAmount)} CAD (New ACB = $${toMoney(book.totalAcbCad)})`);
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
    if (isNonEquityOrCash(book.symbol, undefined, secId)) return;
    const isZero = book.quantity.isZero() || !book.quantity.isPositive();
    securityBalances.set(secId, {
      quantity: isZero ? '0' : toShares(book.quantity),
      totalAcbCad: isZero ? '0.00' : toMoney(book.totalAcbCad),
      acbPerUnitCad: isZero ? '0.00' : toMoney(book.acbPerUnitCad),
      symbol: book.symbol,
      name: securityMap.get(secId)?.name || book.symbol,
    });
  });

  canonicalSecIdMap.forEach((targetId, sourceKey) => {
    const book = books.get(targetId);
    if (book) {
      const isZero = book.quantity.isZero() || !book.quantity.isPositive();
      securityBalances.set(sourceKey, {
        quantity: isZero ? '0' : toShares(book.quantity),
        totalAcbCad: isZero ? '0.00' : toMoney(book.totalAcbCad),
        acbPerUnitCad: isZero ? '0.00' : toMoney(book.acbPerUnitCad),
        symbol: book.symbol,
        name: securityMap.get(sourceKey)?.name || securityMap.get(targetId)?.name || book.symbol,
      });
    }
  });

  let totalGain = new Decimal(0);
  let totalLoss = new Decimal(0);
  realizedGainsLosses.forEach((rgl) => {
    const amount = d(rgl.recognizedGainLossCad);
    if (!amount.isNaN() && amount.isFinite()) {
      if (amount.isPositive()) {
        totalGain = totalGain.plus(amount);
      } else if (amount.isNegative()) {
        totalLoss = totalLoss.plus(amount.abs());
      }
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
  const openPosMap = new Map<string, { quantity: Decimal; conid?: string }>();

  openPositions.forEach((pos) => {
    const symbol = pos.symbol?.trim();
    if (!symbol || isNonEquityOrCash(symbol)) return;
    const qty = d(pos.quantity || '0');
    if (!qty.isNaN() && qty.isFinite()) {
      const existing = openPosMap.get(symbol);
      if (existing) {
        existing.quantity = existing.quantity.plus(qty);
      } else {
        openPosMap.set(symbol, { quantity: qty, conid: pos.conid });
      }
    }
  });

  const calcPosMap = new Map<string, { quantity: Decimal; totalAcb: Decimal; secId: string }>();
  securityBalances.forEach((bal, secId) => {
    const sym = bal.symbol?.trim();
    if (!sym || isNonEquityOrCash(sym)) return;
    const calcQty = d(bal.quantity);
    if (calcQty.isPositive() && !calcQty.isNaN() && calcQty.isFinite()) {
      if (!calcPosMap.has(sym)) {
        calcPosMap.set(sym, { quantity: calcQty, totalAcb: d(bal.totalAcbCad), secId });
      }
    }
  });

  calcPosMap.forEach((calc, symbol) => {
    const brokerObj = openPosMap.get(symbol);
    const brokerReported = brokerObj ? brokerObj.quantity : d(0);
    const diff = calc.quantity.minus(brokerReported).abs();
    if (diff.greaterThan(0.0001)) {
      breaks.push({
        securityId: calc.secId,
        symbol,
        calculatedQuantity: toShares(calc.quantity),
        brokerReportedQuantity: toShares(brokerReported),
        quantityDiscrepancy: toShares(calc.quantity.minus(brokerReported)),
        calculatedAcbCad: toMoney(calc.totalAcb),
        status: 'QUANTITY_BREAK',
        explanation: `Calculated quantity (${toShares(calc.quantity)}) differs from IBKR Open Position (${toShares(brokerReported)})`,
      });
    }
  });

  openPosMap.forEach((brokerObj, symbol) => {
    if (brokerObj.quantity.greaterThan(0.0001) && !calcPosMap.has(symbol)) {
      breaks.push({
        securityId: brokerObj.conid ? `CON_${brokerObj.conid}` : `SYM_${symbol}`,
        symbol,
        calculatedQuantity: '0',
        brokerReportedQuantity: toShares(brokerObj.quantity),
        quantityDiscrepancy: toShares(brokerObj.quantity.negated()),
        calculatedAcbCad: '0.00',
        status: 'QUANTITY_BREAK',
        explanation: `IBKR reported open position of ${toShares(brokerObj.quantity)} units, but calculated taxable pool is 0`,
      });
    }
  });

  return breaks;
}
