import { XMLParser } from 'fast-xml-parser';
import { Transaction, Account, SecurityMaster, OpenPosition, CorporateActionDetails } from '../types/tax';
import { convertToCad } from '../engine/bocFx';
import { classifyBrokerCorporateAction } from '../engine/corporateActions';

export interface ParsedFlexStatement {
  accounts: Account[];
  securities: SecurityMaster[];
  transactions: Transaction[];
  openPositions: OpenPosition[];
  rawReferenceCode?: string;
  queryId?: string;
  statementDate?: string;
  hasCorporateActionsSection: boolean;
  hasTradesSection: boolean;
  hasCashTransactionsSection: boolean;
  hasOpenPositionsSection: boolean;
  hasAccountInformationSection: boolean;
  hasFinancialInstrumentInformationSection: boolean;
  hasConversionDetailsSection: boolean;
  hasOptionExercisesSection: boolean;
  hasTransfersSection: boolean;
  errors: string[];
}

export function parseIbkrFlexXml(xmlContent: string): ParsedFlexStatement {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    trimValues: true,
  });

  const parsed = parser.parse(xmlContent);
  const errors: string[] = [];

  const root = parsed.FlexQueryResponse || parsed.FlexStatements || parsed;
  const flexStatements = Array.isArray(root.FlexStatements?.FlexStatement)
    ? root.FlexStatements.FlexStatement
    : root.FlexStatement
    ? [root.FlexStatement]
    : [];

  const accountsMap = new Map<string, Account>();
  const securitiesMap = new Map<string, SecurityMaster>();
  const transactions: Transaction[] = [];
  const openPositions: OpenPosition[] = [];


  let hasCorporateActionsSection = false;
  let hasTradesSection = false;
  let hasCashTransactionsSection = false;
  let hasOpenPositionsSection = false;
  let hasAccountInformationSection = false;
  let hasFinancialInstrumentInformationSection = false;
  let hasConversionDetailsSection = false;
  let hasOptionExercisesSection = false;
  let hasTransfersSection = false;


  const toArray = (obj: any): any[] => {
    if (!obj) return [];
    return Array.isArray(obj) ? obj : [obj];
  };

  for (const stmt of flexStatements) {
    if (stmt.AccountInformation !== undefined || stmt.AccountInfo !== undefined) hasAccountInformationSection = true;
    if (stmt.SecuritiesInfo !== undefined || stmt.FinancialInstrumentInformation !== undefined) hasFinancialInstrumentInformationSection = true;
    if (stmt.Trades !== undefined) hasTradesSection = true;
    if (stmt.CorporateActions !== undefined) hasCorporateActionsSection = true;
    if (stmt.CashTransactions !== undefined) hasCashTransactionsSection = true;
    if (stmt.OpenPositions !== undefined) hasOpenPositionsSection = true;
    if (stmt.OptionExercises !== undefined || stmt.OptionEAE !== undefined || stmt.OptionExercisesAndAssignments !== undefined) hasOptionExercisesSection = true;
    if (stmt.Transfers !== undefined) hasTransfersSection = true;
    if (stmt.ConversionDetails !== undefined || stmt.FxTransactions !== undefined || stmt.CurrencyConversions !== undefined) hasConversionDetailsSection = true;

    // 1. Account Information
    const acctInfoList = toArray(stmt.AccountInformation?.AccountInfo || stmt.AccountInformation || stmt.AccountInfo);
    if (acctInfoList.length > 0) hasAccountInformationSection = true;
    for (const info of acctInfoList) {
      const acctId = info.accountId || info.account || 'U_DEFAULT';
      const alias = info.acctAlias || info.accountAlias || info.accountTitle || acctId;
      const currency = info.currency || info.baseCurrency || 'CAD';
      const typeStr = (info.type || info.accountType || '').toUpperCase();

      let accountType: Account['accountType'] = 'taxable';
      if (typeStr.includes('TFSA') || alias.toUpperCase().includes('TFSA')) accountType = 'tfsa';
      else if (typeStr.includes('RRSP') || alias.toUpperCase().includes('RRSP') || typeStr.includes('RSP')) accountType = 'rrsp';
      else if (typeStr.includes('FHSA') || alias.toUpperCase().includes('FHSA')) accountType = 'fhsa';
      else if (typeStr.includes('RRIF') || alias.toUpperCase().includes('RRIF')) accountType = 'rrif';
      else if (typeStr.includes('RESP') || alias.toUpperCase().includes('RESP')) accountType = 'resp';

      accountsMap.set(acctId, {
        id: acctId,
        accountId: acctId,
        name: `${alias} (${accountType.toUpperCase()})`,
        broker: 'IBKR',
        accountType,
        baseCurrency: currency,
        isHouseholdAffiliate: false,
      });
    }

    // 2. Financial Instrument Information (Security Master)
    const secList = toArray(stmt.SecuritiesInfo?.SecurityInfo || stmt.FinancialInstrumentInformation?.FinancialInstrumentInfo);
    if (secList.length > 0) hasFinancialInstrumentInformationSection = true;
    for (const s of secList) {
      const conid = s.conid || s.conId || '';
      const symbol = s.symbol || s.ticker || '';
      const assetClass = (s.assetCategory || s.assetClass || 'STK').toUpperCase();
      const isin = s.isin || '';
      const cusip = s.cusip || '';
      const secId = conid ? `CON_${conid}` : (isin ? `ISIN_${isin}` : `SYM_${symbol}`);

      let optionDetails;
      if (assetClass === 'OPT') {
        const rightStr = (s.putCall || s.right || s.putOrCall || s.type || s.description || '').toUpperCase();
        const isPut = rightStr.includes('PUT') || rightStr === 'P' || rightStr.endsWith(' P');
        optionDetails = {
          underlyingSymbol: s.underlyingSymbol || symbol.split(' ')[0] || symbol,
          putOrCall: (isPut ? 'PUT' : 'CALL') as 'PUT' | 'CALL',
          strike: parseFloat(s.strike || '0').toString(),
          expiryDate: s.expiry || s.maturity || '',
          multiplier: parseInt(s.multiplier || '100', 10),
          deliverable: s.deliverable,
        };
      }

      securitiesMap.set(secId, {
        id: secId,
        symbol,
        name: s.description || symbol,
        assetClass: assetClass === 'OPT' ? 'OPT' : (assetClass === 'CASH' ? 'CASH' : 'STK'),
        isin,
        cusip,
        conid,
        listingExchange: s.listingExchange || s.exchange,
        currency: s.currency || 'USD',
        countryOfOrigin: (s.countryOfOrigin || (symbol.endsWith('.TO') || symbol.endsWith('.V') ? 'CA' : 'US')) as any,
        optionDetails,
      });
    }

    // 3. Trades (Executions)
    const tradesList = toArray(stmt.Trades?.Trade || stmt.Trades?.Execution);
    if (tradesList.length > 0) hasTradesSection = true;
    if (tradesList.length > 0) hasTradesSection = true;

    for (const t of tradesList) {
      const tradeId = t.tradeID || t.ibExecID || t.transactionID || `${t.tradeDate}_${t.symbol}_${t.quantity}_${t.tradePrice}`;
      const symbol = t.symbol || '';
      const conid = t.conid || t.conId || '';
      const secId = conid ? `CON_${conid}` : `SYM_${symbol}`;
      const rawDate = t.tradeDate || t.dateTime?.substring(0, 10) || '';
      const date = rawDate.replace(/\//g, '-');
      const qty = Math.abs(parseFloat(t.quantity || '0'));
      const price = parseFloat(t.tradePrice || t.price || '0');
      const currency = t.currency || 'USD';
      const comm = Math.abs(parseFloat(t.ibCommission || t.commission || '0'));
      const buySell = (t.buySell || (parseFloat(t.quantity || '0') > 0 ? 'BUY' : 'SELL')).toUpperCase();
      const assetCat = (t.assetCategory || 'STK').toUpperCase();
      const code = t.code || t.notes || '';
      const isCancelled = code.includes('Ca') || t.transactionType === 'CANCEL';

      let txType: Transaction['transactionType'] = 'BUY';
      if (assetCat === 'OPT') {
        if (buySell.includes('BUY')) {
          txType = code.includes('C') ? 'BUY_TO_CLOSE_OPT' : 'BUY_TO_OPEN_OPT';
        } else {
          txType = code.includes('O') ? 'SELL_TO_OPEN_OPT' : 'SELL_TO_CLOSE_OPT';
        }
      } else {
        txType = buySell.includes('BUY') ? 'BUY' : 'SELL';
      }

      // Check assignment / exercise code
      if (code.includes('A') || code.includes('Assign')) {
        txType = buySell.includes('BUY') ? 'ASSIGNED_SHORT_PUT' : 'ASSIGNED_SHORT_CALL';
      } else if (code.includes('Ex') || code.includes('Exerc')) {
        txType = buySell.includes('BUY') ? 'EXERCISE_LONG_CALL' : 'EXERCISE_LONG_PUT';
      }

      const grossAmount = qty * price;
      const explicitFx = t.fxRateToBase ? parseFloat(t.fxRateToBase) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);
      const { amountCad: commCad } = convertToCad(comm, currency, date, explicitFx);

      // Register security if not already present
      if (!securitiesMap.has(secId)) {
        securitiesMap.set(secId, {
          id: secId,
          symbol,
          name: t.description || symbol,
          assetClass: assetCat === 'OPT' ? 'OPT' : 'STK',
          conid,
          currency,
        });
      }

      transactions.push({
        id: `IBKR_TR_${tradeId}`,
        accountId: t.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        date,
        settlementDate: t.settleDateTarget?.replace(/\//g, '-'),
        transactionType: txType,
        quantity: String(qty),
        price: String(price),
        currency,
        commission: String(comm),
        totalGrossAmount: grossAmount.toString(),
        totalNetAmount: (grossAmount + (buySell.includes('BUY') ? comm : -comm)).toString(),
        fxRate: String(fxRate),
        fxRateSource: fxSource,
        amountCad: String(amountCad),
        commissionCad: commCad.toString(),
        totalOutlaysCad: commCad.toString(),
        ibkrCode: code,
        ibkrTransactionId: tradeId,
        status: isCancelled ? 'rejected' : 'auto_approved',
        source: 'IBKR_FLEX_API',
        isCancelled,
      });
    }

    // 4. Corporate Actions
    const caList = toArray(stmt.CorporateActions?.CorporateAction);
    if (caList.length > 0) hasCorporateActionsSection = true;

    for (const ca of caList) {
      const caId = ca.actionID || ca.transactionID || `${ca.reportDate}_${ca.symbol}_${ca.type}`;
      const symbol = ca.symbol || '';
      const conid = ca.conid || '';
      const secId = conid ? `CON_${conid}` : `SYM_${symbol}`;
      const rawDate = ca.reportDate || ca.dateTime?.substring(0, 10) || '';
      const date = rawDate.replace(/\//g, '-');
      const desc = ca.description || ca.type || 'Corporate Action';
      const cash = parseFloat(ca.cashProceeds || ca.amount || '0');
      const qty = parseFloat(ca.quantity || '0');
      const currency = ca.currency || 'USD';

      const isCaTarget = symbol.endsWith('.TO') || symbol.endsWith('.V');
      const { suggestedTreatment, statutoryBasis, notes } = classifyBrokerCorporateAction(
        desc,
        Math.abs(cash) > 0,
        Math.abs(qty) > 0,
        isCaTarget
      );

      const { amountCad: cashCad, fxRate, fxSource } = convertToCad(Math.abs(cash), currency, date);

      const caDetails: CorporateActionDetails = {
        treatment: suggestedTreatment,
        statutoryBasis,
        brokerDescription: desc,
        oldSecurityId: secId,
        totalCashReceived: String(cashCad),
        newSharesReceived: String(Math.abs(qty)),
        userNotes: notes,
      };

      transactions.push({
        id: `IBKR_CA_${caId}`,
        accountId: ca.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        date,
        transactionType: suggestedTreatment === 'CONTINUITY_SPLIT' ? 'STOCK_SPLIT' : 'MERGER_MIXED',
        quantity: Math.abs(qty).toString(),
        price: '0',
        currency,
        commission: '0',
        totalGrossAmount: Math.abs(cash).toString(),
        totalNetAmount: Math.abs(cash).toString(),
        fxRate: String(fxRate),
        fxRateSource: fxSource,
        amountCad: String(cashCad),
        commissionCad: '0',
        totalOutlaysCad: '0',
        corporateAction: caDetails,
        status: suggestedTreatment === 'CONTINUITY_SPLIT' ? 'auto_approved' : 'needs_review',
        reviewNotes: notes,
        source: 'IBKR_FLEX_API',
      });
    }

    // 5. Cash Transactions (Dividends, ROC, Withholding)
    const cashList = toArray(stmt.CashTransactions?.CashTransaction);
    if (cashList.length > 0) hasCashTransactionsSection = true;

    for (const c of cashList) {
      const cId = c.transactionID || `${c.dateTime}_${c.type}_${c.amount}`;
      const rawDate = c.reportDate || c.dateTime?.substring(0, 10) || '';
      const date = rawDate.replace(/\//g, '-');
      const type = (c.type || '').toUpperCase();
      const desc = c.description || '';
      const amount = Math.abs(parseFloat(c.amount || '0'));
      const currency = c.currency || 'USD';
      const symbol = c.symbol || 'CASH';
      const secId = `SYM_${symbol}`;

      const { amountCad, fxRate, fxSource } = convertToCad(amount, currency, date);

      let txType: Transaction['transactionType'] = 'DIVIDEND_CASH';
      if (type.includes('DIVIDEND') || desc.toUpperCase().includes('DIVIDEND')) {
        txType = 'DIVIDEND_CASH';
      } else if (type.includes('WITHHOLDING') || desc.toUpperCase().includes('WITHHOLDING') || desc.toUpperCase().includes('WHT')) {
        txType = 'WITHHOLDING_TAX';
      } else if (type.includes('RETURN OF CAPITAL') || desc.toUpperCase().includes('RETURN OF CAPITAL') || type.includes('ROC')) {
        txType = 'RETURN_OF_CAPITAL';
      } else if (type.includes('PAYMENT IN LIEU') || desc.toUpperCase().includes('PAYMENT IN LIEU')) {
        txType = 'PAYMENT_IN_LIEU';
      } else if (type.includes('INTEREST') || desc.toUpperCase().includes('INTEREST')) {
        txType = parseFloat(c.amount || '0') >= 0 ? 'INTEREST_RECEIVED' : 'INTEREST_PAID';
      }

      transactions.push({
        id: `IBKR_CASH_${cId}`,
        accountId: c.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        date,
        transactionType: txType,
        quantity: '0',
        price: '0',
        currency,
        commission: '0',
        totalGrossAmount: amount.toString(),
        totalNetAmount: amount.toString(),
        fxRate: String(fxRate),
        fxRateSource: fxSource,
        amountCad: String(amountCad),
        commissionCad: '0',
        totalOutlaysCad: '0',
        status: 'auto_approved',
        source: 'IBKR_FLEX_API',
      });
    }

    // 6. Open Positions (for Reconciliation)
    const posList = toArray(stmt.OpenPositions?.OpenPosition);
    if (posList.length > 0) hasOpenPositionsSection = true;

    for (const p of posList) {
      const symbol = p.symbol || '';
      const conid = p.conid || '';
      const secId = conid ? `CON_${conid}` : `SYM_${symbol}`;
      const qty = parseFloat(p.position || p.quantity || '0');
      const costPrice = parseFloat(p.costBasisPrice || p.openPrice || '0');
      const markPrice = parseFloat(p.markPrice || '0');
      const currency = p.currency || 'USD';
      const posVal = parseFloat(p.positionValue || '0');
      const { amountCad: posValCad } = convertToCad(posVal, currency, stmt.toDate || '2026-08-22');

      openPositions.push({
        accountId: p.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        conid,
        isin: p.isin,
        quantity: String(qty),
        costPrice: String(costPrice),
        currency,
        markPrice: String(markPrice),
        positionValueCad: String(posValCad),
        asOfDate: stmt.toDate || stmt.reportDate || '2026-08-22',
      });
    }

    // 7. Option Exercises and Assignments
    const optList = toArray(
      stmt.OptionExercises?.OptionExercise ||
      stmt.OptionEAE?.OptionEAE ||
      stmt.OptionExercisesAndAssignments?.OptionExerciseAndAssignment
    );
    for (const opt of optList) {
      const optId = opt.transactionID || opt.tradeID || opt.actionID || `${opt.reportDate || opt.tradeDate}_${opt.symbol}_${opt.quantity}`;
      const symbol = opt.symbol || '';
      const conid = opt.conid || opt.conId || '';
      const secId = conid ? `CON_${conid}` : `SYM_${symbol}`;
      const rawDate = opt.tradeDate || opt.reportDate || opt.dateTime?.substring(0, 10) || '';
      const date = rawDate.replace(/\//g, '-');
      const qty = Math.abs(parseFloat(opt.quantity || '0'));
      const strike = parseFloat(opt.tradePrice || opt.strikePrice || opt.strike || '0');
      const currency = opt.currency || 'USD';
      const comm = Math.abs(parseFloat(opt.ibCommission || opt.commission || '0'));
      const grossAmount = qty * strike;
      const explicitFx = opt.fxRateToBase ? parseFloat(opt.fxRateToBase) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);
      const { amountCad: commCad } = convertToCad(comm, currency, date, explicitFx);

      const rawType = (opt.type || opt.transactionType || opt.action || opt.putCall || opt.right || opt.assetCategory || opt.description || '').toUpperCase();
      const isPut = rawType.includes('PUT') || rawType === 'P' || rawType.endsWith(' P');
      const code = opt.code || opt.notes || '';
      let txType: Transaction['transactionType'] = 'EXERCISE_LONG_CALL';
      if (rawType.includes('ASSIGN') || code.includes('A')) {
        txType = isPut ? 'ASSIGNED_SHORT_PUT' : 'ASSIGNED_SHORT_CALL';
      } else {
        txType = isPut ? 'EXERCISE_LONG_PUT' : 'EXERCISE_LONG_CALL';
      }

      // Check if already present from Trades section (share tradeID or conid+date or date+symbol)
      const existingTradeIndex = transactions.findIndex((t) => {
        if (t.ibkrTransactionId && optId && t.ibkrTransactionId === optId) return true;
        if (t.ibkrExecutionId && optId && t.ibkrExecutionId === optId) return true;
        if (t.id === `IBKR_TR_${optId}` || t.id === `IBKR_OPT_${optId}`) return true;
        if (t.date === date && (t.securityId === secId || t.symbol === symbol || t.symbol === opt.underlyingSymbol)) {
          return true;
        }
        return false;
      });

      if (existingTradeIndex >= 0) {
        // Update existing trade row with linked option exercise type and code
        const existing = transactions[existingTradeIndex];
        existing.ibkrCode = existing.ibkrCode || code || rawType;
        if (!existing.transactionType.includes('ASSIGNED') && !existing.transactionType.includes('EXERCISE')) {
          existing.transactionType = txType;
        }
        continue;
      }

      transactions.push({
        id: `IBKR_OPT_${optId}`,
        accountId: opt.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        date,
        transactionType: txType,
        quantity: String(qty),
        price: String(strike),
        currency,
        commission: String(comm),
        totalGrossAmount: String(grossAmount),
        totalNetAmount: String(grossAmount + comm),
        fxRate: String(fxRate),
        fxRateSource: fxSource,
        amountCad: String(amountCad),
        commissionCad: String(commCad),
        totalOutlaysCad: String(commCad),
        ibkrCode: code || rawType,
        ibkrTransactionId: optId,
        status: 'auto_approved',
        source: 'IBKR_FLEX_API',
      });
    }

    // 8. Transfers (In / Out)
    const xferList = toArray(stmt.Transfers?.Transfer);
    for (const xfer of xferList) {
      const xferId = xfer.transactionID || xfer.transferID || `${xfer.reportDate || xfer.date}_${xfer.symbol}_${xfer.quantity}`;
      const symbol = xfer.symbol || '';
      const conid = xfer.conid || xfer.conId || '';
      const secId = conid ? `CON_${conid}` : `SYM_${symbol}`;
      const rawDate = xfer.date || xfer.reportDate || xfer.dateTime?.substring(0, 10) || '';
      const date = rawDate.replace(/\//g, '-');
      const qty = Math.abs(parseFloat(xfer.quantity || '0'));
      const grossAmount = Math.abs(parseFloat(xfer.costBasis || xfer.positionAmount || xfer.amount || '0'));
      const price = qty > 0 && grossAmount > 0 ? grossAmount / qty : 0;
      const currency = xfer.currency || 'USD';
      const explicitFx = xfer.fxRateToBase ? parseFloat(xfer.fxRateToBase) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);

      const dir = (xfer.direction || xfer.type || '').toUpperCase();
      const isOut = dir.includes('OUT') || parseFloat(xfer.quantity || '0') < 0;
      const txType: Transaction['transactionType'] = isOut ? 'TRANSFER_OUT' : 'TRANSFER_IN';

      const targetAcctId = xfer.targetAccount || xfer.targetAccountId || xfer.toAccount || xfer.fromAccount || '';
      const targetAlias = (xfer.targetAccountAlias || xfer.targetAccountType || xfer.accountAlias || xfer.description || xfer.type || '').toUpperCase();

      const categorizeType = (id: string, aliasStr: string): Account['accountType'] | undefined => {
        if (id && accountsMap.has(id)) {
          return accountsMap.get(id)!.accountType;
        }
        if (aliasStr.includes('TFSA')) return 'tfsa';
        if (aliasStr.includes('RRSP') || aliasStr.includes('RSP')) return 'rrsp';
        if (aliasStr.includes('FHSA')) return 'fhsa';
        if (aliasStr.includes('RRIF')) return 'rrif';
        if (aliasStr.includes('RESP')) return 'resp';
        if (aliasStr.includes('LIRA') || aliasStr.includes('REGISTERED')) return 'other_registered';
        if (aliasStr.includes('MARGIN') || aliasStr.includes('CASH') || aliasStr.includes('TAXABLE')) return 'taxable';
        return undefined;
      };

      const otherAcctType = categorizeType(targetAcctId, targetAlias);

      transactions.push({
        id: `IBKR_XFER_${xferId}`,
        accountId: xfer.accountId || 'U_DEFAULT',
        targetAccountId: isOut ? targetAcctId : undefined,
        destinationAccountType: isOut ? otherAcctType : undefined,
        sourceAccountId: !isOut ? targetAcctId : undefined,
        sourceAccountType: !isOut ? otherAcctType : undefined,
        securityId: secId,
        symbol,
        date,
        transactionType: txType,
        quantity: String(qty),
        price: String(price),
        currency,
        commission: '0',
        totalGrossAmount: String(grossAmount),
        totalNetAmount: String(grossAmount),
        fxRate: String(fxRate),
        fxRateSource: fxSource,
        amountCad: String(amountCad),
        commissionCad: '0',
        totalOutlaysCad: '0',
        ibkrTransactionId: xferId,
        reviewNotes: `${isOut ? 'Transfer OUT to' : 'Transfer IN from'} ${targetAcctId || 'other account'} (${otherAcctType?.toUpperCase() || 'UNKNOWN'})`,
        status: 'auto_approved',
        source: 'IBKR_FLEX_API',
      });
    }
  }

  // Ensure default account exists if none parsed
  if (accountsMap.size === 0) {
    accountsMap.set('U_DEFAULT', {
      id: 'U_DEFAULT',
      accountId: 'U_DEFAULT',
      name: 'Primary Taxable Account',
      broker: 'IBKR',
      accountType: 'taxable',
      baseCurrency: 'CAD',
      isHouseholdAffiliate: false,
    });
  }


  return {
    accounts: Array.from(accountsMap.values()),
    securities: Array.from(securitiesMap.values()),
    transactions,
    openPositions,
    rawReferenceCode: parsed.FlexQueryResponse?.queryId || parsed.FlexStatements?.queryId,
    queryId: parsed.FlexQueryResponse?.queryName || '',
    statementDate: parsed.FlexQueryResponse?.whenGenerated || parsed.FlexStatements?.whenGenerated,
    hasCorporateActionsSection,
    hasTradesSection,
    hasCashTransactionsSection,
    hasOpenPositionsSection,
    hasAccountInformationSection,
    hasFinancialInstrumentInformationSection,
    hasConversionDetailsSection,
    hasOptionExercisesSection,
    hasTransfersSection,
    errors,
  };

}
