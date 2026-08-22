import Papa from 'papaparse';
import { Transaction, Account, SecurityMaster, OpenPosition } from '../types/tax';
import { convertToCad } from '../engine/bocFx';
import { classifyBrokerCorporateAction } from '../engine/corporateActions';

export interface ParsedCsvResult {
  accounts: Account[];
  securities: SecurityMaster[];
  transactions: Transaction[];
  openPositions: OpenPosition[];
  rowCount: number;
  errors: string[];
}

export function parseIbkrCsv(csvContent: string): ParsedCsvResult {
  const result = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = result.data as string[][];
  const accountsMap = new Map<string, Account>();
  const securitiesMap = new Map<string, SecurityMaster>();
  const transactions: Transaction[] = [];
  const openPositions: OpenPosition[] = [];
  const errors: string[] = [];

  let currentSection = '';
  let sectionHeaders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstCol = (row[0] || '').trim();

    // Check if row is a section marker or header line in IBKR Activity Statement CSV
    if (firstCol.toUpperCase().includes('TRADES') || firstCol === 'Trades') {
      currentSection = 'TRADES';
      if (row[1] === 'Header' || row[1] === 'Data' || row.includes('Symbol') || row.includes('TradeDate')) {
        sectionHeaders = row.map((h) => h.trim());
      }
      continue;
    } else if (firstCol.toUpperCase().includes('CORPORATE ACTIONS') || firstCol === 'Corporate Actions') {
      currentSection = 'CORPORATE_ACTIONS';
      sectionHeaders = row.map((h) => h.trim());
      continue;
    } else if (firstCol.toUpperCase().includes('DIVIDENDS') || firstCol.toUpperCase().includes('CASH TRANSACTIONS')) {
      currentSection = 'CASH';
      sectionHeaders = row.map((h) => h.trim());
      continue;
    } else if (firstCol.toUpperCase().includes('OPEN POSITIONS')) {
      currentSection = 'OPEN_POSITIONS';
      sectionHeaders = row.map((h) => h.trim());
      continue;
    } else if (firstCol.toUpperCase().includes('ACCOUNT INFORMATION')) {
      currentSection = 'ACCOUNT_INFO';
      sectionHeaders = row.map((h) => h.trim());
      continue;
    }

    // Process section rows
    if (row[1] === 'Data' || (row.length > 5 && (row[2]?.includes('-') || row[2]?.includes('/')))) {
      // Trades row
      if (currentSection === 'TRADES' || (!currentSection && (row.includes('BUY') || row.includes('BOT') || row.includes('SLD')))) {
        try {
          const symIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('symbol')) || 4;
          const dateIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('date')) || 3;
          const qtyIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity')) || 5;
          const priceIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('price')) || 6;
          const commIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('comm')) || 8;
          const currIdx = sectionHeaders.findIndex((h) => h.toLowerCase().includes('currency')) || 9;

          const symbol = (row[symIdx] || row[4] || '').trim();
          const rawDate = (row[dateIdx] || row[3] || '').trim();
          const date = rawDate.replace(/\//g, '-').substring(0, 10);
          const qty = Math.abs(parseFloat(row[qtyIdx] || row[5] || '0'));
          const price = parseFloat(row[priceIdx] || row[6] || '0');
          const comm = Math.abs(parseFloat(row[commIdx] || row[8] || '0'));
          const currency = (row[currIdx] || row[9] || 'USD').trim().toUpperCase() || 'USD';
          const buySell = (row.join(' ').toUpperCase().includes('SELL') || row.join(' ').toUpperCase().includes('SLD')) ? 'SELL' : 'BUY';

          if (symbol && date && qty > 0) {
            const secId = `SYM_${symbol}`;
            const gross = qty * price;
            const { amountCad, fxRate, fxSource } = convertToCad(gross, currency, date);
            const { amountCad: commCad } = convertToCad(comm, currency, date);

            if (!securitiesMap.has(secId)) {
              securitiesMap.set(secId, {
                id: secId,
                symbol,
                name: symbol,
                assetClass: 'STK',
                currency,
              });
            }

            transactions.push({
              id: `CSV_TR_${i}_${symbol}_${date}`,
              accountId: 'U_DEFAULT',
              securityId: secId,
              symbol,
              date,
              transactionType: buySell === 'BUY' ? 'BUY' : 'SELL',
              quantity: qty,
              price,
              currency,
              commission: comm,
              totalGrossAmount: gross,
              totalNetAmount: gross + (buySell === 'BUY' ? comm : -comm),
              fxRate,
              fxRateSource: fxSource,
              amountCad,
              commissionCad: commCad,
              totalOutlaysCad: commCad,
              status: 'auto_approved',
              source: 'IBKR_CSV',
            });
          }
        } catch (e: any) {
          errors.push(`Row ${i}: Failed to parse trade (${e.message})`);
        }
      }
    }
  }

  // Ensure default account
  accountsMap.set('U_DEFAULT', {
    id: 'U_DEFAULT',
    accountId: 'U_DEFAULT',
    name: 'Primary Taxable Account',
    broker: 'IBKR',
    accountType: 'taxable',
    baseCurrency: 'CAD',
    isHouseholdAffiliate: false,
  });

  return {
    accounts: Array.from(accountsMap.values()),
    securities: Array.from(securitiesMap.values()),
    transactions,
    openPositions,
    rowCount: rows.length,
    errors,
  };
}
