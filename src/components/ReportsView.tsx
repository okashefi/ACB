import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  HelpCircle,
  Scale,
} from 'lucide-react';
import { CalculationEngineOutput, RealizedGainLoss, SecurityRollforward } from '../types/tax';
import { formatCad, formatShares, formatRate } from '../engine/decimal';

interface ReportsViewProps {
  engineOutput: CalculationEngineOutput;
  selectedTaxYear: number | 'ALL';
  availableTaxYears: number[];
  setSelectedTaxYear: (year: number | 'ALL') => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  engineOutput,
  selectedTaxYear,
  availableTaxYears,
  setSelectedTaxYear,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'schedule3' | 'rollforward' | 'superficial' | 'distributions' | 'ibkr_diff' | 't1135'>('schedule3');

  // Filter realized gains by tax year
  const activeYear = selectedTaxYear === 'ALL' ? (availableTaxYears[0] || 2024) : selectedTaxYear;

  const realizedGainsForYear = engineOutput.realizedGainsLosses.filter((r) =>
    selectedTaxYear === 'ALL' ? true : r.taxYear === selectedTaxYear
  );

  const rollforwardsForYear = engineOutput.rollforwardsByYear.get(activeYear) || new Map<string, SecurityRollforward>();
  const rollforwardList: SecurityRollforward[] = Array.from(rollforwardsForYear.values());

  // Total summary calculations
  let totalGrossProceeds = 0;
  let totalAcbDisposed = 0;
  let totalSellingOutlays = 0;
  let totalRawGainLoss = 0;
  let totalSuperficialLossDenied = 0;
  let totalRecognizedCapitalGain = 0;
  let totalRecognizedCapitalLoss = 0;

  realizedGainsForYear.forEach((r) => {
    totalGrossProceeds += r.grossProceedsCad;
    totalAcbDisposed += r.acbOfUnitsDisposedCad;
    totalSellingOutlays += r.dispositionOutlaysCad;
    totalRawGainLoss += r.rawGainLossCad;
    totalSuperficialLossDenied += r.superficialLossDeniedCad;
    if (r.recognizedGainLossCad > 0) totalRecognizedCapitalGain += r.recognizedGainLossCad;
    else if (r.recognizedGainLossCad < 0) totalRecognizedCapitalLoss += Math.abs(r.recognizedGainLossCad);
  });

  const netTaxableCapitalGain = totalRecognizedCapitalGain - totalRecognizedCapitalLoss;
  // Dated inclusion rate calculation (e.g. 50%)
  const inclusionRate = 0.50;
  const taxableNetGain = Math.max(0, netTaxableCapitalGain * inclusionRate);

  // Export Schedule 3 CSV
  const handleExportSchedule3Csv = () => {
    const headers = ['Tax Year', 'Date', 'Symbol', 'Security Name', 'Asset Class', 'Qty Disposed', 'Gross Proceeds (CAD)', 'Outlays/Comm (CAD)', 'ACB Disposed (CAD)', 'Raw Gain/Loss (CAD)', 'Superficial Denied (CAD)', 'Recognized Gain/Loss (CAD)', 'Statutory Rules'];
    const rows = realizedGainsForYear.map((r) => [
      r.taxYear,
      r.dispositionDate,
      r.symbol,
      `"${r.securityName.replace(/"/g, '""')}"`,
      r.assetClass,
      r.quantityDisposed,
      r.grossProceedsCad,
      r.dispositionOutlaysCad,
      r.acbOfUnitsDisposedCad,
      r.rawGainLossCad,
      r.superficialLossDeniedCad,
      r.recognizedGainLossCad,
      `"${r.statutoryCitations.join('; ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Schedule_3_Capital_Gains_${selectedTaxYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="reports-view-container" className="space-y-6">
      
      {/* Top Header & Year Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2563EB]" />
            <span>Canadian Tax Audit Reports & Schedule 3</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            CPA audit-ready statements and rollforwards prepared under the <em>Income Tax Act</em> (Canada).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-export-schedule3-csv"
            onClick={handleExportSchedule3Csv}
            className="px-3.5 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Schedule 3 (CSV)</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation for Reports */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#E4E4E7] pb-2 text-xs">
        {[
          { id: 'schedule3', label: 'Schedule 3 Realized Gains/Losses' },
          { id: 'rollforward', label: 'ACB Rollforward by Security' },
          { id: 'superficial', label: 'Superficial Losses Denied' },
          { id: 'distributions', label: 'Dividends & ROC Summary' },
          { id: 'ibkr_diff', label: 'IBKR vs Canadian ACB Diff' },
          { id: 't1135', label: 'T1135 Foreign Property Cost' },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`report-tab-${tab.id}`}
            onClick={() => setActiveReportTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap font-medium transition-colors ${
              activeReportTab === tab.id
                ? 'bg-[#18181B] text-white shadow-xs'
                : 'text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Schedule 3 Realized Gains / Losses Statement */}
      {activeReportTab === 'schedule3' && (
        <div className="space-y-6">
          
          {/* Summary Box */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
            <div>
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Gross Proceeds</div>
              <div className="text-base font-bold text-[#18181B] mt-1">{formatCad(totalGrossProceeds)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Cost Base (ACB)</div>
              <div className="text-base font-bold text-[#18181B] mt-1">{formatCad(totalAcbDisposed)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Superficial Loss Denied</div>
              <div className="text-base font-bold text-[#7C3AED] mt-1">{formatCad(totalSuperficialLossDenied)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Net Capital Gain / (Loss)</div>
              <div className={`text-base font-bold mt-1 ${netTaxableCapitalGain >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {formatCad(netTaxableCapitalGain)}
              </div>
              <div className="text-[10px] text-[#71717A] font-sans mt-0.5">
                50% Inclusion: {formatCad(taxableNetGain)}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono font-semibold">
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3.5">Security</th>
                    <th className="py-3 px-3.5 text-right">Units</th>
                    <th className="py-3 px-3.5 text-right">Proceeds (CAD)</th>
                    <th className="py-3 px-3.5 text-right">Selling Comm (CAD)</th>
                    <th className="py-3 px-3.5 text-right">ACB Disposed (CAD)</th>
                    <th className="py-3 px-3.5 text-right">Superficial Denied</th>
                    <th className="py-3 px-3.5 text-right">Recognized Gain/(Loss)</th>
                    <th className="py-3 px-3.5 text-center">Statutory Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {realizedGainsForYear.map((r) => {
                    const isGain = r.recognizedGainLossCad >= 0;
                    return (
                      <tr key={r.id} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 px-3.5 text-[#18181B] whitespace-nowrap">{r.dispositionDate}</td>
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-[#18181B]">{r.symbol}</div>
                          <div className="text-[10px] text-[#71717A] font-sans truncate max-w-[140px]">{r.securityName}</div>
                        </td>
                        <td className="py-3 px-3.5 text-right text-[#18181B]">{formatShares(r.quantityDisposed)}</td>
                        <td className="py-3 px-3.5 text-right text-[#18181B]">{formatCad(r.grossProceedsCad)}</td>
                        <td className="py-3 px-3.5 text-right text-[#71717A]">{formatCad(r.dispositionOutlaysCad)}</td>
                        <td className="py-3 px-3.5 text-right text-[#71717A]">{formatCad(r.acbOfUnitsDisposedCad)}</td>
                        <td className="py-3 px-3.5 text-right text-[#7C3AED]">
                          {r.superficialLossDeniedCad > 0 ? formatCad(r.superficialLossDeniedCad) : '—'}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-bold ${isGain ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                          {isGain ? `+${formatCad(r.recognizedGainLossCad)}` : formatCad(r.recognizedGainLossCad)}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] text-[10px] border border-[#BFDBFE]" title={r.explanation}>
                            {r.statutoryCitations[0] || 'ITA s. 40(1)'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {realizedGainsForYear.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No realized dispositions found for the selected tax year.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* 2. ACB Rollforward by Security */}
      {activeReportTab === 'rollforward' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono font-semibold">
                    <th className="py-3 px-3.5">Security</th>
                    <th className="py-3 px-3.5 text-right">Opening Qty</th>
                    <th className="py-3 px-3.5 text-right">Opening ACB</th>
                    <th className="py-3 px-3.5 text-right">Adds (Qty)</th>
                    <th className="py-3 px-3.5 text-right">Adds (Cost CAD)</th>
                    <th className="py-3 px-3.5 text-right">Disposals (Qty)</th>
                    <th className="py-3 px-3.5 text-right">Disposals (ACB CAD)</th>
                    <th className="py-3 px-3.5 text-right">ROC Reductions</th>
                    <th className="py-3 px-3.5 text-right">Closing Qty</th>
                    <th className="py-3 px-3.5 text-right">Closing ACB (CAD)</th>
                    <th className="py-3 px-3.5 text-right">Closing ACB/Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {rollforwardList.map((rf) => (
                    <tr key={rf.securityId} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-[#18181B]">{rf.symbol}</div>
                        <div className="text-[10px] text-[#71717A] font-sans truncate max-w-[140px]">{rf.name}</div>
                      </td>
                      <td className="py-3 px-3.5 text-right text-[#71717A]">{formatShares(rf.openingQuantity)}</td>
                      <td className="py-3 px-3.5 text-right text-[#71717A]">{formatCad(rf.openingAcbCad)}</td>
                      <td className="py-3 px-3.5 text-right text-[#059669]">+{formatShares(rf.acquisitionsQuantity)}</td>
                      <td className="py-3 px-3.5 text-right text-[#059669]">+{formatCad(rf.acquisitionsCostCad)}</td>
                      <td className="py-3 px-3.5 text-right text-[#DC2626]">-{formatShares(rf.dispositionsQuantity)}</td>
                      <td className="py-3 px-3.5 text-right text-[#DC2626]">-{formatCad(rf.dispositionsAcbRemovedCad)}</td>
                      <td className="py-3 px-3.5 text-right text-[#D97706]">
                        {rf.rocAdjustmentsCad > 0 ? `-${formatCad(rf.rocAdjustmentsCad)}` : '—'}
                      </td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#18181B]">{formatShares(rf.closingQuantity)}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#059669]">{formatCad(rf.closingTotalAcbCad)}</td>
                      <td className="py-3 px-3.5 text-right text-[#18181B]">{formatCad(rf.closingAcbPerUnitCad)}</td>
                    </tr>
                  ))}
                  {rollforwardList.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No rollforward activity for tax year {activeYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Superficial Loss Denied Register */}
      {activeReportTab === 'superficial' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#18181B]">Superficial Loss Denials (ITA s. 54 & s. 40(2)(g)(i))</h3>
              <p className="text-xs text-[#71717A] mt-0.5">
                Audit trail of capital losses denied under the 61-day window rule (-30 to +30 days) and tracked into replacement ACB.
              </p>
            </div>

            <div className="space-y-3">
              {engineOutput.superficialLosses.map((sl, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-[#7C3AED] text-sm">{sl.symbol}</span>
                    <span className="text-[#71717A]">Sold: {sl.dispositionDate}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono bg-white p-3 rounded-xl border border-[#E4E4E7] text-[11px]">
                    <div>Raw Capital Loss: <span className="text-[#DC2626]">-${formatCad(sl.rawCapitalLossCad)}</span></div>
                    <div>Denied Loss (Added to ACB): <span className="text-[#7C3AED] font-bold">{formatCad(sl.deniedLossCad)}</span></div>
                    <div>Recognized on Sched 3: <span className="text-[#18181B]">{formatCad(sl.allowedLossCad)}</span></div>
                  </div>
                  <p className="text-[11px] text-[#71717A] font-sans leading-relaxed">
                    {sl.explanation}
                  </p>
                </div>
              ))}

              {engineOutput.superficialLosses.length === 0 && (
                <div className="py-12 text-center text-[#71717A] text-xs">
                  No superficial loss denials detected in the portfolio.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Dividends & ROC Summary */}
      {activeReportTab === 'distributions' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-[#18181B]">Distributions & Income Summary (CAD)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="p-5 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7]">
                <div className="text-xs text-[#71717A] font-sans font-medium">Total Dividends (T5 / Foreign)</div>
                <div className="text-lg font-bold text-[#059669] mt-1">{formatCad(engineOutput.incomeDistributions.dividendsCad)}</div>
                <p className="text-[10px] text-[#A1A1AA] font-sans mt-1">Taxable dividend income (Does not alter share ACB)</p>
              </div>
              <div className="p-5 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7]">
                <div className="text-xs text-[#71717A] font-sans font-medium">Return of Capital (ROC)</div>
                <div className="text-lg font-bold text-[#D97706] mt-1">{formatCad(engineOutput.incomeDistributions.rocCad)}</div>
                <p className="text-[10px] text-[#A1A1AA] font-sans mt-1">Directly reduces security total ACB under ITA s. 53(2)(a)</p>
              </div>
              <div className="p-5 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7]">
                <div className="text-xs text-[#71717A] font-sans font-medium">Foreign Withholding Tax (FTC)</div>
                <div className="text-lg font-bold text-[#2563EB] mt-1">{formatCad(engineOutput.incomeDistributions.withholdingTaxCad)}</div>
                <p className="text-[10px] text-[#A1A1AA] font-sans mt-1">Eligible for Federal Foreign Tax Credit (T2209 / T2036)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. IBKR vs Canadian ACB Diff Reconciliation Report */}
      {activeReportTab === 'ibkr_diff' && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-[#18181B] font-bold text-sm">
            <Scale className="w-5 h-5 text-[#2563EB]" />
            <span>Why IBKR Realized P&L Differs from Canadian Schedule 3 Numbers</span>
          </div>

          <p className="text-xs text-[#71717A] leading-relaxed">
            IBKR Activity Statements report U.S. tax lot matching (FIFO / Specific ID) in original currency (e.g. USD). Canadian tax law requires:
          </p>

          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] space-y-1">
              <div className="font-bold text-[#059669]">1. Weighted Average Cost Pool (ITA s. 47) vs IBKR FIFO</div>
              <p className="text-[#71717A] text-[11px]">
                Canada strictly forbids specific share lot matching. Every buy joins a single pooled average cost for that identical property class.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] space-y-1">
              <div className="font-bold text-[#2563EB]">2. Embedded Foreign Exchange (ITA s. 261)</div>
              <p className="text-[#71717A] text-[11px]">
                IBKR calculates gain in USD, then converts at settlement. CRA requires converting acquisition cost at buy-date Bank of Canada rate and proceeds at sell-date rate, embedding currency movements into the capital gain.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] space-y-1">
              <div className="font-bold text-[#7C3AED]">3. Superficial Loss Denials (ITA s. 54) vs U.S. Wash Sales</div>
              <p className="text-[#71717A] text-[11px]">
                IBKR statements do not apply Canadian 30-day superficial loss rules, affiliate account checks, or registered TFSA/RRSP permanent denial rules.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6. T1135 Foreign Property Cost Tracker */}
      {activeReportTab === 't1135' && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-[#18181B] font-bold text-sm">
            <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
            <span>Form T1135 Specified Foreign Property Assistant</span>
          </div>

          <p className="text-xs text-[#71717A] leading-relaxed">
            If total cost amount of specified foreign property (e.g. U.S. stocks such as AAPL, NVDA) exceeded <strong>$100,000 CAD</strong> at any time in the year, you must file CRA Form T1135.
          </p>

          <div className="bg-[#F9FAFB] p-5 rounded-xl border border-[#E4E4E7] text-xs font-mono space-y-2">
            <div className="text-[#71717A]">Total U.S. / Foreign Property Cost Base (CAD):</div>
            <div className="text-xl font-bold text-[#059669]">
              {formatCad(
                (Array.from(engineOutput.securityBalances.values()) as Array<{ symbol: string; totalAcbCad: number }>)
                  .filter((b) => !b.symbol.endsWith('.TO') && !b.symbol.endsWith('.V'))
                  .reduce((acc, b) => acc + b.totalAcbCad, 0)
              )}
            </div>
            <p className="text-[10px] text-[#A1A1AA] font-sans">
              Calculated using Bank of Canada historical cost in CAD. Does not constitute a completed T1135 return.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
