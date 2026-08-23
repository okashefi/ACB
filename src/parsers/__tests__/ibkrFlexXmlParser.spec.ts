import { describe, it, expect } from 'vitest';
import { parseIbkrFlexXml } from '../ibkrFlexXmlParser';

describe('IBKR Flex XML Parser tests', () => {
  it('should parse simple synthetic XML with account, security, and trades correctly', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <AccountInformation>
        <AccountInfo accountId="U1234567" acctAlias="My Margin Account" currency="CAD" type="Margin"/>
      </AccountInformation>
      <SecuritiesInfo>
        <SecurityInfo conid="12345" symbol="RY" description="Royal Bank of Canada" assetCategory="STK" currency="CAD"/>
      </SecuritiesInfo>
      <Trades>
        <Trade conid="12345" symbol="RY" tradeDate="20240315" quantity="100" tradePrice="130.50" ibCommission="4.95" buySell="BUY" currency="CAD" tradeID="TR_9911"/>
      </Trades>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;

    const result = parseIbkrFlexXml(xmlContent);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].accountId).toBe('U1234567');
    expect(result.accounts[0].name).toContain('My Margin Account');

    expect(result.securities).toHaveLength(1);
    expect(result.securities[0].conid).toBe('12345');
    expect(result.securities[0].symbol).toBe('RY');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].ibkrTransactionId).toBe('TR_9911');
    expect(result.transactions[0].quantity).toBe('100');
    expect(result.transactions[0].price).toBe('130.5');
    expect(result.transactions[0].commission).toBe('4.95');
    expect(result.transactions[0].fxRate).toBe('1');
  });

  it('should gracefully handle empty sections', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <AccountInformation></AccountInformation>
      <Trades></Trades>
      <OptionEAE></OptionEAE>
      <Transfers></Transfers>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(0);
    expect(result.accounts).toBeDefined();
  });

  it('should parse trade cancellation correctly and mark status as rejected', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <Trades>
        <Trade conid="12345" symbol="RY" tradeDate="20240315" quantity="100" tradePrice="130.50" ibCommission="4.95" buySell="BUY" currency="CAD" tradeID="TR_CANCEL_1" code="Ca"/>
      </Trades>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].isCancelled).toBe(true);
    expect(result.transactions[0].status).toBe('rejected');
  });

  it('should exclude non-equity/cash/fx trades based on isNonEquityOrCash', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <Trades>
        <Trade conid="FX1" symbol="USD.CAD" tradeDate="20240315" quantity="10000" tradePrice="1.35" ibCommission="2.00" buySell="BUY" currency="USD" tradeID="FX_TRADE" assetCategory="CASH"/>
      </Trades>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(0); // Excluded CASH
  });

  it('should parse OptionEAE assignments and exercises correctly', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <OptionEAE>
        <OptionEAE transactionID="OPT_1" conid="O99" symbol="RY C130" date="20240315" quantity="1" tradePrice="130" type="Exercise Call" putCall="C" currency="CAD"/>
        <OptionEAE transactionID="OPT_2" conid="O98" symbol="RY P120" date="20240315" quantity="1" tradePrice="120" type="Assignment Put" putCall="P" currency="CAD"/>
      </OptionEAE>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].transactionType).toBe('EXERCISE_LONG_CALL');
    expect(result.transactions[1].transactionType).toBe('ASSIGNED_SHORT_PUT');
  });

  it('should parse inbound/outbound transfers correctly', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <Transfers>
        <Transfer transactionID="XFER_1" conid="12345" symbol="RY" date="20240315" quantity="50" price="130" currency="CAD" direction="IN" targetAccountAlias="TFSA"/>
        <Transfer transactionID="XFER_2" conid="12345" symbol="RY" date="20240315" quantity="20" price="130" currency="CAD" direction="OUT" targetAccountAlias="MARGIN"/>
      </Transfers>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].transactionType).toBe('TRANSFER_IN');
    expect(result.transactions[0].destinationAccountType).toBeUndefined();
    expect(result.transactions[0].sourceAccountType).toBe('tfsa');

    expect(result.transactions[1].transactionType).toBe('TRANSFER_OUT');
    expect(result.transactions[1].destinationAccountType).toBe('taxable');
  });

  it('should resolve canonical ID using aliases (CONID/ISIN/SYM mapping)', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <SecuritiesInfo>
        <SecurityInfo conid="12345" isin="CA12345RY" symbol="RY" description="Royal Bank" assetCategory="STK" currency="CAD"/>
      </SecuritiesInfo>
      <Trades>
        <!-- referenced by ISIN and different symbol representation but same conid -->
        <Trade conid="12345" symbol="RY.TO" ISIN="CA12345RY" tradeDate="20240315" quantity="100" tradePrice="130.50" ibCommission="4.95" buySell="BUY" currency="CAD" tradeID="TR_1"/>
      </Trades>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    expect(result.transactions).toHaveLength(1);
    // Security info map registered conid '12345' and ISIN 'CA12345RY' together.
    expect(result.transactions[0].securityId).toBe('CON_12345');
  });

  it('should deduplicate option/share double posts between Trades and OptionEAE', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567">
      <Trades>
        <!-- The Trade leg representing the transaction -->
        <Trade conid="O99" symbol="RY C130" tradeDate="20240315" quantity="1" tradePrice="130" ibCommission="0" buySell="BUY" currency="CAD" tradeID="DEDUPE_1" code="Ex"/>
      </Trades>
      <OptionEAE>
        <!-- The OptionEAE leg with matching ID -->
        <OptionEAE transactionID="DEDUPE_1" conid="O99" symbol="RY C130" date="20240315" quantity="1" tradePrice="130" type="Exercise Call" putCall="C" currency="CAD"/>
      </OptionEAE>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;
    const result = parseIbkrFlexXml(xmlContent);
    // Should be deduplicated into a single transaction, not two
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].transactionType).toBe('EXERCISE_LONG_CALL');
  });

  it('should parse additional transfer account aliases and support default account fallback', () => {
    const xmlContent = `
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement>
      <!-- No AccountInfo section, triggering fallback account -->
      <Transfers>
        <Transfer transactionID="X1" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="RRSP"/>
        <Transfer transactionID="X2" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="RESP"/>
        <Transfer transactionID="X3" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="FHSA"/>
        <Transfer transactionID="X4" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="RRIF"/>
        <Transfer transactionID="X5" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="LIRA"/>
        <Transfer transactionID="X6" conid="1" symbol="RY" date="20240315" quantity="10" price="10" currency="CAD" direction="IN" targetAccountAlias="UNKNOWN_TYPE"/>
      </Transfers>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>
`;

    const result = parseIbkrFlexXml(xmlContent);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].id).toBe('U_DEFAULT'); // default account fallback created

    expect(result.transactions).toHaveLength(6);
    expect(result.transactions[0].sourceAccountType).toBe('rrsp');
    expect(result.transactions[1].sourceAccountType).toBe('resp');
    expect(result.transactions[2].sourceAccountType).toBe('fhsa');
    expect(result.transactions[3].sourceAccountType).toBe('rrif');
    expect(result.transactions[4].sourceAccountType).toBe('other_registered');
    expect(result.transactions[5].sourceAccountType).toBeUndefined(); // unknown falls back
  });
});
