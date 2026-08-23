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
  hasLotBreakout?: boolean;
  hasDateParseError?: boolean;
  errors: string[];
}

const isAssignmentCode = (codeStr: string): boolean => {
  if (!codeStr) return false;
  const tokens = codeStr.split(/[;,; ]+/).map((s) => s.trim());
  return tokens.includes('A') || codeStr.toLowerCase().includes('assign');
};

const toArray = (obj: any): any[] => {
  if (obj === undefined || obj === null || obj === '') return [];
  return Array.isArray(obj) ? obj : [obj];
};

function getAttr(node: any, ...keys: string[]): string {
  if (!node || typeof node !== 'object') return '';
  for (const key of keys) {
    if (node[key] !== undefined && node[key] !== null) {
      if (typeof node[key] === 'string' || typeof node[key] === 'number' || typeof node[key] === 'boolean') {
        const v = String(node[key]).trim();
        if (v !== '') return v;
      }
    }
    const atKey = `@_${key}`;
    if (node[atKey] !== undefined && node[atKey] !== null) {
      if (typeof node[atKey] === 'string' || typeof node[atKey] === 'number' || typeof node[atKey] === 'boolean') {
        const v = String(node[atKey]).trim();
        if (v !== '') return v;
      }
    }
  }
  return '';
}

export function isNonEquityOrCash(symbol?: string, assetCategory?: string, secId?: string): boolean {
  if (!symbol && !secId && !assetCategory) return true;
  const sym = (symbol || '').trim().toUpperCase();
  const cat = (assetCategory || '').trim().toUpperCase();
  const id = (secId || '').trim().toUpperCase();

  if (cat === 'CASH' || cat === 'FX' || cat === 'FOREX' || cat === 'CURRENCY' || cat === 'CASH_REPORT') return true;
  if (sym === 'CASH' || sym.startsWith('CASH.') || sym.startsWith('CASH_')) return true;
  if (id === 'SYM_CASH' || id.startsWith('SYM_CASH.') || id === 'CON_CASH') return true;

  // Currency pairs like USD.CAD, CAD.USD, EUR.USD
  if (/^[A-Z]{3}\.[A-Z]{3}$/.test(sym)) return true;
  if (/^SYM_[A-Z]{3}\.[A-Z]{3}$/.test(id)) return true;

  // Standalone currencies when in cash context
  const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'NZD', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK'];
  if (CURRENCIES.includes(sym) && (cat === 'CASH' || cat === 'FX' || cat === 'FOREX' || cat === '')) {
    return true;
  }

  return false;
}

function getNum(node: any, ...keys: string[]): number {
  const str = getAttr(node, ...keys);
  if (!str) return 0;
  const cleaned = str.replace(/[$, ]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function parseIbkrDate(rawDateStr: string): { date: string; parseError: boolean } {
  if (!rawDateStr) return { date: '', parseError: false };
  const str = rawDateStr.trim().replace(/\//g, '-');
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
    return { date: str.substring(0, 10), parseError: false };
  }
  if (/^\d{8}/.test(str)) {
    const y = str.substring(0, 4);
    const m = str.substring(4, 6);
    const d = str.substring(6, 8);
    return { date: `${y}-${m}-${d}`, parseError: false };
  }
  return { date: str, parseError: true };
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

  // 1. Resolve statements:
  // FlexQueryResponse.FlexStatements.FlexStatement
  // then FlexStatements.FlexStatement
  // then FlexStatement
  // Always toArray() that node. Never treat FlexStatements itself as a statement.
  let rawStmtNodes: any = undefined;
  if (parsed?.FlexQueryResponse?.FlexStatements?.FlexStatement !== undefined) {
    rawStmtNodes = parsed.FlexQueryResponse.FlexStatements.FlexStatement;
  } else if (parsed?.FlexStatements?.FlexStatement !== undefined) {
    rawStmtNodes = parsed.FlexStatements.FlexStatement;
  } else if (parsed?.FlexStatement !== undefined) {
    rawStmtNodes = parsed.FlexStatement;
  } else if (parsed?.FlexQueryResponse?.FlexStatement !== undefined) {
    rawStmtNodes = parsed.FlexQueryResponse.FlexStatement;
  }

  const flexStatements = toArray(rawStmtNodes);

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
  let hasLotBreakout = false;
  let hasDateParseError = false;

  // Prescan for canonical security mapping (prefer CON_*, merge SYM_* into CON_*)
  const conidToCanonical = new Map<string, string>();
  const isinToCanonical = new Map<string, string>();
  const symbolToCanonical = new Map<string, string>();
  const canonicalToPrimarySymbol = new Map<string, string>();

  function registerSecurityMapping(conid?: string, isin?: string, symbol?: string) {
    const cleanConid = (conid || '').trim();
    const cleanIsin = (isin || '').trim();
    const cleanSym = (symbol || '').trim();
    const cleanBaseSym = cleanSym.replace(/\.(TO|V|UN|U|NE)$/i, '');

    if (isNonEquityOrCash(cleanSym)) return;

    let targetId = '';
    if (cleanConid) {
      targetId = `CON_${cleanConid}`;
    } else if (cleanIsin && isinToCanonical.has(cleanIsin)) {
      targetId = isinToCanonical.get(cleanIsin)!;
    } else if (cleanSym && symbolToCanonical.has(cleanSym)) {
      targetId = symbolToCanonical.get(cleanSym)!;
    } else if (cleanBaseSym && symbolToCanonical.has(cleanBaseSym)) {
      targetId = symbolToCanonical.get(cleanBaseSym)!;
    } else if (cleanIsin) {
      targetId = `ISIN_${cleanIsin}`;
    } else if (cleanSym) {
      targetId = `SYM_${cleanSym}`;
    }

    if (!targetId) return;

    if (cleanConid && !targetId.startsWith('CON_')) {
      targetId = `CON_${cleanConid}`;
    }

    if (cleanConid) conidToCanonical.set(cleanConid, targetId);
    if (cleanIsin) isinToCanonical.set(cleanIsin, targetId);
    if (cleanSym) symbolToCanonical.set(cleanSym, targetId);
    if (cleanBaseSym) symbolToCanonical.set(cleanBaseSym, targetId);
    if (cleanSym && (!canonicalToPrimarySymbol.has(targetId) || cleanSym.length < (canonicalToPrimarySymbol.get(targetId)?.length || 99))) {
      canonicalToPrimarySymbol.set(targetId, cleanSym);
    }
  }

  function resolveCanonicalId(conid?: string, isin?: string, symbol?: string): string {
    const cConid = (conid || '').trim();
    const cIsin = (isin || '').trim();
    const cSym = (symbol || '').trim();
    const cBaseSym = cSym.replace(/\.(TO|V|UN|U|NE)$/i, '');

    if (cConid && conidToCanonical.has(cConid)) return conidToCanonical.get(cConid)!;
    if (cConid) return `CON_${cConid}`;
    if (cIsin && isinToCanonical.has(cIsin)) return isinToCanonical.get(cIsin)!;
    if (cSym && symbolToCanonical.has(cSym)) return symbolToCanonical.get(cSym)!;
    if (cBaseSym && symbolToCanonical.has(cBaseSym)) return symbolToCanonical.get(cBaseSym)!;
    if (cIsin) return `ISIN_${cIsin}`;
    if (cSym) return `SYM_${cSym}`;
    return 'SYM_UNKNOWN';
  }

  // First pass: register mappings from all sections across all statements
  for (const stmt of flexStatements) {
    if (!stmt || typeof stmt !== 'object') continue;

    const secNodes = toArray(stmt.SecuritiesInfo?.SecurityInfo || stmt.FinancialInstrumentInformation?.FinancialInstrumentInfo || stmt.SecurityInfo || stmt.FinancialInstrumentInfo || (stmt.SecuritiesInfo && typeof stmt.SecuritiesInfo === 'object' ? stmt.SecuritiesInfo : []));
    for (const s of secNodes) {
      registerSecurityMapping(getAttr(s, 'conid', 'conId'), getAttr(s, 'isin', 'ISIN'), getAttr(s, 'symbol', 'ticker'));
    }

    const tradeNodes = toArray(stmt.Trades?.Trade || stmt.Trades?.Execution || stmt.Trade || stmt.Execution || (stmt.Trades && typeof stmt.Trades === 'object' ? stmt.Trades : []));
    for (const t of tradeNodes) {
      registerSecurityMapping(getAttr(t, 'conid', 'conId'), getAttr(t, 'isin', 'ISIN'), getAttr(t, 'symbol', 'ticker'));
    }

    const posNodes = toArray(stmt.OpenPositions?.OpenPosition || stmt.OpenPosition || (stmt.OpenPositions && typeof stmt.OpenPositions === 'object' ? stmt.OpenPositions : []));
    for (const p of posNodes) {
      registerSecurityMapping(getAttr(p, 'conid', 'conId'), getAttr(p, 'isin', 'ISIN'), getAttr(p, 'symbol', 'ticker'));
    }

    const caNodes = toArray(stmt.CorporateActions?.CorporateAction || stmt.CorporateAction || (stmt.CorporateActions && typeof stmt.CorporateActions === 'object' ? stmt.CorporateActions : []));
    for (const ca of caNodes) {
      registerSecurityMapping(getAttr(ca, 'conid', 'conId'), getAttr(ca, 'isin', 'ISIN'), getAttr(ca, 'symbol', 'ticker'));
    }

    const optNodes = toArray(stmt.OptionEAE?.OptionEAE || stmt.OptionExercises?.OptionExercise || stmt.OptionExercisesAndAssignments?.OptionExerciseAndAssignment || stmt.OptionExercisesAssignmentsAndExpirations?.OptionExercisesAssignmentsAndExpiration || stmt.OptionExercise || (stmt.OptionEAE && typeof stmt.OptionEAE === 'object' ? stmt.OptionEAE : []));
    for (const o of optNodes) {
      registerSecurityMapping(getAttr(o, 'conid', 'conId'), getAttr(o, 'isin', 'ISIN'), getAttr(o, 'symbol', 'ticker'));
    }

    const xferNodes = toArray(stmt.Transfers?.Transfer || stmt.Transfer || (stmt.Transfers && typeof stmt.Transfers === 'object' ? stmt.Transfers : []));
    for (const x of xferNodes) {
      registerSecurityMapping(getAttr(x, 'conid', 'conId'), getAttr(x, 'isin', 'ISIN'), getAttr(x, 'symbol', 'ticker'));
    }
  }

  for (const stmt of flexStatements) {
    if (!stmt || typeof stmt !== 'object') continue;

    // Section flags: present if the section node exists, even when it has 0 children
    if (
      stmt.AccountInformation !== undefined ||
      stmt.AccountInfo !== undefined ||
      stmt['@_AccountInformation'] !== undefined ||
      stmt['@_AccountInfo'] !== undefined
    ) {
      hasAccountInformationSection = true;
    }

    if (
      stmt.SecuritiesInfo !== undefined ||
      stmt.FinancialInstrumentInformation !== undefined ||
      stmt.SecurityInfo !== undefined ||
      stmt.FinancialInstrumentInfo !== undefined ||
      stmt['@_SecuritiesInfo'] !== undefined ||
      stmt['@_FinancialInstrumentInformation'] !== undefined
    ) {
      hasFinancialInstrumentInformationSection = true;
    }

    if (
      stmt.Trades !== undefined ||
      stmt.Trade !== undefined ||
      stmt.Execution !== undefined ||
      stmt['@_Trades'] !== undefined ||
      stmt['@_Trade'] !== undefined
    ) {
      hasTradesSection = true;
    }

    if (
      stmt.CorporateActions !== undefined ||
      stmt.CorporateAction !== undefined ||
      stmt['@_CorporateActions'] !== undefined ||
      stmt['@_CorporateAction'] !== undefined
    ) {
      hasCorporateActionsSection = true;
    }

    if (
      stmt.CashTransactions !== undefined ||
      stmt.CashTransaction !== undefined ||
      stmt['@_CashTransactions'] !== undefined ||
      stmt['@_CashTransaction'] !== undefined
    ) {
      hasCashTransactionsSection = true;
    }

    if (
      stmt.OpenPositions !== undefined ||
      stmt.OpenPosition !== undefined ||
      stmt['@_OpenPositions'] !== undefined ||
      stmt['@_OpenPosition'] !== undefined
    ) {
      hasOpenPositionsSection = true;
    }

    // Map OptionEAE -> hasOptionExercisesSection
    if (
      stmt.OptionEAE !== undefined ||
      stmt.OptionExercises !== undefined ||
      stmt.OptionExercise !== undefined ||
      stmt.OptionExercisesAndAssignments !== undefined ||
      stmt.OptionExercisesAssignmentsAndExpirations !== undefined ||
      stmt['@_OptionEAE'] !== undefined ||
      stmt['@_OptionExercises'] !== undefined
    ) {
      hasOptionExercisesSection = true;
    }

    if (
      stmt.Transfers !== undefined ||
      stmt.Transfer !== undefined ||
      stmt['@_Transfers'] !== undefined ||
      stmt['@_Transfer'] !== undefined
    ) {
      hasTransfersSection = true;
    }

    if (
      stmt.ConversionDetails !== undefined ||
      stmt.ConversionRates !== undefined ||
      stmt.ConversionRate !== undefined ||
      stmt.FxTransactions !== undefined ||
      stmt.CurrencyConversions !== undefined ||
      stmt['@_ConversionDetails'] !== undefined ||
      stmt['@_ConversionRates'] !== undefined
    ) {
      hasConversionDetailsSection = true;
    }

    // Check for lot breakout tags
    if (
      stmt.Trades?.Order !== undefined ||
      stmt.Trades?.Lot !== undefined ||
      stmt.Trades?.ClosedLot !== undefined ||
      stmt.ClosedLots !== undefined ||
      stmt.Orders !== undefined ||
      stmt['@_ClosedLots'] !== undefined
    ) {
      hasLotBreakout = true;
    }

    // 1. Account Information
    const stmtAcctId = getAttr(stmt, 'accountId', 'account');
    if (stmtAcctId && stmtAcctId !== 'U_DEFAULT' && !accountsMap.has(stmtAcctId)) {
      accountsMap.set(stmtAcctId, {
        id: stmtAcctId,
        accountId: stmtAcctId,
        name: `IBKR ${stmtAcctId} (TAXABLE)`,
        broker: 'IBKR',
        accountType: 'taxable',
        baseCurrency: 'CAD',
        isHouseholdAffiliate: false,
      });
    }

    const acctInfoList: any[] = [];
    if (stmt.AccountInformation?.AccountInfo !== undefined) {
      acctInfoList.push(...toArray(stmt.AccountInformation.AccountInfo));
    } else if (stmt.AccountInfo !== undefined) {
      acctInfoList.push(...toArray(stmt.AccountInfo));
    } else if (stmt.AccountInformation && typeof stmt.AccountInformation === 'object') {
      if (getAttr(stmt.AccountInformation, 'accountId', 'account')) {
        acctInfoList.push(stmt.AccountInformation);
      }
    }

    for (const info of acctInfoList) {
      const acctId = getAttr(info, 'accountId', 'account') || stmtAcctId || 'U_DEFAULT';
      const alias = getAttr(info, 'acctAlias', 'accountAlias', 'accountTitle') || acctId;
      const currency = getAttr(info, 'currency', 'baseCurrency') || 'CAD';
      const typeStr = getAttr(info, 'type', 'accountType').toUpperCase();

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
    const secList: any[] = [];
    if (stmt.SecuritiesInfo?.SecurityInfo !== undefined) {
      secList.push(...toArray(stmt.SecuritiesInfo.SecurityInfo));
    } else if (stmt.FinancialInstrumentInformation?.FinancialInstrumentInfo !== undefined) {
      secList.push(...toArray(stmt.FinancialInstrumentInformation.FinancialInstrumentInfo));
    } else if (stmt.SecurityInfo !== undefined) {
      secList.push(...toArray(stmt.SecurityInfo));
    } else if (stmt.FinancialInstrumentInfo !== undefined) {
      secList.push(...toArray(stmt.FinancialInstrumentInfo));
    } else if (stmt.SecuritiesInfo && typeof stmt.SecuritiesInfo === 'object') {
      if (getAttr(stmt.SecuritiesInfo, 'conid', 'symbol')) {
        secList.push(stmt.SecuritiesInfo);
      }
    }

    for (const s of secList) {
      const conid = getAttr(s, 'conid', 'conId');
      const symbol = getAttr(s, 'symbol', 'ticker');
      const assetClass = (getAttr(s, 'assetCategory', 'assetClass') || 'STK').toUpperCase();
      if (isNonEquityOrCash(symbol, assetClass)) continue;

      const isin = getAttr(s, 'isin', 'ISIN');
      const cusip = getAttr(s, 'cusip', 'CUSIP');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;

      let optionDetails;
      if (assetClass === 'OPT') {
        const rightStr = (getAttr(s, 'putCall', 'right', 'putOrCall', 'type', 'description') || '').toUpperCase();
        const isPut = rightStr.includes('PUT') || rightStr === 'P' || rightStr.endsWith(' P');
        optionDetails = {
          underlyingSymbol: getAttr(s, 'underlyingSymbol') || symbol.split(' ')[0] || symbol,
          putOrCall: (isPut ? 'PUT' : 'CALL') as 'PUT' | 'CALL',
          strike: getNum(s, 'strike', 'strikePrice').toString(),
          expiryDate: getAttr(s, 'expiry', 'maturity', 'expirationDate'),
          multiplier: parseInt(getAttr(s, 'multiplier') || '100', 10),
          deliverable: getAttr(s, 'deliverable') || undefined,
        };
      }

      securitiesMap.set(secId, {
        id: secId,
        symbol: canonicalSymbol,
        name: getAttr(s, 'description', 'desc', 'name') || canonicalSymbol,
        assetClass: assetClass === 'OPT' ? 'OPT' : (assetClass === 'CASH' ? 'CASH' : 'STK'),
        isin,
        cusip,
        conid,
        listingExchange: getAttr(s, 'listingExchange', 'exchange'),
        currency: getAttr(s, 'currency') || 'USD',
        countryOfOrigin: (getAttr(s, 'countryOfOrigin', 'country') || (symbol.endsWith('.TO') || symbol.endsWith('.V') ? 'CA' : 'US')) as any,
        optionDetails,
      });
    }

    // 3. Trades (Executions)
    const tradesList: any[] = [];
    if (stmt.Trades?.Trade !== undefined) {
      tradesList.push(...toArray(stmt.Trades.Trade));
    } else if (stmt.Trades?.Execution !== undefined) {
      tradesList.push(...toArray(stmt.Trades.Execution));
    } else if (stmt.Trade !== undefined) {
      tradesList.push(...toArray(stmt.Trade));
    } else if (stmt.Execution !== undefined) {
      tradesList.push(...toArray(stmt.Execution));
    } else if (stmt.Trades && typeof stmt.Trades === 'object' && getAttr(stmt.Trades, 'symbol', 'conid')) {
      tradesList.push(stmt.Trades);
    }

    for (const t of tradesList) {
      const symbol = getAttr(t, 'symbol', 'ticker');
      const assetCat = (getAttr(t, 'assetCategory', 'assetClass') || 'STK').toUpperCase();
      if (isNonEquityOrCash(symbol, assetCat)) {
        continue;
      }

      const conid = getAttr(t, 'conid', 'conId');
      const isin = getAttr(t, 'isin', 'ISIN');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;
      const rawDate = getAttr(t, 'tradeDate', 'date', 'dateTime');
      const { date, parseError } = parseIbkrDate(rawDate);
      if (parseError) hasDateParseError = true;

      const qty = Math.abs(getNum(t, 'quantity', 'shares', 'units', 'position'));
      const price = getNum(t, 'tradePrice', 'price', 'costBasisPrice');
      const currency = getAttr(t, 'currency', 'cur') || 'USD';
      const comm = Math.abs(getNum(t, 'ibCommission', 'commission', 'taxes'));
      const buySell = (getAttr(t, 'buySell', 'side') || (getNum(t, 'quantity') > 0 ? 'BUY' : 'SELL')).toUpperCase();
      const code = getAttr(t, 'code', 'notes', 'openCloseIndicator');
      const isCancelled = code.includes('Ca') || getAttr(t, 'transactionType', 'type') === 'CANCEL';

      const tradeId =
        getAttr(t, 'tradeID', 'ibExecID', 'transactionID', 'execID') ||
        `${date}_${symbol}_${qty}_${price}`;

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

      if (isAssignmentCode(code)) {
        txType = buySell.includes('BUY') ? 'ASSIGNED_SHORT_PUT' : 'ASSIGNED_SHORT_CALL';
      } else if (code.includes('Ex') || code.includes('Exerc')) {
        txType = buySell.includes('BUY') ? 'EXERCISE_LONG_CALL' : 'EXERCISE_LONG_PUT';
      }

      const grossAmount = qty * price;
      const rawFx = getAttr(t, 'fxRateToBase', 'fxRate');
      const explicitFx = rawFx ? parseFloat(rawFx) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);
      const { amountCad: commCad } = convertToCad(comm, currency, date, explicitFx);

      if (!securitiesMap.has(secId)) {
        securitiesMap.set(secId, {
          id: secId,
          symbol: canonicalSymbol,
          name: getAttr(t, 'description', 'desc') || canonicalSymbol,
          assetClass: assetCat === 'OPT' ? 'OPT' : 'STK',
          conid,
          currency,
        });
      }

      const settleRaw = getAttr(t, 'settleDateTarget', 'settleDate', 'settlementDate');
      const { date: settlementDate } = parseIbkrDate(settleRaw);

      transactions.push({
        id: `IBKR_TR_${tradeId}`,
        accountId: getAttr(t, 'accountId', 'account') || 'U_DEFAULT',
        securityId: secId,
        symbol: canonicalSymbol,
        date,
        settlementDate: settlementDate || undefined,
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
    const caList: any[] = [];
    if (stmt.CorporateActions?.CorporateAction !== undefined) {
      caList.push(...toArray(stmt.CorporateActions.CorporateAction));
    } else if (stmt.CorporateAction !== undefined) {
      caList.push(...toArray(stmt.CorporateAction));
    } else if (stmt.CorporateActions && typeof stmt.CorporateActions === 'object' && getAttr(stmt.CorporateActions, 'symbol', 'conid', 'actionID')) {
      caList.push(stmt.CorporateActions);
    }

    for (const ca of caList) {
      const symbol = getAttr(ca, 'symbol', 'ticker');
      if (isNonEquityOrCash(symbol)) continue;

      const conid = getAttr(ca, 'conid', 'conId');
      const isin = getAttr(ca, 'isin', 'ISIN');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;
      const rawDate = getAttr(ca, 'reportDate', 'date', 'dateTime');
      const { date } = parseIbkrDate(rawDate);
      const desc = getAttr(ca, 'description', 'type') || 'Corporate Action';
      const cash = getNum(ca, 'cashProceeds', 'amount', 'cash');
      const qty = getNum(ca, 'quantity', 'shares');
      const currency = getAttr(ca, 'currency') || 'USD';
      const caType = getAttr(ca, 'type', 'actionType');

      const caId =
        getAttr(ca, 'actionID', 'transactionID', 'corporateActionID') ||
        `${date}_${symbol}_${caType}`;

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
        accountId: getAttr(ca, 'accountId', 'account') || 'U_DEFAULT',
        securityId: secId,
        symbol: canonicalSymbol,
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
    const cashList: any[] = [];
    if (stmt.CashTransactions?.CashTransaction !== undefined) {
      cashList.push(...toArray(stmt.CashTransactions.CashTransaction));
    } else if (stmt.CashTransaction !== undefined) {
      cashList.push(...toArray(stmt.CashTransaction));
    } else if (stmt.CashTransactions && typeof stmt.CashTransactions === 'object' && getAttr(stmt.CashTransactions, 'amount', 'type', 'transactionID')) {
      cashList.push(stmt.CashTransactions);
    }

    for (const c of cashList) {
      const rawDate = getAttr(c, 'reportDate', 'date', 'dateTime');
      const { date } = parseIbkrDate(rawDate);
      const type = getAttr(c, 'type', 'transactionType').toUpperCase();
      const desc = getAttr(c, 'description', 'desc');
      const amount = Math.abs(getNum(c, 'amount', 'grossAmount'));
      const currency = getAttr(c, 'currency') || 'USD';
      const symbol = getAttr(c, 'symbol', 'ticker') || 'CASH';
      const conid = getAttr(c, 'conid', 'conId');
      const isin = getAttr(c, 'isin', 'ISIN');
      const isCashSym = isNonEquityOrCash(symbol);
      const secId = isCashSym ? 'SYM_CASH' : resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = isCashSym ? 'CASH' : (canonicalToPrimarySymbol.get(secId) || symbol);

      const cId =
        getAttr(c, 'transactionID', 'cId') ||
        `${date}_${type}_${amount}`;

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
        txType = getNum(c, 'amount') >= 0 ? 'INTEREST_RECEIVED' : 'INTEREST_PAID';
      }

      transactions.push({
        id: `IBKR_CASH_${cId}`,
        accountId: getAttr(c, 'accountId', 'account') || 'U_DEFAULT',
        securityId: secId,
        symbol: canonicalSymbol,
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
    const posList: any[] = [];
    if (stmt.OpenPositions?.OpenPosition !== undefined) {
      posList.push(...toArray(stmt.OpenPositions.OpenPosition));
    } else if (stmt.OpenPosition !== undefined) {
      posList.push(...toArray(stmt.OpenPosition));
    } else if (stmt.OpenPositions && typeof stmt.OpenPositions === 'object' && getAttr(stmt.OpenPositions, 'symbol', 'conid', 'position', 'quantity')) {
      posList.push(stmt.OpenPositions);
    }

    for (const p of posList) {
      const symbol = getAttr(p, 'symbol', 'ticker');
      const assetCat = (getAttr(p, 'assetCategory', 'assetClass') || 'STK').toUpperCase();
      if (isNonEquityOrCash(symbol, assetCat)) continue;

      const conid = getAttr(p, 'conid', 'conId');
      const isin = getAttr(p, 'isin', 'ISIN');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;
      const qty = getNum(p, 'position', 'quantity', 'units');
      const costPrice = getNum(p, 'costBasisPrice', 'openPrice', 'costPrice');
      const markPrice = getNum(p, 'markPrice', 'price', 'closePrice');
      const currency = getAttr(p, 'currency') || 'USD';
      const posVal = getNum(p, 'positionValue', 'marketValue', 'value');

      const rawStmtDate = getAttr(stmt, 'toDate', 'reportDate') || '2026-08-22';
      const { date: asOfDate } = parseIbkrDate(rawStmtDate);
      const { amountCad: posValCad } = convertToCad(posVal, currency, asOfDate || '2026-08-22');

      openPositions.push({
        accountId: getAttr(p, 'accountId', 'account') || 'U_DEFAULT',
        securityId: secId,
        symbol: canonicalSymbol,
        conid,
        isin: getAttr(p, 'isin', 'ISIN'),
        quantity: String(qty),
        costPrice: String(costPrice),
        currency,
        markPrice: String(markPrice),
        positionValueCad: String(posValCad),
        asOfDate: asOfDate || '2026-08-22',
      });
    }

    // 7. Option Exercises and Assignments
    const optList: any[] = [];
    if (stmt.OptionEAE?.OptionEAE !== undefined) {
      optList.push(...toArray(stmt.OptionEAE.OptionEAE));
    } else if (stmt.OptionExercises?.OptionExercise !== undefined) {
      optList.push(...toArray(stmt.OptionExercises.OptionExercise));
    } else if (stmt.OptionExercisesAndAssignments?.OptionExerciseAndAssignment !== undefined) {
      optList.push(...toArray(stmt.OptionExercisesAndAssignments.OptionExerciseAndAssignment));
    } else if (stmt.OptionExercisesAssignmentsAndExpirations?.OptionExercisesAssignmentsAndExpiration !== undefined) {
      optList.push(...toArray(stmt.OptionExercisesAssignmentsAndExpirations.OptionExercisesAssignmentsAndExpiration));
    } else if (stmt.OptionEAE !== undefined && typeof stmt.OptionEAE === 'object' && getAttr(stmt.OptionEAE, 'symbol', 'conid', 'quantity')) {
      optList.push(stmt.OptionEAE);
    } else if (stmt.OptionExercise !== undefined) {
      optList.push(...toArray(stmt.OptionExercise));
    }

    for (const opt of optList) {
      const symbol = getAttr(opt, 'symbol', 'ticker');
      if (isNonEquityOrCash(symbol)) continue;

      const conid = getAttr(opt, 'conid', 'conId');
      const isin = getAttr(opt, 'isin', 'ISIN');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;
      const rawDate = getAttr(opt, 'tradeDate', 'reportDate', 'date', 'dateTime');
      const { date } = parseIbkrDate(rawDate);
      const qty = Math.abs(getNum(opt, 'quantity', 'units', 'position'));
      const strike = getNum(opt, 'tradePrice', 'strikePrice', 'strike', 'price');
      const currency = getAttr(opt, 'currency') || 'USD';
      const comm = Math.abs(getNum(opt, 'ibCommission', 'commission'));
      const grossAmount = qty * strike;
      const rawFx = getAttr(opt, 'fxRateToBase', 'fxRate');
      const explicitFx = rawFx ? parseFloat(rawFx) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);
      const { amountCad: commCad } = convertToCad(comm, currency, date, explicitFx);

      const optId =
        getAttr(opt, 'transactionID', 'tradeID', 'actionID') ||
        `${date}_${symbol}_${qty}`;

      const rawType = (getAttr(opt, 'type', 'transactionType', 'action', 'putCall', 'right', 'assetCategory', 'description') || '').toUpperCase();
      const isPut = rawType.includes('PUT') || rawType === 'P' || rawType.endsWith(' P');
      const code = getAttr(opt, 'code', 'notes');
      let txType: Transaction['transactionType'] = 'EXERCISE_LONG_CALL';
      if (rawType.includes('ASSIGN') || isAssignmentCode(code)) {
        txType = isPut ? 'ASSIGNED_SHORT_PUT' : 'ASSIGNED_SHORT_CALL';
      } else {
        txType = isPut ? 'EXERCISE_LONG_PUT' : 'EXERCISE_LONG_CALL';
      }

      // Check if already present from Trades section
      const existingTradeIndex = transactions.findIndex((t) => {
        if (optId) {
          if (t.ibkrTransactionId && t.ibkrTransactionId === optId) return true;
          if (t.ibkrExecutionId && t.ibkrExecutionId === optId) return true;
          if (t.id === `IBKR_TR_${optId}` || t.id === `IBKR_OPT_${optId}`) return true;
        }
        if (secId && t.date === date && t.securityId === secId) {
          const tQty = Math.abs(parseFloat(t.quantity || '0'));
          if (tQty === qty || tQty === qty * 100) return true;
        }
        return false;
      });

      if (existingTradeIndex >= 0) {
        const existing = transactions[existingTradeIndex];
        existing.ibkrCode = existing.ibkrCode || code || rawType;
        if (!existing.transactionType.includes('ASSIGNED') && !existing.transactionType.includes('EXERCISE')) {
          existing.transactionType = txType;
        }
        continue;
      }

      transactions.push({
        id: `IBKR_OPT_${optId}`,
        accountId: getAttr(opt, 'accountId', 'account') || 'U_DEFAULT',
        securityId: secId,
        symbol: canonicalSymbol,
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
    const xferList: any[] = [];
    if (stmt.Transfers?.Transfer !== undefined) {
      xferList.push(...toArray(stmt.Transfers.Transfer));
    } else if (stmt.Transfer !== undefined) {
      xferList.push(...toArray(stmt.Transfer));
    } else if (stmt.Transfers && typeof stmt.Transfers === 'object' && getAttr(stmt.Transfers, 'symbol', 'conid', 'transferID')) {
      xferList.push(stmt.Transfers);
    }

    for (const xfer of xferList) {
      const symbol = getAttr(xfer, 'symbol', 'ticker');
      if (isNonEquityOrCash(symbol)) continue;

      const conid = getAttr(xfer, 'conid', 'conId');
      const isin = getAttr(xfer, 'isin', 'ISIN');
      const secId = resolveCanonicalId(conid, isin, symbol);
      const canonicalSymbol = canonicalToPrimarySymbol.get(secId) || symbol;
      const rawDate = getAttr(xfer, 'date', 'reportDate', 'dateTime');
      const { date } = parseIbkrDate(rawDate);
      const qty = Math.abs(getNum(xfer, 'quantity', 'units'));
      const grossAmount = Math.abs(getNum(xfer, 'costBasis', 'positionAmount', 'amount'));
      const price = qty > 0 && grossAmount > 0 ? grossAmount / qty : 0;
      const currency = getAttr(xfer, 'currency') || 'USD';
      const rawFx = getAttr(xfer, 'fxRateToBase', 'fxRate');
      const explicitFx = rawFx ? parseFloat(rawFx) : undefined;
      const { amountCad, fxRate, fxSource } = convertToCad(grossAmount, currency, date, explicitFx);

      const xferId =
        getAttr(xfer, 'transactionID', 'transferID') ||
        `${date}_${symbol}_${qty}`;

      const dir = (getAttr(xfer, 'direction', 'type', 'transferType') || '').toUpperCase();
      const isOut = dir.includes('OUT') || getNum(xfer, 'quantity') < 0;
      const txType: Transaction['transactionType'] = isOut ? 'TRANSFER_OUT' : 'TRANSFER_IN';

      const targetAcctId = getAttr(xfer, 'targetAccount', 'targetAccountId', 'toAccount', 'fromAccount');
      const targetAlias = (getAttr(xfer, 'targetAccountAlias', 'targetAccountType', 'accountAlias', 'description', 'type') || '').toUpperCase();

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
        accountId: getAttr(xfer, 'accountId', 'account') || 'U_DEFAULT',
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
        status: otherAcctType ? 'auto_approved' : 'needs_review',
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
  } else if (accountsMap.size > 1 && accountsMap.has('U_DEFAULT')) {
    accountsMap.delete('U_DEFAULT');
  }

  const rawReferenceCode =
    getAttr(parsed.FlexQueryResponse, 'queryId', 'queryID', 'referenceCode') ||
    getAttr(parsed.FlexStatements, 'queryId', 'queryID') ||
    getAttr(parsed, 'queryId');

  const queryId =
    getAttr(parsed.FlexQueryResponse, 'queryName', 'name') ||
    getAttr(parsed.FlexStatements, 'queryName') ||
    '';

  const statementDate =
    getAttr(parsed.FlexQueryResponse, 'whenGenerated', 'queryResponseDate') ||
    getAttr(parsed.FlexStatements, 'whenGenerated') ||
    '';

  return {
    accounts: Array.from(accountsMap.values()),
    securities: Array.from(securitiesMap.values()),
    transactions,
    openPositions,
    rawReferenceCode,
    queryId,
    statementDate,
    hasCorporateActionsSection,
    hasTradesSection,
    hasCashTransactionsSection,
    hasOpenPositionsSection,
    hasAccountInformationSection,
    hasFinancialInstrumentInformationSection,
    hasConversionDetailsSection,
    hasOptionExercisesSection,
    hasTransfersSection,
    hasLotBreakout,
    hasDateParseError,
    errors,
  };
}

