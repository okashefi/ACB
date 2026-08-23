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
});
