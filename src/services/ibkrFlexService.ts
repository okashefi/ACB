import { parseIbkrFlexXml, ParsedFlexStatement } from '../parsers/ibkrFlexXmlParser';

export interface FlexSyncOptions {
  token: string;
  queryId: string;
  startDate?: string; // YYYYMMDD
  endDate?: string; // YYYYMMDD
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
 * Execute Flex Web Service SendRequest and GetStatement via server proxy.
 */
export async function fetchIbkrFlexStatement(options: FlexSyncOptions): Promise<FlexSyncResult> {
  if (!options.token) {
    return {
      success: false,
      errorMessage: 'Flex Web Service Token is required. Please configure your IBKR token.',
      errorCode: 'NO_TOKEN',
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

    if (parsed.hasDateParseError) {
      return {
        success: false,
        errorMessage: 'In General Configuration set Date Format to yyyy-MM-dd.',
      };
    }

    if (parsed.hasLotBreakout) {
      return {
        success: false,
        errorMessage: 'In Trades choose Executions only; in General Configuration do not include lot breakout.',
      };
    }
    
    const required = [
      { name: 'Trades (Detail level: Execution)', ok: parsed.hasTradesSection },
      { name: 'Cash Transactions', ok: parsed.hasCashTransactionsSection },
      { name: 'Corporate Actions', ok: parsed.hasCorporateActionsSection },
      { name: 'Transfers', ok: parsed.hasTransfersSection },
      { name: 'Open Positions', ok: parsed.hasOpenPositionsSection },
      { name: 'Financial Instrument Information', ok: parsed.hasFinancialInstrumentInformationSection },
      { name: 'Account Information', ok: parsed.hasAccountInformationSection },
    ];

    const missing = required.filter(s => !s.ok).map(s => s.name);
    if (missing.length > 0) {
      if (!parsed.hasTradesSection) {
        return {
          success: false,
          errorMessage: 'Open Sections → Trades. In the panel dropdown choose Executions, then Select All. Executions is not its own section.',
        };
      }
      return {
        success: false,
        errorMessage: 'IBKR Flex Web Service configuration is missing required sections: ' + missing.join(', ') + '. Please configure these sections in IBKR Portal.',
      };
    }

    let retentionWarning = data.retentionWarning;
    if (!parsed.hasOptionExercisesSection) {
      const optWarn = 'Option exercise/assignment history may be incomplete; Trades codes A/Ex/Ep will still be used.';
      retentionWarning = retentionWarning ? `${retentionWarning} ${optWarn}` : optWarn;
    }

    return {
      success: true,
      referenceCode: data.referenceCode,
      statementXml: data.statementXml,
      parsedData: parsed,
      retentionWarning,
    };
  } catch (error: any) {
    return {
      success: false,
      errorMessage: error.message || 'Network error connecting to backend sync service',
    };
  }
}

