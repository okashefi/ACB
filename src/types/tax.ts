/**
 * Canadian ACB Calculator - Core Tax Types & Interfaces
 * Governed by the Income Tax Act (Canada) & CRA Administrative Practice
 */

export type Currency = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'JPY' | 'AUD' | string;

export type AccountType = 
  | 'taxable' 
  | 'tfsa' 
  | 'rrsp' 
  | 'rrif' 
  | 'fhsa' 
  | 'resp' 
  | 'rdsp' 
  | 'lira' 
  | 'spouse_taxable' 
  | 'affiliate_taxable' 
  | 'other_registered';

export interface Account {
  id: string;
  accountId: string; // IBKR Account ID e.g. U1234567 or external
  name: string;
  broker: 'IBKR' | 'Questrade' | 'Wealthsimple' | 'TD' | 'RBC' | 'BMO' | 'CIBC' | 'Scotia' | 'Other';
  accountType: AccountType;
  baseCurrency: Currency;
  isHouseholdAffiliate: boolean; // Flagged for ITA s. 54 superficial loss affiliate checks
  affiliateName?: string;
  notes?: string;
}

export type AssetClass = 'STK' | 'OPT' | 'CASH' | 'FUT' | 'WAR' | 'BOND' | 'OTHER';

export interface SecurityMaster {
  id: string; // Internal stable key
  symbol: string; // Display ticker
  name: string;
  assetClass: AssetClass;
  isin?: string;
  cusip?: string;
  figi?: string;
  conid?: string; // IBKR Contract ID
  listingExchange?: string;
  currency: Currency;
  shareClass?: string; // e.g. Common, Class A, Class B
  isInterlisted?: boolean;
  countryOfOrigin?: 'CA' | 'US' | 'OTHER';
  isSpecifiedForeignProperty?: boolean; // T1135 tracking
  
  // Option specific
  optionDetails?: {
    underlyingConid?: string;
    underlyingSymbol: string;
    putOrCall: 'PUT' | 'CALL';
    strike: number;
    expiryDate: string; // YYYY-MM-DD
    multiplier: number; // typically 100
    deliverable?: string;
    isCorporateActionAdjusted?: boolean;
  };
}

export type TransactionType = 
  | 'BUY' 
  | 'SELL' 
  | 'SELL_SHORT' 
  | 'BUY_TO_COVER' 
  | 'BUY_TO_OPEN_OPT' 
  | 'SELL_TO_CLOSE_OPT' 
  | 'SELL_TO_OPEN_OPT' 
  | 'BUY_TO_CLOSE_OPT' 
  | 'EXERCISE_LONG_CALL' 
  | 'ASSIGNED_SHORT_CALL' 
  | 'EXERCISE_LONG_PUT' 
  | 'ASSIGNED_SHORT_PUT' 
  | 'OPT_EXPIRY_LONG' 
  | 'OPT_EXPIRY_SHORT' 
  | 'DIVIDEND_CASH' 
  | 'DIVIDEND_REINVESTED' 
  | 'RETURN_OF_CAPITAL' 
  | 'WITHHOLDING_TAX' 
  | 'INTEREST_PAID' 
  | 'INTEREST_RECEIVED' 
  | 'PAYMENT_IN_LIEU' 
  | 'STOCK_SPLIT' 
  | 'STOCK_CONSOLIDATION' 
  | 'STOCK_DIVIDEND' 
  | 'MERGER_ALL_CASH' 
  | 'MERGER_SHARE_EXCHANGE' 
  | 'MERGER_MIXED' 
  | 'SPINOFF' 
  | 'RIGHTS_ISSUE' 
  | 'WORTHLESS_SECURITIES_S50' 
  | 'TRANSFER_IN' 
  | 'TRANSFER_OUT' 
  | 'OPENING_BALANCE' 
  | 'ACB_ADJUSTMENT_MANUAL';

export type ReviewStatus = 'approved' | 'needs_review' | 'auto_approved' | 'rejected';

export type CorporateActionTreatment =
  | 'CONTINUITY_SPLIT' // Stock split / reverse split (Total ACB unchanged, qty adjusted)
  | 'CONTINUITY_TICKER_CHANGE' // Same issuer, name/CUSIP change (no disposition)
  | 'FULL_CASH_DISPOSITION' // All-cash acquisition (Full disposition at CAD proceeds)
  | 'S85_1_ROLLOVER' // Canadian share-for-share rollover (ACB carries over)
  | 'S86_REORGANIZATION' // Reorganization of capital (same corporation)
  | 'S87_AMALGAMATION' // Amalgamation of Canadian corps
  | 'FOREIGN_SHARE_EXCHANGE_TAXABLE' // Foreign share-for-share taxable at FMV (Default for US deals)
  | 'FOREIGN_SHARE_EXCHANGE_ELECTED_ROLLOVER' // User assert relieving provision
  | 'MIXED_CAPITAL_BOOT_TAXABLE' // Mixed consideration treated as capital boot (taxable)
  | 'MIXED_CAPITAL_BOOT_ROLLOVER' // Mixed consideration with s.85.1 rollover (min(inherent gain, cash))
  | 'MIXED_TAKEOVER_DIVIDEND' // Cash leg treated as special/deemed dividend
  | 'MIXED_RETURN_OF_CAPITAL' // Cash leg treated as ROC reducing ACB
  | 'S86_1_ELIGIBLE_SPINOFF' // Eligible foreign spin-off with s.86.1 election (ACB allocated by FMV)
  | 'INELIGIBLE_SPINOFF_TAXABLE_DIVIDEND' // Ineligible foreign spin-off (taxable foreign dividend + FMV ACB for spinco)
  | 'S50_1_BAD_DEBT_ELECTION' // Worthless shares deemed disposition at $0 proceeds
  | 'CUSTOM_OVERRIDE';

export interface CorporateActionDetails {
  treatment: CorporateActionTreatment;
  statutoryBasis: string; // e.g. "ITA s. 85.1", "ITA s. 86.1", "ITA s. 47", "ITA s. 40"
  brokerDescription: string;
  sourceText?: string;
  oldSecurityId: string;
  newSecurityId?: string;
  ratio?: number; // e.g. 2 for 2-for-1 split, or 0.5 for new shares
  cashPerShare?: number; // In original currency
  cashCurrency?: Currency;
  totalCashReceived?: string;
  newSharesReceived?: string;
  newShareFmvPerShare?: string; // In CAD or original currency
  newShareFmvCurrency?: Currency;
  targetShareFmvAtEffectiveDate?: string;
  electionConfirmedBy?: 'user' | 'tax_pro' | 'default_provisional';
  userNotes?: string;
  
  // Calculated impact preview
  calculatedGainLoss?: string; // in CAD
  calculatedNewAcb?: string; // in CAD
  calculatedDividendAmount?: string; // in CAD
  calculatedRocAmount?: string; // in CAD
}

export interface Transaction {
  id: string;
  accountId: string;
  securityId: string;
  symbol: string;
  date: string; // YYYY-MM-DD
  settlementDate?: string;
  transactionType: TransactionType;
  quantity: string; // positive for buy/adds, positive number disposed for sells
  price: string; // in transaction currency
  currency: Currency;
  
  // Expenses
  commission: string; // in transaction currency
  exchangeFees?: string;
  taxes?: string; // GST/HST
  totalGrossAmount: string; // in transaction currency
  totalNetAmount: string; // in transaction currency
  
  // FX conversion
  fxRate: string; // e.g. USD to CAD rate on trade date
  fxRateSource: 'BANK_OF_CANADA' | 'IBKR_ACTUAL' | 'MANUAL_OVERRIDE';
  
  // CAD calculated amounts
  amountCad: string;
  commissionCad: string;
  totalOutlaysCad: string;
  
  // Corporate action link
  corporateAction?: CorporateActionDetails;
  
  // Option linking
  linkedOptionTransactionId?: string;
  linkedShareTransactionId?: string;
  ibkrCode?: string; // e.g. 'A' (assigned), 'Ex' (exercised), 'Ep' (expired), 'Ca' (cancelled)

  // Transfer details
  targetAccountId?: string;
  destinationAccountType?: Account['accountType'];
  sourceAccountId?: string;
  sourceAccountType?: Account['accountType'];
  
  // Exclude from tax
  isExcludedFromTax?: boolean;
  exclusionReason?: string;

  // Status and Provenance
  status: ReviewStatus;
  reasonCode?: 'MISSING_ACB' | 'QTY_SHORTFALL' | string;
  reviewNotes?: string;
  source: 'IBKR_FLEX_API' | 'IBKR_FLEX_FILE' | 'IBKR_CSV' | 'MANUAL_ENTRY' | 'TEST_FIXTURE';
  rawPayloadHash?: string;
  ibkrTransactionId?: string;
  ibkrExecutionId?: string;
  isCancelled?: boolean;
}

export interface SuperficialLossEvent {
  id?: string;
  dispositionTransactionId: string;
  securityId: string;
  symbol: string;
  dispositionDate: string;
  disposedShares?: string;
  rawCapitalLossCad: string; // Absolute amount of loss
  grossLossCad?: string; // alias for rawCapitalLossCad
  deniedLossCad: string; // Amount deemed superficial
  allowedLossCad: string; // Loss recognized on Schedule 3
  allowableLossCad?: string; // alias for allowedLossCad
  
  // Matching replacement
  replacementTransactionId?: string;
  replacementAccountId?: string;
  replacementAccountType?: AccountType;
  replacementDate?: string;
  isPermanentlyDeniedInRegistered: boolean; // True if replacement was inside TFSA/RRSP/FHSA
  
  status: 'provisional' | 'final'; // Provisional if within 30-day window from today
  explanation: string;
}

export interface RealizedGainLoss {
  id: string;
  taxYear: number;
  dispositionDate: string;
  settlementDate?: string;
  securityId: string;
  symbol: string;
  securityName: string;
  assetClass: AssetClass;
  quantityDisposed: string;
  
  // Proceeds
  grossProceedsCad: string;
  dispositionOutlaysCad: string; // Selling commissions & fees
  netProceedsCad: string;
  
  // Cost base
  acbPerUnitPriorCad: string;
  acbOfUnitsDisposedCad: string;
  
  // Raw Gain/Loss
  rawGainLossCad: string;
  
  // Superficial loss adjustments
  isSuperficialLoss: boolean;
  superficialLossDeniedCad: string;
  replacementTargetSecurityId?: string;
  isPermanentlyDeniedInRegistered: boolean;
  
  // Final recognized capital gain or loss for Schedule 3
  recognizedGainLossCad: string;
  
  // Underlying transactions & rule citations
  dispositionTransactionId: string;
  statutoryCitations: string[]; // e.g. ["ITA s. 40(1)(a)", "ITA s. 47", "ITA s. 54"]
  explanation: string;
}

export interface AcbLedgerEntry {
  id: string;
  date: string;
  securityId: string;
  symbol: string;
  transactionId: string;
  transactionType: TransactionType;
  description: string;
  
  // Quantity delta
  quantityChange: string;
  runningQuantity: string;
  
  // Cost delta
  costChangeCad: string; // Positive for adds, negative for dispositions
  runningTotalAcbCad: string;
  runningAcbPerUnitCad: string;
  
  // Gain/Loss if disposition
  realizedGainLossCad?: string;
  superficialLossAdjustmentCad?: string;
  
  // FX details
  originalCurrency: Currency;
  fxRateUsed: string;
  fxRateSource: string;
  
  statutoryRule: string; // e.g. "ITA s. 47(1) Average Cost Pool"
  notes?: string;
}

export interface SecurityRollforward {
  securityId: string;
  symbol: string;
  name: string;
  taxYear: number;
  openingQuantity: string;
  openingAcbCad: string;
  openingAcbPerUnitCad: string;
  
  acquisitionsQuantity: string;
  acquisitionsCostCad: string;
  
  dispositionsQuantity: string;
  dispositionsAcbRemovedCad: string;
  
  rocAdjustmentsCad: string; // Return of capital reductions
  superficialLossAdditionsCad: string; // Denied losses added back to ACB
  corporateActionAdjustmentsCad: string;
  
  closingQuantity: string;
  closingTotalAcbCad: string;
  closingAcbPerUnitCad: string;
  
  realizedGainLossTotalCad: string;
  unrealizedGainLossCad?: string;
  currentMarketPriceCad?: string;
}

export interface OpenPosition {
  accountId: string;
  securityId?: string;
  symbol: string;
  conid?: string;
  isin?: string;
  quantity: string;
  costPrice?: string;
  costBasisCad?: string;
  currency?: Currency;
  markPrice?: string;
  positionValueCad?: string;
  asOfDate?: string;
  reportDate?: string;
}

export interface ReconciliationBreak {
  securityId: string;
  symbol: string;
  conid?: string;
  calculatedQuantity: string;
  brokerReportedQuantity: string;
  quantityDiscrepancy: string;
  calculatedAcbCad: string;
  status: 'MATCHED' | 'QUANTITY_BREAK' | 'UNREVIEWED_ACTIONS_PENDING';
  explanation: string;
}

export interface FlexConnectorConfig {
  token: string; // Encrypted or masked
  tokenLast4: string;
  queryId: string;
  queryName?: string;
  tokenExpiresAt?: string; // ISO string
  lastSyncTimestamp?: string;
  syncInterval: 'manual' | 'daily' | 'weekly';
  status: 'CONNECTED' | 'EXPIRED' | 'UNCONFIGURED' | 'SYNC_IN_PROGRESS' | 'ERROR';
  lastError?: string;
  ipAllowlistNote?: string;
}

export interface CalculationEngineOutput {
  ledger: AcbLedgerEntry[];
  realizedGainsLosses: RealizedGainLoss[];
  superficialLosses: SuperficialLossEvent[];
  rollforwardsByYear: Map<number, Map<string, SecurityRollforward>>;
  securityBalances: Map<string, { quantity: string; totalAcbCad: string; acbPerUnitCad: string; symbol: string; name: string }>;
  incomeDistributions: {
    dividendsCad: string;
    rocCad: string;
    withholdingTaxCad: string;
    optionPremiumsCad: string;
  };
  totalRealizedGainCad: string;
  totalRealizedLossCad: string;
  totalNetRealizedGainLossCad: string;
  auditTrail: string[];
}

export interface TaxSettings {
  taxResidentCountry: 'CA';
  province: string;
  defaultFxSource: 'BANK_OF_CANADA' | 'IBKR_ACTUAL';
  taxCharacter: 'capital' | 'business'; // Defaults to capital
  isDayTraderWarningAcknowledged: boolean;
  capitalGainsInclusionRate: string; // 0.50 or tiered 0.667 config
  inclusionRateRulesByYear: Record<number, { baseRate: string; highThresholdRate?: string; thresholdCad?: string }>;
  cpaReviewDisclaimerAcknowledged: boolean;
}

export interface T5008SlipEntry {
  id: string;
  taxYear: number;
  date: string; // Box 13 (Settlement/Trade Date)
  symbol: string; // Box 15 / Description
  securityDescription?: string;
  quantity: string; // Box 14
  proceedsCad: string; // Box 21 (Proceeds of disposition or settlement amount)
  bookValueCad?: string; // Box 20 (Cost or book value - Note: Broker book value is usually FIFO)
  currency?: string; // Box 22
  fxRateUsed?: number;
  originalCurrency?: string;
  originalProceeds?: string;
  originalBookValue?: string;
  rawLine?: string;
}

export interface T5008DiscrepancyRow {
  dispositionId: string;
  date: string;
  symbol: string;
  securityName: string;
  quantityDisposed: string;
  appProceedsCad: string;
  appAcbCad: string;
  appOutlaysCad: string;
  appGainLossCad: string;
  t5008ProceedsCad: string | null;
  t5008BookValueCad: string | null; // Labeled: not CRA ACB — usually FIFO
  deltaProceedsCad: string | null; // app - t5008
  deltaGainCad: string | null; // app gain - (t5008 proceeds - t5008 book)
  status: 'MATCHED' | 'PROCEEDS_DIFFERENCE' | 'T5008_NOT_LOADED' | 'EXTRA_T5008';
  notes?: string;
}
