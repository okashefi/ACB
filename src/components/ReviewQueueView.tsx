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
} from 'lucide-react';
import { Transaction, CorporateActionTreatment, SecurityMaster } from '../types/tax';
import { calculateCorporateAction } from '../engine/corporateActions';
import { formatCad, formatShares } from '../engine/decimal';

interface ReviewQueueViewProps {
  transactions: Transaction[];
  securities: SecurityMaster[];
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
  onConfirmTreatment,
}) => {
  const pendingTx = transactions.filter((t) => t.status === 'needs_review');
  const [selectedTxId, setSelectedTxId] = useState<string>(pendingTx[0]?.id || '');
  const [selectedTreatment, setSelectedTreatment] = useState<CorporateActionTreatment>('MIXED_CAPITAL_BOOT_TAXABLE');
  const [customFmv, setCustomFmv] = useState<number>(30);
  const [customNewQty, setCustomNewQty] = useState<number>(50);
  const [customCash, setCustomCash] = useState<number>(1000);
  const [userNotes, setUserNotes] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<{ text: string; citations: string } | null>(null);

  const activeTx = transactions.find((t) => t.id === selectedTxId) || pendingTx[0];

  // Calculate side-by-side comparison for active review item
  const oldSharesHeld = activeTx?.quantity || 100;
  const oldAcbEstimate = 2000; // Estimated baseline or look up from pool

  // Option 1: Taxable Mixed Deal (No rollover)
  const previewTaxable = calculateCorporateAction(
    {
      treatment: 'MIXED_CAPITAL_BOOT_TAXABLE',
      statutoryBasis: 'ITA s. 40(1)',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash,
      newSharesReceived: customNewQty,
      newShareFmvPerShare: customFmv,
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Option 2: Canadian Rollover with Boot (s. 85.1)
  const previewRollover = calculateCorporateAction(
    {
      treatment: 'MIXED_CAPITAL_BOOT_ROLLOVER',
      statutoryBasis: 'ITA s. 85.1(2)',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash,
      newSharesReceived: customNewQty,
      newShareFmvPerShare: customFmv,
    },
    oldSharesHeld,
    oldAcbEstimate
  );

  // Option 3: Takeover Dividend (s. 84)
  const previewDividend = calculateCorporateAction(
    {
      treatment: 'MIXED_TAKEOVER_DIVIDEND',
      statutoryBasis: 'ITA s. 84(2) Takeover Dividend',
      brokerDescription: activeTx?.corporateAction?.brokerDescription || '',
      oldSecurityId: activeTx?.securityId || '',
      totalCashReceived: customCash,
      newSharesReceived: customNewQty,
      newShareFmvPerShare: customFmv,
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
        citations: data.statutoryReference || 'ITA s. 40, s. 85.1',
      });
    } catch (e: any) {
      setAiExplanation({
        text: 'Failed to fetch AI explanation. Please select treatment based on whether this is a Canadian rollover or taxable US acquisition.',
        citations: 'ITA s. 40 / s. 85.1',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!activeTx) return;
    onConfirmTreatment(activeTx.id, selectedTreatment, {
      newShareFmvPerShare: customFmv,
      newSharesReceived: customNewQty,
      totalCashReceived: customCash,
      userNotes,
    });
  };

  if (pendingTx.length === 0) {
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
          Under CRA rules, corporate actions with mixed consideration or foreign reorganizations require taxpayer character election.
        </p>
      </div>

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
                  if (tx.corporateAction?.totalCashReceived) setCustomCash(tx.corporateAction.totalCashReceived);
                  if (tx.corporateAction?.newSharesReceived) setCustomNewQty(tx.corporateAction.newSharesReceived);
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
                <span className="text-xs font-semibold text-[#18181B]">Broker Transaction Details</span>
                <span className="text-[11px] text-[#71717A] font-mono">{activeTx.date}</span>
              </div>
              <div className="text-xs text-[#18181B] font-mono bg-white p-3 rounded-lg border border-[#E4E4E7]">
                "{activeTx.corporateAction?.brokerDescription || 'Merger / Acquisition'}"
              </div>
            </div>

            {/* AI Tax Assistant Assistance */}
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8]">
                  <Sparkles className="w-4 h-4 text-[#2563EB]" />
                  <span>AI Tax Assistant (CRA Income Tax Act Guidance)</span>
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
                    Statutory References: {aiExplanation.citations}
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
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1">Cash Consideration ($ CAD)</label>
                <input
                  type="number"
                  value={customCash}
                  onChange={(e) => setCustomCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1">New Shares Received</label>
                <input
                  type="number"
                  value={customNewQty}
                  onChange={(e) => setCustomNewQty(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#71717A] text-[10px] uppercase font-mono mb-1">New Share FMV / Unit ($ CAD)</label>
                <input
                  type="number"
                  value={customFmv}
                  onChange={(e) => setCustomFmv(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* Treatment Selector & Side-by-Side Tax Impact Preview */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#18181B]">
                Choose Canadian Tax Treatment:
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                
                {/* Choice 1: Foreign Taxable Deal */}
                <div
                  onClick={() => setSelectedTreatment('MIXED_CAPITAL_BOOT_TAXABLE')}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                    selectedTreatment === 'MIXED_CAPITAL_BOOT_TAXABLE'
                      ? 'bg-white border-[#2563EB] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] hover:bg-white hover:border-[#D4D4D8]'
                  }`}
                >
                  <div>
                    <div className="font-bold text-[#18181B] flex items-center justify-between">
                      <span>Taxable Deal (ITA s. 40)</span>
                      {selectedTreatment === 'MIXED_CAPITAL_BOOT_TAXABLE' && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
                    </div>
                    <p className="text-[11px] text-[#71717A] mt-1">
                      Standard for U.S. acquisitions. Target shares fully disposed at FMV.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#E4E4E7] text-[11px] font-mono space-y-1">
                    <div className="text-[#71717A]">Capital Gain: <strong className="text-[#059669]">{formatCad(previewTaxable.realizedCapitalGainCad)}</strong></div>
                    <div className="text-[#71717A]">New Shares ACB: <strong className="text-[#18181B]">{formatCad(previewTaxable.newSharesTotalAcbCad)}</strong></div>
                  </div>
                </div>

                {/* Choice 2: Canadian Rollover with Boot */}
                <div
                  onClick={() => setSelectedTreatment('MIXED_CAPITAL_BOOT_ROLLOVER')}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                    selectedTreatment === 'MIXED_CAPITAL_BOOT_ROLLOVER'
                      ? 'bg-white border-[#2563EB] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] hover:bg-white hover:border-[#D4D4D8]'
                  }`}
                >
                  <div>
                    <div className="font-bold text-[#18181B] flex items-center justify-between">
                      <span>Rollover with Boot (s. 85.1)</span>
                      {selectedTreatment === 'MIXED_CAPITAL_BOOT_ROLLOVER' && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
                    </div>
                    <p className="text-[11px] text-[#71717A] mt-1">
                      Canadian share exchange. Gain recognized only up to cash received.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#E4E4E7] text-[11px] font-mono space-y-1">
                    <div className="text-[#71717A]">Capital Gain: <strong className="text-[#059669]">{formatCad(previewRollover.realizedCapitalGainCad)}</strong></div>
                    <div className="text-[#71717A]">New Shares ACB: <strong className="text-[#18181B]">{formatCad(previewRollover.newSharesTotalAcbCad)}</strong></div>
                  </div>
                </div>

                {/* Choice 3: Takeover Special Dividend */}
                <div
                  onClick={() => setSelectedTreatment('MIXED_TAKEOVER_DIVIDEND')}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                    selectedTreatment === 'MIXED_TAKEOVER_DIVIDEND'
                      ? 'bg-white border-[#2563EB] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'bg-[#F9FAFB] border-[#E4E4E7] hover:bg-white hover:border-[#D4D4D8]'
                  }`}
                >
                  <div>
                    <div className="font-bold text-[#18181B] flex items-center justify-between">
                      <span>Takeover Dividend (s. 84)</span>
                      {selectedTreatment === 'MIXED_TAKEOVER_DIVIDEND' && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
                    </div>
                    <p className="text-[11px] text-[#71717A] mt-1">
                      Cash leg is a dividend (T5/reporting). Full target ACB rolls into new shares.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#E4E4E7] text-[11px] font-mono space-y-1">
                    <div className="text-[#71717A]">Dividend Income: <strong className="text-[#D97706]">{formatCad(previewDividend.dividendIncomeCad)}</strong></div>
                    <div className="text-[#71717A]">New Shares ACB: <strong className="text-[#18181B]">{formatCad(previewDividend.newSharesTotalAcbCad)}</strong></div>
                  </div>
                </div>

              </div>
            </div>

            {/* Confirm Button */}
            <div className="flex items-center justify-between border-t border-[#E4E4E7] pt-4">
              <div className="text-[11px] text-[#71717A] font-mono">
                Selected: <strong className="text-[#18181B]">{selectedTreatment}</strong>
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
