import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  HelpCircle,
  Calculator,
  Calendar,
  Layers,
  Sparkles,
  Link as LinkIcon,
  ShieldCheck,
  Percent,
  Coins,
  Split,
  EyeOff,
} from 'lucide-react';
import { Transaction, Account, SecurityMaster, TransactionType, CorporateActionTreatment } from '../types/tax';
import { d, toMoney, toShares } from '../engine/decimal';
import { convertToCad } from '../engine/bocFx';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  securities: SecurityMaster[];
  onAddTransaction: (tx: Transaction, newSecurity?: SecurityMaster) => void;
}

type EntryMode = 'STANDARD' | 'OPENING_ACB' | 'CA_WIZARD' | 'EXERCISE_WIZARD';

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  accounts,
  securities,
  onAddTransaction,
}) => {
  const [mode, setMode] = useState<EntryMode>('STANDARD');

  // Common fields
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || 'acc-taxable-1');
  const [symbol, setSymbol] = useState<string>('RY.TO');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState<TransactionType>('BUY');
  const [quantity, setQuantity] = useState<string>('100');
  const [price, setPrice] = useState<string>('140.00');
  const [currency, setCurrency] = useState<string>('CAD');
  const [commission, setCommission] = useState<string>('9.95');

  // FX Override
  const [useFxOverride, setUseFxOverride] = useState<boolean>(false);
  const [customFxRate, setCustomFxRate] = useState<string>('1.3500');
  const [fxOverrideReason, setFxOverrideReason] = useState<string>('Bank of Canada trade date fix');

  // Exclude from Tax
  const [isExcludedFromTax, setIsExcludedFromTax] = useState<boolean>(false);
  const [exclusionReason, setExclusionReason] = useState<string>('Transfer between identical beneficial ownership accounts');

  // Opening ACB fields
  const [openingTotalAcbCad, setOpeningTotalAcbCad] = useState<string>('14000.00');

  // CA Wizard fields
  const [caType, setCaType] = useState<'SPLIT' | 'MERGER_MIXED' | 'SPINOFF' | 'S85_1'>('MERGER_MIXED');
  const [newSymbol, setNewSymbol] = useState<string>('NEWCO');
  const [caCashReceived, setCaCashReceived] = useState<string>('500.00');
  const [caNewShares, setCaNewShares] = useState<string>('50');
  const [caNewFmvPerShare, setCaNewFmvPerShare] = useState<string>('30.00');
  const [caRatio, setCaRatio] = useState<string>('2');

  // Option Exercise Wizard fields
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [optionAction, setOptionAction] = useState<'EXERCISE' | 'ASSIGNMENT'>('EXERCISE');
  const [strikePrice, setStrikePrice] = useState<string>('150.00');
  const [contractsCount, setContractsCount] = useState<string>('1');
  const [premiumPaidPerContract, setPremiumPaidPerContract] = useState<string>('4.50');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let savedQuantity = quantity;
    const qtyVal = parseFloat(quantity) || 0;
    const priceVal = parseFloat(price) || 0;
    const commVal = parseFloat(commission) || 0;

    let targetTxType = txType;
    let computedGross = qtyVal * priceVal;
    let txSymbol = symbol.toUpperCase().trim();

    let corporateActionDetails = undefined;
    let linkedOptionId = undefined;

    // 1. OPENING ACB MODE
    if (mode === 'OPENING_ACB') {
      targetTxType = 'OPENING_BALANCE';
      computedGross = parseFloat(openingTotalAcbCad) || 0;
    }

    // 2. CA WIZARD MODE
    if (mode === 'CA_WIZARD') {
      if (caType === 'SPLIT') {
        targetTxType = 'STOCK_SPLIT';
        corporateActionDetails = {
          treatment: 'CONTINUITY_SPLIT' as CorporateActionTreatment,
          statutoryBasis: 'ITA s. 47(1) Stock Split',
          brokerDescription: `Stock split ratio ${caRatio}:1`,
          oldSecurityId: txSymbol,
          ratio: parseFloat(caRatio) || 1,
        };
      } else if (caType === 'MERGER_MIXED') {
        targetTxType = 'MERGER_MIXED';
        corporateActionDetails = {
          treatment: 'MIXED_CAPITAL_BOOT_TAXABLE' as CorporateActionTreatment,
          statutoryBasis: 'ITA s. 40(1) Mixed Consideration',
          brokerDescription: `Takeover consideration: $${caCashReceived} cash + ${caNewShares} shares of ${newSymbol}`,
          oldSecurityId: txSymbol,
          newSecurityId: newSymbol,
          totalCashReceived: caCashReceived,
          newSharesReceived: caNewShares,
          newShareFmvPerShare: caNewFmvPerShare,
        };
      } else if (caType === 'S85_1') {
        targetTxType = 'MERGER_SHARE_EXCHANGE';
        corporateActionDetails = {
          treatment: 'S85_1_ROLLOVER' as CorporateActionTreatment,
          statutoryBasis: 'ITA s. 85.1 Canadian Share-for-Share Rollover',
          brokerDescription: `Share exchange into ${newSymbol}`,
          oldSecurityId: txSymbol,
          newSecurityId: newSymbol,
          newSharesReceived: caNewShares,
        };
      }
    }

    // 3. EXERCISE WIZARD MODE
    if (mode === 'EXERCISE_WIZARD') {
      const totalShares = (parseFloat(contractsCount) || 1) * 100;
      savedQuantity = totalShares.toString();
      const strike = parseFloat(strikePrice) || 0;
      const premTotal = (parseFloat(premiumPaidPerContract) || 0) * (parseFloat(contractsCount) || 1) * 100;

      if (optionAction === 'EXERCISE' && optionType === 'CALL') {
        targetTxType = 'EXERCISE_LONG_CALL';
        // Under ITA s. 49(3): Share ACB = (Shares * Strike) + Call Premium Paid
        computedGross = totalShares * strike + premTotal;
      } else if (optionAction === 'ASSIGNMENT' && optionType === 'PUT') {
        targetTxType = 'ASSIGNED_SHORT_PUT';
        // Under ITA s. 49(4): Share ACB = (Shares * Strike) - Put Premium Received
        computedGross = totalShares * strike - premTotal;
      } else if (optionAction === 'EXERCISE' && optionType === 'PUT') {
        targetTxType = 'EXERCISE_LONG_PUT';
        // Under ITA s. 49(4): Sale Proceeds = (Shares * Strike) - Put Premium Paid
        computedGross = totalShares * strike - premTotal;
      } else {
        targetTxType = 'ASSIGNED_SHORT_CALL';
        // Under ITA s. 49(4): Sale Proceeds = (Shares * Strike) + Call Premium Received
        computedGross = totalShares * strike + premTotal;
      }
    }

    // FX Conversion via convertToCad unless override is on
    let fxRateVal = '1.0';
    let fxSource: 'BANK_OF_CANADA' | 'IBKR_ACTUAL' | 'MANUAL_OVERRIDE' = 'BANK_OF_CANADA';
    let computedAmountCad = toMoney(computedGross);
    let computedCommCad = toMoney(commVal);

    if (currency !== 'CAD') {
      if (useFxOverride) {
        const rate = parseFloat(customFxRate) || 1.35;
        fxRateVal = customFxRate;
        fxSource = 'MANUAL_OVERRIDE';
        computedAmountCad = toMoney(d(computedGross).times(rate));
        computedCommCad = toMoney(d(commVal).times(rate));
      } else {
        const grossCadInfo = convertToCad(computedGross, currency, date);
        const commCadInfo = convertToCad(commVal, currency, date);
        computedAmountCad = grossCadInfo.amountCad;
        computedCommCad = commCadInfo.amountCad;
        fxRateVal = String(grossCadInfo.fxRate);
        fxSource = grossCadInfo.fxSource;
      }
    }

    const newTx: Transaction = {
      id: `manual-${Date.now()}`,
      accountId,
      securityId: txSymbol,
      symbol: txSymbol,
      date,
      transactionType: targetTxType,
      isExcludedFromTax: isExcludedFromTax,
      exclusionReason: isExcludedFromTax ? exclusionReason : undefined,
      quantity: savedQuantity,
      price: price,
      currency: currency,
      commission: commission,
      totalGrossAmount: toMoney(computedGross),
      totalNetAmount: toMoney(d(computedGross).plus(commVal)),
      fxRate: fxRateVal,
      fxRateSource: fxSource,
      amountCad: computedAmountCad,
      commissionCad: computedCommCad,
      totalOutlaysCad: computedCommCad,
      corporateAction: corporateActionDetails,
      linkedOptionTransactionId: linkedOptionId,
      status: 'approved',
      source: 'MANUAL_ENTRY',
      reviewNotes: isExcludedFromTax ? `EXCLUDED FROM TAX: ${exclusionReason}` : fxOverrideReason,
    };

    // Ensure security is registered in master
    const existingSec = securities.find((s) => s.symbol === txSymbol);
    const newSec: SecurityMaster | undefined = existingSec
      ? undefined
      : {
          id: txSymbol,
          symbol: txSymbol,
          name: txSymbol,
          assetClass: 'STK',
          currency: currency,
          countryOfOrigin: currency === 'CAD' ? 'CA' : 'US',
        };

    onAddTransaction(newTx, newSec);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4E4E7] rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-6 text-[#18181B] max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#2563EB]" />
            <h3 className="font-bold text-base text-[#18181B]">Add Manual Canadian Tax Transaction</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#18181B] p-1.5 rounded-lg hover:bg-[#F4F4F5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Mode Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('STANDARD')}
            className={`p-2.5 rounded-xl border text-center transition-colors ${
              mode === 'STANDARD'
                ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] shadow-2xs'
                : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
            }`}
          >
            Standard Trade
          </button>

          <button
            type="button"
            onClick={() => setMode('OPENING_ACB')}
            className={`p-2.5 rounded-xl border text-center transition-colors ${
              mode === 'OPENING_ACB'
                ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] shadow-2xs'
                : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
            }`}
          >
            Opening ACB Pool
          </button>

          <button
            type="button"
            onClick={() => setMode('CA_WIZARD')}
            className={`p-2.5 rounded-xl border text-center transition-colors ${
              mode === 'CA_WIZARD'
                ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] shadow-2xs'
                : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
            }`}
          >
            CA Wizard
          </button>

          <button
            type="button"
            onClick={() => setMode('EXERCISE_WIZARD')}
            className={`p-2.5 rounded-xl border text-center transition-colors ${
              mode === 'EXERCISE_WIZARD'
                ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] shadow-2xs'
                : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
            }`}
          >
            Option Exercise
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Account & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#71717A] font-semibold mb-1">Portfolio Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono cursor-pointer"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.accountType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#71717A] font-semibold mb-1">Transaction Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
              />
            </div>
          </div>

          {/* MODE 1: STANDARD TRADE */}
          {mode === 'STANDARD' && (
            <div className="space-y-4 border-t border-[#E4E4E7] pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Event Type</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] cursor-pointer"
                  >
                    <option value="BUY">Buy / Acquisition (ITA s. 47)</option>
                    <option value="SELL">Sell / Disposition (ITA s. 40)</option>
                    <option value="DIVIDEND_CASH">Dividend (Cash)</option>
                    <option value="RETURN_OF_CAPITAL">Return of Capital (ITA s. 53(2)(a))</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Symbol / Ticker</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono cursor-pointer"
                  >
                    <option value="CAD">CAD (Canadian Dollar)</option>
                    <option value="USD">USD (US Dollar)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Price / Share</label>
                  <input
                    type="number"
                    step="any"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Commissions / Outlays</label>
                  <input
                    type="number"
                    step="any"
                    value={commission}
                    onChange={(e) => setCommission(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: OPENING ACB */}
          {mode === 'OPENING_ACB' && (
            <div className="space-y-4 border-t border-[#E4E4E7] pt-4">
              <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl text-xs text-[#1D4ED8]">
                Establish an official CRA opening adjusted cost base pool carried over from a prior tax return or broker transfer.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Security Ticker</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Opening Units Held</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Total Opening ACB ($ CAD)</label>
                  <input
                    type="number"
                    value={openingTotalAcbCad}
                    onChange={(e) => setOpeningTotalAcbCad(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODE 3: CORPORATE ACTION WIZARD */}
          {mode === 'CA_WIZARD' && (
            <div className="space-y-4 border-t border-[#E4E4E7] pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Corporate Action Type</label>
                  <select
                    value={caType}
                    onChange={(e) => setCaType(e.target.value as any)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] cursor-pointer font-medium"
                  >
                    <option value="MERGER_MIXED">Mixed Consideration (Cash + Stock)</option>
                    <option value="SPLIT">Stock Split / Consolidation</option>
                    <option value="S85_1">s. 85.1 Share Rollover</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Target Old Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono uppercase"
                  />
                </div>
              </div>

              {caType === 'MERGER_MIXED' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#71717A] font-semibold mb-1">Cash Consideration ($ CAD)</label>
                    <input
                      type="number"
                      value={caCashReceived}
                      onChange={(e) => setCaCashReceived(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#71717A] font-semibold mb-1">New Shares Received</label>
                    <input
                      type="number"
                      value={caNewShares}
                      onChange={(e) => setCaNewShares(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#71717A] font-semibold mb-1">New Share FMV / Unit</label>
                    <input
                      type="number"
                      value={caNewFmvPerShare}
                      onChange={(e) => setCaNewFmvPerShare(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 4: OPTION EXERCISE WIZARD */}
          {mode === 'EXERCISE_WIZARD' && (
            <div className="space-y-4 border-t border-[#E4E4E7] pt-4">
              <div className="p-3 bg-[#F5F3FF] border border-[#DDD6FE] rounded-xl text-xs text-[#5B21B6]">
                Under <strong>ITA s. 49(3) / 49(4)</strong>, option exercise/assignment rolls the option premium directly into the share acquisition cost base or sale proceeds.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Option Leg</label>
                  <select
                    value={`${optionAction}_${optionType}`}
                    onChange={(e) => {
                      const [act, typ] = e.target.value.split('_');
                      setOptionAction(act as any);
                      setOptionType(typ as any);
                    }}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] cursor-pointer font-medium"
                  >
                    <option value="EXERCISE_CALL">Long Call Exercise (s. 49(3))</option>
                    <option value="ASSIGNMENT_PUT">Short Put Assignment (s. 49(4))</option>
                    <option value="EXERCISE_PUT">Long Put Exercise (s. 49(4))</option>
                    <option value="ASSIGNMENT_CALL">Short Call Assignment (s. 49(4))</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Underlying Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Strike Price</label>
                  <input
                    type="number"
                    value={strikePrice}
                    onChange={(e) => setStrikePrice(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Number of Contracts (x100 shares)</label>
                  <input
                    type="number"
                    value={contractsCount}
                    onChange={(e) => setContractsCount(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#71717A] font-semibold mb-1">Option Premium Per Share</label>
                  <input
                    type="number"
                    value={premiumPaidPerContract}
                    onChange={(e) => setPremiumPaidPerContract(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ADVANCED: FX OVERRIDE & EXCLUDE FROM TAX */}
          <div className="border-t border-[#E4E4E7] pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useFxOverride}
                  onChange={(e) => setUseFxOverride(e.target.checked)}
                  className="rounded-md border-[#E4E4E7] text-[#2563EB] focus:ring-0 cursor-pointer"
                />
                <span className="text-xs font-semibold text-[#18181B]">Custom Foreign Exchange Rate Override</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExcludedFromTax}
                  onChange={(e) => setIsExcludedFromTax(e.target.checked)}
                  className="rounded-md border-[#E4E4E7] text-[#DC2626] focus:ring-0 cursor-pointer"
                />
                <span className="text-xs font-semibold text-[#DC2626]">Exclude Transaction from Tax Calculation</span>
              </label>
            </div>

            {useFxOverride && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#F9FAFB] rounded-xl border border-[#E4E4E7]">
                <div>
                  <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1">Override FX Rate (to CAD)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customFxRate}
                    onChange={(e) => setCustomFxRate(e.target.value)}
                    className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-[#18181B] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1">CPA Audit Reason</label>
                  <input
                    type="text"
                    value={fxOverrideReason}
                    onChange={(e) => setFxOverrideReason(e.target.value)}
                    className="w-full bg-white border border-[#E4E4E7] rounded-lg px-3 py-1.5 text-[#18181B]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-[#E4E4E7] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#18181B] rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record & Calculate</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
