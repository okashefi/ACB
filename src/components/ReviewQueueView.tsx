import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Calculator,
  ShieldAlert,
  Info,
  Scale,
  DollarSign,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { Transaction, CorporateActionTreatment, SecurityMaster } from '../types/tax';
import { calculateCorporateAction } from '../engine/corporateActions';
import { formatCad, formatShares } from '../engine/decimal';
import { ReconciliationBreak } from '../types/tax';

interface ReviewQueueViewProps {
  reconciliationBreaks?: ReconciliationBreak[];
  transactions: Transaction[];
  securities: SecurityMaster[];
  securityBalances?: Map<string, { quantity: string; totalAcbCad: string; acbPerUnitCad: string; symbol: string; name: string }>;
  onConfirmTreatment: (
    txId: string,
    treatment: CorporateActionTreatment,
    details: {
      newShareFmvPerShare?: number;
      newSharesReceived?: number;
      totalCashReceived?: number;
      userNotes?: string;
    }
  ) => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  transactions,
  securities,
  securityBalances,
  onConfirmTreatment,
  reconciliationBreaks = [],
}) => {
  const pendingTx = transactions.filter((t) => t.status === 'needs_review');
  const [selectedTxId, setSelectedTxId] = useState<string>(pendingTx[0]?.id || '');
  
  // Mixed cash+stock decision states
  const [cashCharacter, setCashCharacter] = useState<'BOOT' | 'DIVIDEND' | 'ROC'>('BOOT');
  const [statutoryElection, setStatutoryElection] = useState<'S85_1' | 'S86' | 'S87' | 'TAXABLE_FOREIGN'>('TAXABLE_FOREIGN');
  
  const [customFmv, setCustomFmv] = useState<number>(35.00);
  const [customNewQty, setCustomNewQty] = useState<number>(50);
  const [customCash, setCustomCash] = useState<number>(1000);
  const [userNotes, setUserNotes] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<{ text: string; citations: string } | null>(null);

  const activeTx = transactions.find((t) => t.id === selectedTxId) || pendingTx[0];

  // Derive target old shares and actual taxable pool ACB from securityBalances
  const targetBal = activeTx ? (securityBalances?.get(activeTx.securityId) || Array.from(securityBalances?.values() || []).find((b: { symbol: string }) => b.symbol === activeTx.symbol)) : undefined;
  const oldSharesHeld = targetBal ? targetBal.quantity : (activeTx?.quantity || '0');
  const oldAcbEstimate = targetBal ? targetBal.totalAcbCad : (activeTx?.amountCad || '0.00');

  // Determine treatment key from the matrix of (Cash Character x Statutory Election)
  const getDerivedTreatment = (character: 'BOOT' | 'DIVIDEND' | 'ROC', election: 'S85_1' | 'S86' | 'S87' | 'TAXABLE_FOREIGN'): CorporateActionTreatment => {
    if (character === 'DIVIDEND') return 'MIXED_TAKEOVER_DIVIDEND';
    if (character === 'ROC') return 'MIXED_RETURN_OF_CAPITAL';
    if (election === 'TAXABLE_FOREIGN') return 'MIXED_CAPITAL_BOOT_TAXABLE';
    if (election === 'S85_1') return 'MIXED_CAPITAL_BOOT_ROLLOVER';
    if (election === 'S86') return 'S86_REORGANIZATION';
    if (election === 'S87') return 'S87_AMALGAMATION';
    return 'MIXED_CAPITAL_BOOT_ROLLOVER';
  };

  const currentSelectedTreatment = getDerivedTreatment(cashCharacter, statutoryElection);

  // Outcome 1: Taxable Foreign Deal (Full FMV Disposition under ITA s. 40)
  const outcomeTaxable = calculateCorporateAction(
    {
      treatment: 'MIXED_CAPITAL_BOOT_TAXABLE',
      statutoryBasis: 'ITA s. 40(1)',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash.toString(),
      newSharesReceived: customNewQty.toString(),
      newShareFmvPerShare: customFmv.toString(),
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Outcome 2: Canadian Rollover with Boot (ITA s. 85.1(2))
  const outcomeRolloverBoot = calculateCorporateAction(
    {
      treatment: 'MIXED_CAPITAL_BOOT_ROLLOVER',
      statutoryBasis: 'ITA s. 85.1(2)',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash.toString(),
      newSharesReceived: customNewQty.toString(),
      newShareFmvPerShare: customFmv.toString(),
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Outcome 3: Takeover Deemed Dividend (ITA s. 84(2))
  const outcomeDividend = calculateCorporateAction(
    {
      treatment: 'MIXED_TAKEOVER_DIVIDEND',
      statutoryBasis: 'ITA s. 84(2) Dividend + s. 85.1 Rollover',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash.toString(),
      newSharesReceived: customNewQty.toString(),
      newShareFmvPerShare: customFmv.toString(),
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Outcome 4: Return of Capital (ITA s. 53(2)(a))
  const outcomeRoc = calculateCorporateAction(
    {
      treatment: 'MIXED_RETURN_OF_CAPITAL',
      statutoryBasis: 'ITA s. 53(2)(a) ROC Reduction',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash.toString(),
      newSharesReceived: customNewQty.toString(),
      newShareFmvPerShare: customFmv.toString(),
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Request AI Explanation
  const handleRequestAiExplain = async () => {
    if (!activeTx) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerText: activeTx.corporateAction?.brokerDescription || activeTx.transactionType,
          securitySymbol: activeTx.symbol,
          cashAmount: customCash,
          newShares: customNewQty,
          transactionDate: activeTx.date,
        }),
      });
      const data = await res.json();
      setAiExplanation({
        text: data.explanation || 'No response',
        citations: data.statutoryReference || 'ITA s. 40, s. 85.1, s. 84, s. 53(2)(a)',
      });
    } catch (e: any) {
      setAiExplanation({
        text: 'CRA guidance: In mixed cash+stock corporate transactions, the tax treatment depends on whether the cash leg represents proceeds of disposition (boot), a special dividend, or a return of capital, and whether Canadian rollover relief applies.',
        citations: 'ITA s. 40 / s. 85.1 / s. 84 / s. 53',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!activeTx) return;
    onConfirmTreatment(activeTx.id, currentSelectedTreatment, {
      newShareFmvPerShare: customFmv,
      newSharesReceived: customNewQty,
      totalCashReceived: customCash,
      userNotes: userNotes || `Classified as ${cashCharacter} under ${statutoryElection}`,
    });
  };

  const hasBreaks = reconciliationBreaks.length > 0;

  if (pendingTx.length === 0 && !hasBreaks) {
    return (
      <div id="review-queue-empty" className="bg-white border border-[#E4E4E7] rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-2xs">
        <div className="w-12 h-12 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center mx-auto border border-[#A7F3D0]">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-[#18181B]">Review Queue is Clear</h3>
        <p className="text-xs text-[#71717A] leading-relaxed">
          All corporate actions, mergers, spin-offs, and distributions have been classified with statutory basis citations and posted to the ACB ledger.
        </p>
      </div>
    );
  }

  return (
    <div id="review-queue-container" className="space-y-6">
      
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#D97706]" />
          <span>Corporate Action Review Queue ({pendingTx.length} Pending)</span>
        </h2>
        <p className="text-xs text-[#71717A] mt-0.5">
          Under Canadian tax law, mixed consideration (cash + stock) and foreign reorganizations require explicit tax character election.
        </p>
      </div>

      {hasBreaks && (
        <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] space-y-4">
          <div className="flex items-center gap-2 text-[#DC2626] font-semibold text-sm">
            <ShieldAlert className="w-4 h-4" />
            Position Reconciliation Breaks Detected
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reconciliationBreaks.map((b) => (
              <div key={b.securityId} className="p-3 bg-white border border-[#FECACA] rounded-lg text-xs space-y-2">
                <div className="flex justify-between items-center font-bold text-[#18181B]">
                  <span>{b.symbol}</span>
                  <span className="text-[#DC2626]">Discrepancy: {b.quantityDiscrepancy} units</span>
                </div>
                <p className="text-[#71717A]">
                  Our calculated ledger has <strong>{b.calculatedQuantity}</strong> shares, but the broker reports <strong>{b.brokerReportedQuantity}</strong>.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Pending Items List */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 space-y-3 shadow-2xs">
          <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider text-[10px]">
            Unclassified Events
          </span>

          <div className="space-y-2">
            {pendingTx.map((tx) => (
              <button
                key={tx.id}
                onClick={() => {
                  setSelectedTxId(tx.id);
                  setAiExplanation(null);
                  if (tx.corporateAction?.totalCashReceived) setCustomCash(parseFloat(tx.corporateAction.totalCashReceived) || 0);
                  if (tx.corporateAction?.newSharesReceived) setCustomNewQty(parseFloat(tx.corporateAction.newSharesReceived) || 0);
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  selectedTxId === tx.id
                    ? 'bg-[#FFFBEB] border-[#FDE68A] shadow-2xs'
                    : 'bg-[#F9FAFB] border-[#E4E4E7] hover:bg-[#F4F4F5] text-[#18181B]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#18181B] font-mono">{tx.symbol}</span>
                  <span className="text-[10px] text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-md border border-[#FDE68A] font-mono font-medium">
                    Needs Review
                  </span>
                </div>
                <div className="text-[11px] text-[#71717A] mt-1 truncate">
                  {tx.corporateAction?.brokerDescription || tx.transactionType}
                </div>
                <div className="text-[10px] text-[#A1A1AA] mt-1 font-mono">{tx.date}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right 2 Cols: Interactive Review Card & Decision Tree */}
        {activeTx && (
          <div className="lg:col-span-2 bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-6">
            
            {/* Broker Description Banner */}
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#18181B]">Broker Event Data</span>
                <span className="text-[11px] text-[#71717A] font-mono">{activeTx.date} • ID: {activeTx.id}</span>
              </div>
              <div className="text-xs text-[#18181B] font-mono bg-white p-3 rounded-lg border border-[#E4E4E7]">
                "{activeTx.corporateAction?.brokerDescription || 'Corporate Reorganization / Takeover'}"
              </div>
            </div>

            {/* AI Tax Assistant Guidance */}
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8]">
                  <Sparkles className="w-4 h-4 text-[#2563EB]" />
                  <span>AI Tax Assistant (CRA Income Tax Act Analysis)</span>
                </div>
                <button
                  id="btn-ask-ai-tax-assistant"
                  onClick={handleRequestAiExplain}
                  disabled={aiLoading}
                  className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{aiLoading ? 'Analyzing CRA Rules...' : 'Analyze Event'}</span>
                </button>
              </div>

              {aiExplanation ? (
                <div className="text-xs text-[#18181B] space-y-2 border-t border-[#BFDBFE] pt-2 font-sans leading-relaxed">
                  <div className="text-[#1D4ED8] text-[11px] font-mono font-semibold">
                    Statutory Citations: {aiExplanation.citations}
                  </div>
                  <p className="whitespace-pre-line text-[11px] text-[#374151]">
                    {aiExplanation.text}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-[#4B5563]">
                  Click 'Analyze Event' to request CRA classification guidance for this takeover/corporate action.
                </p>
              )}
            </div>

            {/* Parameters adjustments */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1 font-semibold">Cash Consideration ($ CAD)</label>
                <input
                  type="number"
                  value={customCash}
                  onChange={(e) => setCustomCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1 font-semibold">New Shares Received</label>
                <input
                  type="number"
                  value={customNewQty}
                  onChange={(e) => setCustomNewQty(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1 font-semibold">New Share FMV / Unit ($ CAD)</label>
                <input
                  type="number"
                  value={customFmv}
                  onChange={(e) => setCustomFmv(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* Step 1: Cash Character Selection */}
            <div className="space-y-2 border-t border-[#E4E4E7] pt-4">
              <label className="block text-xs font-bold text-[#18181B]">
                Step 1: Classify Cash Consideration Nature
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setCashCharacter('BOOT')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    cashCharacter === 'BOOT'
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>1. Capital Boot</span>
                    {cashCharacter === 'BOOT' && <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />}
                  </div>
                  <p className="text-[10px] text-[#71717A] mt-1">
                    Cash received as partial sale proceeds (ITA s. 40 / s. 85.1(2)).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCashCharacter('DIVIDEND')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    cashCharacter === 'DIVIDEND'
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>2. Deemed Dividend</span>
                    {cashCharacter === 'DIVIDEND' && <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />}
                  </div>
                  <p className="text-[10px] text-[#71717A] mt-1">
                    Cash leg is a special/takeover dividend (ITA s. 84(2)). T5 taxable.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCashCharacter('ROC')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    cashCharacter === 'ROC'
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>3. Return of Capital</span>
                    {cashCharacter === 'ROC' && <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />}
                  </div>
                  <p className="text-[10px] text-[#71717A] mt-1">
                    Cash reduces share ACB directly (ITA s. 53(2)(a)). Non-taxable unless ACB &lt; $0.
                  </p>
                </button>
              </div>
            </div>

            {/* Step 2: Statutory Election Selection */}
            <div className="space-y-2 border-t border-[#E4E4E7] pt-4">
              <label className="block text-xs font-bold text-[#18181B]">
                Step 2: Select Canadian Statutory Relief / Reorganization Election
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                
                <button
                  type="button"
                  onClick={() => setStatutoryElection('TAXABLE_FOREIGN')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    statutoryElection === 'TAXABLE_FOREIGN'
                      ? 'bg-white border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold">Taxable Foreign (ITA s. 40)</div>
                  <div className="text-[10px] text-[#71717A] mt-0.5">U.S./Foreign standard. Full FMV disposition.</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatutoryElection('S85_1')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    statutoryElection === 'S85_1'
                      ? 'bg-white border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold">s. 85.1 Rollover</div>
                  <div className="text-[10px] text-[#71717A] mt-0.5">Share exchange rollover with gain limited to boot.</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatutoryElection('S86')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    statutoryElection === 'S86'
                      ? 'bg-white border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold">s. 86 Reorganization</div>
                  <div className="text-[10px] text-[#71717A] mt-0.5">Capital restructuring of same Canadian corporation.</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStatutoryElection('S87')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    statutoryElection === 'S87'
                      ? 'bg-white border-[#2563EB] text-[#18181B] ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
                  }`}
                >
                  <div className="font-bold">s. 87 Amalgamation</div>
                  <div className="text-[10px] text-[#71717A] mt-0.5">Statutory merger of Canadian corporate entities.</div>
                </button>

              </div>
            </div>

            {/* Step 3: Side-by-Side Comparison of BOTH Dollar Outcomes Before Confirm */}
            <div className="space-y-3 border-t border-[#E4E4E7] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#18181B]">
                  Step 3: Side-by-Side Dollar Outcomes Before Confirmation
                </span>
                <span className="text-[10px] text-[#71717A] font-mono">
                  Target: {formatShares(oldSharesHeld)} shares @ {formatCad(oldAcbEstimate)} Total Pool ACB
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                
                {/* Outcome A: Taxable Foreign Deal (ITA s. 40) */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  statutoryElection === 'TAXABLE_FOREIGN' ? 'bg-[#EFF6FF] border-[#BFDBFE]' : 'bg-[#F9FAFB] border-[#E4E4E7]'
                }`}>
                  <div className="font-bold font-sans text-xs text-[#18181B] flex items-center justify-between">
                    <span>A. Taxable Acquisition (ITA s. 40)</span>
                    {statutoryElection === 'TAXABLE_FOREIGN' && <span className="text-[10px] px-2 py-0.5 bg-[#2563EB] text-white rounded font-mono">Selected</span>}
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-[#71717A]">
                      <span>Gross Proceeds:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeTaxable.proceedsCad)}</strong>
                    </div>
                    <div className="flex justify-between text-[#71717A]">
                      <span>Old Target ACB Disposed:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeTaxable.oldSharesAcbRemovedCad)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-[#E4E4E7] pt-1">
                      <span className="text-[#71717A]">Realized Capital Gain:</span>
                      <strong className="text-[#059669]">+{formatCad(outcomeTaxable.realizedCapitalGainCad)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#71717A]">New Stock Opening ACB:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeTaxable.newSharesTotalAcbCad)} ({formatCad(outcomeTaxable.newSharesAcbPerUnitCad)}/unit)</strong>
                    </div>
                  </div>
                </div>

                {/* Outcome B: Canadian Rollover with Boot (ITA s. 85.1) */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  statutoryElection === 'S85_1' || statutoryElection === 'S86' || statutoryElection === 'S87' ? 'bg-[#EFF6FF] border-[#BFDBFE]' : 'bg-[#F9FAFB] border-[#E4E4E7]'
                }`}>
                  <div className="font-bold font-sans text-xs text-[#18181B] flex items-center justify-between">
                    <span>B. Canadian Rollover (ITA s. 85.1 / 86 / 87)</span>
                    {(statutoryElection === 'S85_1' || statutoryElection === 'S86' || statutoryElection === 'S87') && <span className="text-[10px] px-2 py-0.5 bg-[#2563EB] text-white rounded font-mono">Selected</span>}
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-[#71717A]">
                      <span>Boot Proceeds Recognized:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeRolloverBoot.proceedsCad)}</strong>
                    </div>
                    <div className="flex justify-between text-[#71717A]">
                      <span>Old Target ACB Disposed:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeRolloverBoot.oldSharesAcbRemovedCad)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-[#E4E4E7] pt-1">
                      <span className="text-[#71717A]">Recognized Gain (Capped at Boot):</span>
                      <strong className="text-[#059669]">+{formatCad(outcomeRolloverBoot.realizedCapitalGainCad)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#71717A]">New Stock Rolled ACB:</span>
                      <strong className="text-[#18181B]">{formatCad(outcomeRolloverBoot.newSharesTotalAcbCad)} ({formatCad(outcomeRolloverBoot.newSharesAcbPerUnitCad)}/unit)</strong>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* User Notes */}
            <div>
              <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1 font-semibold">CPA Audit Reference Notes</label>
              <input
                type="text"
                placeholder="e.g. Approved per Form T2057 election / circular dated 2024-03-15"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] text-xs focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>

            {/* Confirm Button */}
            <div className="flex items-center justify-between border-t border-[#E4E4E7] pt-4">
              <div className="text-[11px] text-[#71717A] font-mono">
                Final Treatment: <strong className="text-[#18181B]">{currentSelectedTreatment}</strong>
              </div>

              <button
                id="btn-confirm-review-treatment"
                onClick={handleConfirm}
                className="px-5 py-2.5 bg-[#18181B] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Post to Ledger</span>
              </button>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
