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

  const toArray = (obj: any): any[] => {
    if (!obj) return [];
    return Array.isArray(obj) ? obj : [obj];
  };

  for (const stmt of flexStatements) {
    // 1. Account Information
    const acctInfoList = toArray(stmt.AccountInformation || stmt.AccountInfo);
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
    for (const s of secList) {
      const conid = s.conid || s.conId || '';
      const symbol = s.symbol || s.ticker || '';
      const assetClass = (s.assetCategory || s.assetClass || 'STK').toUpperCase();
      const isin = s.isin || '';
      const cusip = s.cusip || '';
      const secId = conid ? `CON_${conid}` : (isin ? `ISIN_${isin}` : `SYM_${symbol}`);

      let optionDetails;
      if (assetClass === 'OPT') {
        optionDetails = {
          underlyingSymbol: s.underlyingSymbol || symbol.split(' ')[0] || symbol,
          putOrCall: (s.putCall || (symbol.includes('P') ? 'PUT' : 'CALL')).toUpperCase() as 'PUT' | 'CALL',
          strike: parseFloat(s.strike || '0'),
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
        quantity: qty,
        price,
        currency,
        commission: comm,
        totalGrossAmount: grossAmount,
        totalNetAmount: grossAmount + (buySell.includes('BUY') ? comm : -comm),
        fxRate,
        fxRateSource: fxSource,
        amountCad,
        commissionCad: commCad,
        totalOutlaysCad: commCad,
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
        totalCashReceived: cashCad,
        newSharesReceived: Math.abs(qty),
        userNotes: notes,
      };

      transactions.push({
        id: `IBKR_CA_${caId}`,
        accountId: ca.accountId || 'U_DEFAULT',
        securityId: secId,
        symbol,
        date,
        transactionType: suggestedTreatment === 'CONTINUITY_SPLIT' ? 'STOCK_SPLIT' : 'MERGER_MIXED',
        quantity: Math.abs(qty),
        price: 0,
        currency,
        commission: 0,
        totalGrossAmount: Math.abs(cash),
        totalNetAmount: Math.abs(cash),
        fxRate,
        fxRateSource: fxSource,
        amountCad: cashCad,
        commissionCad: 0,
        totalOutlaysCad: 0,
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
        quantity: 0,
        price: 0,
        currency,
        commission: 0,
        totalGrossAmount: amount,
        totalNetAmount: amount,
        fxRate,
        fxRateSource: fxSource,
        amountCad,
        commissionCad: 0,
        totalOutlaysCad: 0,
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
        quantity: qty,
        costPrice,
        currency,
        markPrice,
        positionValueCad: posValCad,
        fifoPnlUnrealized: parseFloat(p.fifoPnlUnrealized || '0'),
        asOfDate: stmt.toDate || stmt.reportDate || '2026-08-22',
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
    hasCorporateActionsSection,
    hasTradesSection,
    hasCashTransactionsSection,
    hasOpenPositionsSection,
    errors,
  };
}
