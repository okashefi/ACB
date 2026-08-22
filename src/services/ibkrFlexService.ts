import { parseIbkrFlexXml, ParsedFlexStatement } from '../parsers/ibkrFlexXmlParser';

export interface FlexSyncOptions {
  token: string;
  queryId: string;
  startDate?: string; // YYYYMMDD
  endDate?: string; // YYYYMMDD
  useSandbox?: boolean;
}

export interface FlexSyncResult {
  success: boolean;
  referenceCode?: string;
  statementXml?: string;
  parsedData?: ParsedFlexStatement;
  errorMessage?: string;
  errorCode?: string;
  retentionWarning?: string;
}

/**
 * Generate a realistic, rich multi-year IBKR Activity Flex Query XML payload for sandbox and testing.
 */
export function generateSandboxFlexXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse queryName="Canadian ACB - Full Activity" type="AF">
  <FlexStatements count="1">
    <FlexStatement accountId="U1084829" fromDate="20240101" toDate="20260822" period="Custom" whenGenerated="2026-08-22 07:00:00">
      
      <AccountInformation>
        <AccountInfo accountId="U1084829" acctAlias="Primary Non-Registered Margin" currency="CAD" type="MARGIN" ibEntity="IB-CA" />
        <AccountInfo accountId="U1084830" acctAlias="Tax-Free Savings Account (TFSA)" currency="CAD" type="TFSA" ibEntity="IB-CA" />
      </AccountInformation>

      <FinancialInstrumentInformation>
        <FinancialInstrumentInfo conid="12345" symbol="RY" description="ROYAL BANK OF CANADA" assetCategory="STK" currency="CAD" isin="CA7800871021" listingExchange="TSE" />
        <FinancialInstrumentInfo conid="23456" symbol="SHOP" description="SHOPIFY INC - CLASS A" assetCategory="STK" currency="CAD" isin="CA82509L1076" listingExchange="TSE" />
        <FinancialInstrumentInfo conid="34567" symbol="AAPL" description="APPLE INC" assetCategory="STK" currency="USD" isin="US0378331005" listingExchange="NASDAQ" />
        <FinancialInstrumentInfo conid="45678" symbol="NVDA" description="NVIDIA CORP" assetCategory="STK" currency="USD" isin="US67066G1040" listingExchange="NASDAQ" />
        <FinancialInstrumentInfo conid="56789" symbol="REIT.UN" description="CANADIAN APARTMENT PROPERTIES REIT" assetCategory="STK" currency="CAD" isin="CA1349211054" listingExchange="TSE" />
        <FinancialInstrumentInfo conid="67890" symbol="CASH" description="CANADIAN DOLLAR" assetCategory="CASH" currency="CAD" />
        <FinancialInstrumentInfo conid="78901" symbol="ACQ" description="ACQUIRER CORP" assetCategory="STK" currency="USD" isin="US0044556677" listingExchange="NYSE" />
        <FinancialInstrumentInfo conid="89012" symbol="TGT" description="TARGET CORP" assetCategory="STK" currency="USD" isin="US8877665544" listingExchange="NYSE" />
      </FinancialInstrumentInformation>

      <Trades>
        <!-- 1. RY Buy in 2024 -->
        <Trade accountId="U1084829" tradeID="TR001" tradeDate="2024-01-15" symbol="RY" conid="12345" assetCategory="STK" quantity="100" tradePrice="130.50" currency="CAD" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 2. RY Second Buy in 2024 -->
        <Trade accountId="U1084829" tradeID="TR002" tradeDate="2024-04-20" symbol="RY" conid="12345" assetCategory="STK" quantity="50" tradePrice="136.00" currency="CAD" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 3. AAPL Buy in USD -->
        <Trade accountId="U1084829" tradeID="TR003" tradeDate="2024-02-10" symbol="AAPL" conid="34567" assetCategory="STK" quantity="50" tradePrice="180.00" currency="USD" fxRateToBase="1.3450" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 4. NVDA Buy before Split -->
        <Trade accountId="U1084829" tradeID="TR004" tradeDate="2024-03-01" symbol="NVDA" conid="45678" assetCategory="STK" quantity="20" tradePrice="500.00" currency="USD" fxRateToBase="1.3520" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 5. SHOP Buy -->
        <Trade accountId="U1084829" tradeID="TR005" tradeDate="2024-06-01" symbol="SHOP" conid="23456" assetCategory="STK" quantity="100" tradePrice="90.00" currency="CAD" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 6. SHOP Sell at a loss (Superficial Loss Trigger) -->
        <Trade accountId="U1084829" tradeID="TR006" tradeDate="2024-07-02" symbol="SHOP" conid="23456" assetCategory="STK" quantity="100" tradePrice="75.00" currency="CAD" ibCommission="1.00" buySell="SELL" code="C" />
        <!-- 7. SHOP Repurchase on D+8 in Taxable -->
        <Trade accountId="U1084829" tradeID="TR007" tradeDate="2024-07-10" symbol="SHOP" conid="23456" assetCategory="STK" quantity="100" tradePrice="78.00" currency="CAD" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 8. REIT Buy -->
        <Trade accountId="U1084829" tradeID="TR008" tradeDate="2024-01-05" symbol="REIT.UN" conid="56789" assetCategory="STK" quantity="200" tradePrice="15.00" currency="CAD" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 9. TGT Buy for Mixed Merger -->
        <Trade accountId="U1084829" tradeID="TR009" tradeDate="2024-02-15" symbol="TGT" conid="89012" assetCategory="STK" quantity="100" tradePrice="20.00" currency="USD" fxRateToBase="1.3500" ibCommission="1.00" buySell="BUY" code="O" />
        <!-- 10. RY Partial Sale in 2025 -->
        <Trade accountId="U1084829" tradeID="TR010" tradeDate="2025-05-15" symbol="RY" conid="12345" assetCategory="STK" quantity="50" tradePrice="160.00" currency="CAD" ibCommission="1.00" buySell="SELL" code="C" />
        <!-- 11. AAPL Sale in 2025 -->
        <Trade accountId="U1084829" tradeID="TR011" tradeDate="2025-08-20" symbol="AAPL" conid="34567" assetCategory="STK" quantity="25" tradePrice="220.00" currency="USD" fxRateToBase="1.3780" ibCommission="1.00" buySell="SELL" code="C" />
      </Trades>

      <CorporateActions>
        <!-- NVDA 2-for-1 Split -->
        <CorporateAction accountId="U1084829" actionID="CA001" reportDate="2024-06-10" symbol="NVDA" conid="45678" type="FORWARD SPLIT" description="FORWARD SPLIT 2 FOR 1" quantity="20" cashProceeds="0.00" currency="USD" />
        <!-- TGT Mixed Merger -->
        <CorporateAction accountId="U1084829" actionID="CA002" reportDate="2024-09-20" symbol="TGT" conid="89012" type="MERGER" description="CASH AND STOCK MERGER: $10 CASH + 0.5 ACQ SHARES PER TGT" quantity="50" cashProceeds="1000.00" currency="USD" />
      </CorporateActions>

      <CashTransactions>
        <!-- RY Dividend -->
        <CashTransaction accountId="U1084829" transactionID="CSH001" reportDate="2024-03-28" type="DIVIDEND" symbol="RY" amount="142.00" currency="CAD" description="ROYAL BANK ELIGIBLE DIVIDEND" />
        <CashTransaction accountId="U1084829" transactionID="CSH002" reportDate="2024-06-28" type="DIVIDEND" symbol="RY" amount="213.00" currency="CAD" description="ROYAL BANK ELIGIBLE DIVIDEND" />
        <!-- AAPL Dividend & US Withholding Tax -->
        <CashTransaction accountId="U1084829" transactionID="CSH003" reportDate="2024-05-16" type="DIVIDEND" symbol="AAPL" amount="12.50" currency="USD" description="APPLE INC CASH DIVIDEND" />
        <CashTransaction accountId="U1084829" transactionID="CSH004" reportDate="2024-05-16" type="WITHHOLDING TAX" symbol="AAPL" amount="-1.88" currency="USD" description="US TAX WITHHELD 15%" />
        <!-- REIT Return of Capital Distribution -->
        <CashTransaction accountId="U1084829" transactionID="CSH005" reportDate="2024-12-15" type="RETURN OF CAPITAL" symbol="REIT.UN" amount="350.00" currency="CAD" description="CAPREIT NON-TAXABLE RETURN OF CAPITAL DISTRIBUTION" />
      </CashTransactions>

      <OpenPositions>
        <OpenPosition accountId="U1084829" symbol="RY" conid="12345" position="100" costBasisPrice="132.33" markPrice="168.50" positionValue="16850.00" currency="CAD" fifoPnlUnrealized="3617.00" />
        <OpenPosition accountId="U1084829" symbol="AAPL" conid="34567" position="25" costBasisPrice="180.00" markPrice="235.00" positionValue="5875.00" currency="USD" fifoPnlUnrealized="1375.00" />
        <OpenPosition accountId="U1084829" symbol="NVDA" conid="45678" position="40" costBasisPrice="250.00" markPrice="125.00" positionValue="5000.00" currency="USD" fifoPnlUnrealized="-5000.00" />
        <OpenPosition accountId="U1084829" symbol="SHOP" conid="23456" position="100" costBasisPrice="78.00" markPrice="105.00" positionValue="10500.00" currency="CAD" fifoPnlUnrealized="2700.00" />
        <OpenPosition accountId="U1084829" symbol="REIT.UN" conid="56789" position="200" costBasisPrice="15.00" markPrice="16.20" positionValue="3240.00" currency="CAD" fifoPnlUnrealized="240.00" />
        <OpenPosition accountId="U1084829" symbol="ACQ" conid="78901" position="50" costBasisPrice="30.00" markPrice="32.00" positionValue="1600.00" currency="USD" fifoPnlUnrealized="100.00" />
      </OpenPositions>

    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>`;
}

/**
 * Execute Flex Web Service SendRequest and GetStatement via server proxy or sandbox.
 */
export async function fetchIbkrFlexStatement(options: FlexSyncOptions): Promise<FlexSyncResult> {
  const isDemo = options.useSandbox || options.token === 'DEMO_SANDBOX_TOKEN' || options.token.startsWith('DEMO_') || !options.token;

  if (isDemo) {
    // Return realistic mock sandbox data
    const xml = generateSandboxFlexXml();
    const parsed = parseIbkrFlexXml(xml);
    return {
      success: true,
      referenceCode: 'SANDBOX_REF_987654321',
      statementXml: xml,
      parsedData: parsed,
    };
  }

  try {
    const res = await fetch('/api/ibkr/flex-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        errorMessage: data.errorMessage || 'Failed to sync with IBKR Flex Web Service',
        errorCode: data.errorCode,
        retentionWarning: data.retentionWarning,
      };
    }

    const parsed = parseIbkrFlexXml(data.statementXml);
    return {
      success: true,
      referenceCode: data.referenceCode,
      statementXml: data.statementXml,
      parsedData: parsed,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message || 'Network error connecting to backend sync service',
    };
  }
}
