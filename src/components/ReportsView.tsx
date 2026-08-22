import React, { useState, useMemo } from 'react';
import {
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
  Scale,
  ShieldCheck,
  Percent,
  TrendingUp,
  FileText,
  DollarSign,
  Info,
  Clock,
  History,
  Link as LinkIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  CalculationEngineOutput,
  SecurityRollforward,
  RealizedGainLoss,
  SuperficialLossEvent,
} from '../types/tax';
import { formatCad, formatShares, formatRate, d, toMoney } from '../engine/decimal';

interface ReportsViewProps {
  engineOutput: CalculationEngineOutput;
  selectedTaxYear: number | 'ALL';
  availableTaxYears: number[];
  setSelectedTaxYear: (year: number | 'ALL') => void;
}

type ReportTab =
  | 'rollforward'
  | 'schedule3'
  | 'superficial'
  | 'dividends'
  | 'schedule3_csv'
  | 'ibkr_diff'
  | 'provenance';

export const ReportsView: React.FC<ReportsViewProps> = ({
  engineOutput,
  selectedTaxYear,
  availableTaxYears,
  setSelectedTaxYear,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('rollforward');
  const [selectedAuditItem, setSelectedAuditItem] = useState<{ id: string; rule: string; details: string } | null>(null);

  // Active Tax Year integer
  const activeYearInt = typeof selectedTaxYear === 'number' ? selectedTaxYear : availableTaxYears[0] || 2024;

  // 1. Rollforward Data for selected tax year
  const rollforwardList = useMemo<SecurityRollforward[]>(() => {
    const yearMap = engineOutput.rollforwardsByYear.get(activeYearInt);
    if (!yearMap) return [];
    const list: SecurityRollforward[] = Array.from(yearMap.values()) as SecurityRollforward[];
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [engineOutput.rollforwardsByYear, activeYearInt]);

  // 2. Realized Gains / Schedule 3 dispositions for selected tax year
  const filteredRealizedGains = useMemo<RealizedGainLoss[]>(() => {
    return engineOutput.realizedGainsLosses.filter((g) => {
      if (selectedTaxYear === 'ALL') return true;
      return g.taxYear === selectedTaxYear;
    });
  }, [engineOutput.realizedGainsLosses, selectedTaxYear]);

  // Totals for Schedule 3
  const schedule3Totals = useMemo(() => {
    let grossProceeds = d(0);
    let outlays = d(0);
    let acbRemoved = d(0);
    let recognized = d(0);

    filteredRealizedGains.forEach((g) => {
      grossProceeds = grossProceeds.plus(d(g.grossProceedsCad));
      outlays = outlays.plus(d(g.dispositionOutlaysCad));
      acbRemoved = acbRemoved.plus(d(g.acbOfUnitsDisposedCad));
      recognized = recognized.plus(d(g.recognizedGainLossCad));
    });

    return {
      grossProceeds: grossProceeds.toString(),
      outlays: outlays.toString(),
      acbRemoved: acbRemoved.toString(),
      recognized: recognized.toString(),
      recognizedIsPos: recognized.gte(0),
    };
  }, [filteredRealizedGains]);

  // 3. Superficial Losses
  const superficialLossesList = useMemo<SuperficialLossEvent[]>(() => {
    return engineOutput.superficialLosses;
  }, [engineOutput.superficialLosses]);

  // Export Schedule 3 CSV
  const handleExportSchedule3Csv = () => {
    const headers = [
      'Transaction ID',
      'Tax Year',
      'Disposition Date',
      'Security / Fund Name',
      'Symbol',
      'Quantity Disposed',
      'Proceeds of Disposition (CAD)',
      'Adjusted Cost Base (ACB) (CAD)',
      'Outlays and Expenses (Commissions) (CAD)',
      'Superficial Loss Denied (CAD)',
      'Recognized Capital Gain / (Loss) (CAD)',
      'Statutory Rule Citations',
    ];

    const rows = filteredRealizedGains.map((g) => [
      g.dispositionTransactionId,
      g.taxYear,
      g.dispositionDate,
      `"${g.securityName.replace(/"/g, '""')}"`,
      g.symbol,
      formatShares(g.quantityDisposed),
      toMoney(g.grossProceedsCad),
      toMoney(g.acbOfUnitsDisposedCad),
      toMoney(g.dispositionOutlaysCad),
      toMoney(g.superficialLossDeniedCad),
      toMoney(g.recognizedGainLossCad),
      `"${g.statutoryCitations.join('; ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [
      '# GOVERNMENT OF CANADA - CRA SCHEDULE 3 CAPITAL GAINS (SECTION 3: PUBLIC SHARES & MUTUAL FUNDS)',
      `# Tax Year: ${selectedTaxYear} | Currency: Canadian Dollars (CAD) | Converted via Bank of Canada Daily Rates`,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      `TOTALS,,,,,"${toMoney(schedule3Totals.grossProceeds)}","${toMoney(schedule3Totals.acbRemoved)}","${toMoney(schedule3Totals.outlays)}",,"${toMoney(schedule3Totals.recognized)}"`,
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CRA_Schedule_3_Capital_Gains_${selectedTaxYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="reports-view-container" className="space-y-6">
      
      {/* Top Header & Tax Year Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#2563EB]" />
            <span>Canadian Tax Reports & Schedule 3 Schedules</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            Compliant with the Income Tax Act (Canada), Form T1 Schedule 3, Form T1135, and CRA Information Circulars.
          </p>
        </div>

        {/* Year Select & Export button */}
        <div className="flex items-center gap-2">
          <select
            id="reports-year-select"
            value={selectedTaxYear}
            onChange={(e) => setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))}
            className="bg-white text-[#18181B] text-xs font-semibold rounded-xl px-3 py-2 border border-[#E4E4E7] focus:outline-none focus:border-[#3B82F6] cursor-pointer shadow-2xs font-mono"
          >
            <option value="ALL">All Tax Years</option>
            {availableTaxYears.map((yr) => (
              <option key={yr} value={yr}>
                Tax Year {yr}
              </option>
            ))}
          </select>

          <button
            id="btn-export-schedule3-csv"
            onClick={handleExportSchedule3Csv}
            className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-2xs"
          >
            <Download className="w-4 h-4" />
            <span>Download Schedule 3 CSV</span>
          </button>
        </div>
      </div>

      {/* CPA Mandatory Disclaimer Banner */}
      <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl flex items-start gap-3 shadow-2xs text-xs text-[#475569]">
        <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-[#0F172A] text-xs">
            Chartered Professional Accountant (CPA) Audit & Verification Notice
          </div>
          <p className="text-[11px] leading-relaxed text-[#64748B]">
            All calculations in this report represent adjusted cost bases, proceeds of disposition, and capital gains calculated strictly in Canadian Dollars (CAD) using Bank of Canada daily foreign exchange rates under <strong>ITA s. 261</strong> and average cost pooling under <strong>ITA s. 47(1)</strong>. These schedules are designed for Canadian tax filing preparation and should be reviewed by a qualified CPA prior to submission to the Canada Revenue Agency (CRA).
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E4E4E7] overflow-x-auto pb-px text-xs font-medium">
        <button
          onClick={() => setActiveReportTab('rollforward')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'rollforward'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>1. ACB Rollforward by Security</span>
        </button>

        <button
          onClick={() => setActiveReportTab('schedule3')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'schedule3'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>2. Realized Capital Gains (Schedule 3)</span>
        </button>

        <button
          onClick={() => setActiveReportTab('superficial')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'superficial'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>3. Superficial Losses Denied</span>
        </button>

        <button
          onClick={() => setActiveReportTab('dividends')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'dividends'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>4. Dividend & ROC Summary</span>
        </button>

        <button
          onClick={() => setActiveReportTab('ibkr_diff')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'ibkr_diff'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>5. IBKR P&L Diff Reconciliation</span>
        </button>

        <button
          onClick={() => setActiveReportTab('provenance')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'provenance'
              ? 'border-[#2563EB] text-[#2563EB] bg-white font-semibold'
              : 'border-transparent text-[#71717A] hover:text-[#18181B]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>6. Sync & Data Provenance</span>
        </button>
      </div>

      {/* TAB 1: ACB Rollforward by Security */}
      {activeReportTab === 'rollforward' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#71717A]">
              Tax Year <strong>{activeYearInt}</strong> • Showing annual continuity for <strong>{rollforwardList.length} securities</strong>
            </span>
            <span className="text-[11px] text-[#A1A1AA] font-mono">
              Opening ACB + Acquisitions - Dispositions - ROC + Superficial Losses = Closing ACB
            </span>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono">
                    <th className="py-3 px-3 font-semibold">Security</th>
                    <th className="py-3 px-3 font-semibold text-right">Opening Qty</th>
                    <th className="py-3 px-3 font-semibold text-right">Opening ACB (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Acquisitions (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Dispositions ACB (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">ROC Reductions</th>
                    <th className="py-3 px-3 font-semibold text-right">Superficial Add-Backs</th>
                    <th className="py-3 px-3 font-semibold text-right">Closing Qty</th>
                    <th className="py-3 px-3 font-semibold text-right">Closing Total ACB</th>
                    <th className="py-3 px-3 font-semibold text-right">Closing ACB / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {rollforwardList.map((rf) => (
                    <tr
                      key={rf.securityId}
                      onClick={() => setSelectedAuditItem({
                        id: rf.symbol,
                        rule: 'ITA s. 47(1) Identical Property Rollforward',
                        details: `Opening ACB: ${formatCad(rf.openingAcbCad)} | Acquisitions: ${formatCad(rf.acquisitionsCostCad)} | Dispositions ACB removed: ${formatCad(rf.dispositionsAcbRemovedCad)} | Closing Total ACB: ${formatCad(rf.closingTotalAcbCad)} across ${formatShares(rf.closingQuantity)} units.`
                      })}
                      className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 font-bold text-[#18181B]">
                        <div>{rf.symbol}</div>
                        <div className="text-[10px] font-normal text-[#71717A] font-sans truncate max-w-[120px]">{rf.name}</div>
                      </td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatShares(rf.openingQuantity)}</td>
                      <td className="py-3 px-3 text-right font-medium text-[#18181B]">{formatCad(rf.openingAcbCad)}</td>
                      <td className="py-3 px-3 text-right text-[#059669]">+{formatCad(rf.acquisitionsCostCad)}</td>
                      <td className="py-3 px-3 text-right text-[#DC2626]">-{formatCad(rf.dispositionsAcbRemovedCad)}</td>
                      <td className="py-3 px-3 text-right text-[#D97706]">{d(rf.rocAdjustmentsCad).gt(0) ? `-${formatCad(rf.rocAdjustmentsCad)}` : '—'}</td>
                      <td className="py-3 px-3 text-right text-[#7C3AED]">{d(rf.superficialLossAdditionsCad).gt(0) ? `+${formatCad(rf.superficialLossAdditionsCad)}` : '—'}</td>
                      <td className="py-3 px-3 text-right font-bold text-[#18181B]">{formatShares(rf.closingQuantity)}</td>
                      <td className="py-3 px-3 text-right font-bold text-[#059669]">{formatCad(rf.closingTotalAcbCad)}</td>
                      <td className="py-3 px-3 text-right text-[#18181B] font-semibold">{formatCad(rf.closingAcbPerUnitCad)}</td>
                    </tr>
                  ))}

                  {rollforwardList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No rollforward positions recorded for tax year {activeYearInt}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Realized Capital Gains (Schedule 3) */}
      {activeReportTab === 'schedule3' && (
        <div className="space-y-4">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Proceeds of Disposition</div>
              <div className="text-base font-bold text-[#18181B] mt-1">{formatCad(schedule3Totals.grossProceeds)}</div>
            </div>

            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Adjusted Cost Base (ACB)</div>
              <div className="text-base font-bold text-[#18181B] mt-1">{formatCad(schedule3Totals.acbRemoved)}</div>
            </div>

            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Outlays & Expenses (Commissions)</div>
              <div className="text-base font-bold text-[#71717A] mt-1">{formatCad(schedule3Totals.outlays)}</div>
            </div>

            <div className="p-4 bg-white border border-[#BFDBFE] rounded-2xl shadow-2xs bg-[#EFF6FF]">
              <div className="text-[10px] text-[#1D4ED8] uppercase font-sans font-semibold">Schedule 3 Net Capital Gain / (Loss)</div>
              <div className={`text-base font-bold mt-1 ${schedule3Totals.recognizedIsPos ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {schedule3Totals.recognizedIsPos ? `+${formatCad(schedule3Totals.recognized)}` : formatCad(schedule3Totals.recognized)}
              </div>
            </div>
          </div>

          {/* Schedule 3 Table */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono">
                    <th className="py-3 px-3 font-semibold">Tx ID / Date</th>
                    <th className="py-3 px-3 font-semibold">Security Disposed</th>
                    <th className="py-3 px-3 font-semibold text-right">Units</th>
                    <th className="py-3 px-3 font-semibold text-right">Proceeds of Disposition</th>
                    <th className="py-3 px-3 font-semibold text-right">Adjusted Cost Base</th>
                    <th className="py-3 px-3 font-semibold text-right">Outlays (Fees)</th>
                    <th className="py-3 px-3 font-semibold text-right">Superficial Denied</th>
                    <th className="py-3 px-3 font-semibold text-right">Recognized Gain / (Loss)</th>
                    <th className="py-3 px-3 font-semibold text-center">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {filteredRealizedGains.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedAuditItem({
                        id: g.dispositionTransactionId,
                        rule: g.statutoryCitations.join(', '),
                        details: `${g.symbol} disposed on ${g.dispositionDate}. Proceeds: ${formatCad(g.grossProceedsCad)}, ACB: ${formatCad(g.acbOfUnitsDisposedCad)}, Outlays: ${formatCad(g.dispositionOutlaysCad)}. Recognized: ${formatCad(g.recognizedGainLossCad)} CAD.`
                      })}
                      className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="text-[#18181B] font-medium">{g.dispositionDate}</div>
                        <div className="text-[9px] text-[#A1A1AA] font-mono">{g.dispositionTransactionId}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-[#18181B]">{g.symbol}</span>
                        <div className="text-[10px] text-[#71717A] font-sans truncate max-w-[120px]">{g.securityName}</div>
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B]">{formatShares(g.quantityDisposed)}</td>
                      <td className="py-3 px-3 text-right font-medium text-[#18181B]">{formatCad(g.grossProceedsCad)}</td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatCad(g.acbOfUnitsDisposedCad)}</td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatCad(g.dispositionOutlaysCad)}</td>
                      <td className="py-3 px-3 text-right">
                        {d(g.superficialLossDeniedCad).gt(0) ? (
                          <span className="text-[#7C3AED] font-semibold">+{formatCad(g.superficialLossDeniedCad)}</span>
                        ) : (
                          <span className="text-[#D4D4D8]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        <span className={d(g.recognizedGainLossCad).gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'}>
                          {d(g.recognizedGainLossCad).gte(0) ? `+${formatCad(g.recognizedGainLossCad)}` : formatCad(g.recognizedGainLossCad)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] text-[10px] border border-[#BFDBFE]">
                          {g.statutoryCitations[0] || 'ITA s. 40'}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {filteredRealizedGains.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No realized dispositions recorded for tax year {selectedTaxYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Superficial Losses Denied Register */}
      {activeReportTab === 'superficial' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#F5F3FF] border border-[#DDD6FE] rounded-2xl text-xs text-[#5B21B6] space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[#7C3AED]" />
              <span>Income Tax Act (Canada) ss. 40(2)(g)(i) & 54 Superficial Loss Rules</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#6D28D9]">
              A capital loss is deemed superficial and denied if identical property is acquired within the 61-day window (-30 days to +30 days of disposition) by the taxpayer or an affiliated person (including spouse, TFSA, or RRSP) and held at the end of the period. Denied losses are added back to the ACB of the replacement property under <strong>ITA s. 53(1)(f)</strong>.
            </p>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono">
                    <th className="py-3 px-3 font-semibold">Disposing Tx ID</th>
                    <th className="py-3 px-3 font-semibold">Security</th>
                    <th className="py-3 px-3 font-semibold">Sale Date</th>
                    <th className="py-3 px-3 font-semibold text-right">Raw Capital Loss</th>
                    <th className="py-3 px-3 font-semibold text-right">Denied Superficial Amount</th>
                    <th className="py-3 px-3 font-semibold text-right">Allowed Schedule 3 Loss</th>
                    <th className="py-3 px-3 font-semibold">Replacement Trade Link</th>
                    <th className="py-3 px-3 font-semibold">CRA Statutory Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {superficialLossesList.map((sl, idx) => (
                    <tr
                      key={idx}
                      onClick={() => setSelectedAuditItem({
                        id: sl.dispositionTransactionId,
                        rule: 'ITA ss. 40(2)(g)(i) / 53(1)(f) Superficial Loss',
                        details: sl.explanation
                      })}
                      className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-[#18181B] font-mono font-medium">{sl.dispositionTransactionId}</td>
                      <td className="py-3 px-3 font-bold text-[#18181B]">{sl.symbol}</td>
                      <td className="py-3 px-3 text-[#71717A]">{sl.dispositionDate}</td>
                      <td className="py-3 px-3 text-right text-[#DC2626]">-{formatCad(sl.rawCapitalLossCad)}</td>
                      <td className="py-3 px-3 text-right text-[#7C3AED] font-bold">+{formatCad(sl.deniedLossCad)}</td>
                      <td className="py-3 px-3 text-right text-[#DC2626] font-semibold">{sl.allowedLossCad > 0 ? `-${formatCad(sl.allowedLossCad)}` : '$0.00'}</td>
                      <td className="py-3 px-3 text-[#71717A] text-[11px] font-sans">
                        {sl.replacementTransactionId ? (
                          <div className="flex items-center gap-1 text-[#2563EB]">
                            <LinkIcon className="w-3 h-3" />
                            <span className="font-mono">{sl.replacementTransactionId}</span>
                            <span className="text-[10px]">({sl.replacementDate})</span>
                          </div>
                        ) : (
                          <span className="text-[#A1A1AA]">61-Day Overlap Pool</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          sl.isPermanentlyDeniedInRegistered
                            ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                            : 'bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]'
                        }`}>
                          {sl.isPermanentlyDeniedInRegistered ? 'Permanently Denied (TFSA/RRSP)' : 'Added to Replacement ACB'}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {superficialLossesList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No superficial losses detected in this portfolio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Dividend & Return of Capital (ROC) Summary */}
      {activeReportTab === 'dividends' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Dividends Received (CAD)</div>
              <div className="text-base font-bold text-[#18181B] mt-1">{formatCad(engineOutput.incomeDistributions.dividendsCad)}</div>
              <p className="text-[10px] text-[#71717A] font-sans mt-1">Reportable on T1 Line 12000 / 12100</p>
            </div>

            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Return of Capital (ROC)</div>
              <div className="text-base font-bold text-[#D97706] mt-1">{formatCad(engineOutput.incomeDistributions.rocCad)}</div>
              <p className="text-[10px] text-[#71717A] font-sans mt-1">Directly reduced ACB under ITA s. 53(2)(a)</p>
            </div>

            <div className="p-4 bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Foreign Withholding Taxes (CAD)</div>
              <div className="text-base font-bold text-[#71717A] mt-1">{formatCad(engineOutput.incomeDistributions.withholdingTaxCad)}</div>
              <p className="text-[10px] text-[#71717A] font-sans mt-1">Foreign Tax Credit (Form T2209 / T2036)</p>
            </div>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-3 text-xs">
            <h3 className="font-bold text-sm text-[#18181B]">CRA Income Tax Reporting Guidelines for Distributions</h3>
            <ul className="space-y-2 text-[#71717A] list-disc pl-5 text-[11px] leading-relaxed">
              <li>
                <strong>Eligible vs Non-Eligible Canadian Dividends:</strong> Box 49 and 50 of Form T5 dictate gross-up factors (38% for eligible) and Dividend Tax Credits.
              </li>
              <li>
                <strong>Return of Capital (ROC):</strong> Box 42 of Form T3 reduces the adjusted cost base of the trust/ETF units. If cumulative ROC exceeds the total cost base, the negative balance is triggered as an immediate capital gain under <strong>ITA s. 40(3)</strong>.
              </li>
              <li>
                <strong>Foreign Non-Business Income Tax:</strong> Converted to CAD on transaction date for calculation of foreign tax credits.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 5: IBKR P&L Diff Reconciliation */}
      {activeReportTab === 'ibkr_diff' && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-6 text-xs">
          <div>
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#2563EB]" />
              <span>Reconciliation: Canadian ACB vs IBKR Activity Statement P&L</span>
            </h3>
            <p className="text-xs text-[#71717A] mt-1">
              Why IBKR 1042-S / Annual Activity P&L numbers differ systematically from your CRA tax return:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-2">
              <div className="font-bold text-xs text-[#18181B]">1. Cost Method: Average Cost vs FIFO</div>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                IBKR defaults to First-In, First-Out (FIFO) or LIFO in USD. Canada’s Income Tax Act <strong>s. 47(1)</strong> strictly mandates a single weighted average cost pool across all non-registered accounts.
              </p>
            </div>

            <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-2">
              <div className="font-bold text-xs text-[#18181B]">2. Foreign Exchange Timing (ITA s. 261)</div>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                IBKR calculates gain in USD, then converts at current rate. CRA requires converting acquisition cost at the historical Bank of Canada trade date rate and disposition proceeds at the disposition date rate, capturing embedded FX gain/loss.
              </p>
            </div>

            <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-2">
              <div className="font-bold text-xs text-[#18181B]">3. Superficial Loss Add-Backs (ITA s. 54)</div>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                U.S. Wash Sale rules differ from Canadian Superficial Loss rules (61-day window across all affiliated accounts and registered plans).
              </p>
            </div>

            <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-2">
              <div className="font-bold text-xs text-[#18181B]">4. Option Exercise Integration (ITA s. 49)</div>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                Option premiums on exercise are automatically merged into the cost base or sale proceeds of the underlying shares, rather than reported as standalone closed derivative trades.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* TAB 6: Sync & Data Provenance */}
      {activeReportTab === 'provenance' && (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
              <History className="w-4 h-4 text-[#2563EB]" />
              <span>Data Provenance & Audit Trail</span>
            </h3>
            <p className="text-xs text-[#71717A] mt-1">
              Cryptographic and timestamped ledger of external statements ingested by the calculation engine.
            </p>
          </div>

          <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-3 font-mono">
            <div className="flex justify-between items-center border-b border-[#E4E4E7] pb-2">
              <span className="text-[#71717A] font-sans">Engine Specification:</span>
              <span className="font-bold text-[#18181B]">Canadian ACB Engine v2.4 (ITA 2024 Amendments)</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#E4E4E7] pb-2">
              <span className="text-[#71717A] font-sans">BoC FX Data Source:</span>
              <span className="text-[#059669] font-bold">Bank of Canada Valet API (Daily CAD Rates)</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#E4E4E7] pb-2">
              <span className="text-[#71717A] font-sans">Total Ledger Event Entries:</span>
              <span className="font-bold text-[#18181B]">{engineOutput.ledger.length} events</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#71717A] font-sans">Realized Gain/Loss Entries:</span>
              <span className="font-bold text-[#18181B]">{engineOutput.realizedGainsLosses.length} dispositions</span>
            </div>
          </div>
        </div>
      )}

      {/* Audit Item Details Drawer */}
      {selectedAuditItem && (
        <div className="fixed inset-0 z-50 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 text-[#18181B]">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                <h3 className="font-bold text-sm text-[#18181B]">CRA Audit Rule Citation</h3>
              </div>
              <button
                onClick={() => setSelectedAuditItem(null)}
                className="text-[#71717A] hover:text-[#18181B] text-xs px-2.5 py-1 bg-[#F4F4F5] hover:bg-[#E4E4E7] rounded-lg transition-colors"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-bold text-sm text-[#18181B]">{selectedAuditItem.id}</div>
              <div className="px-2.5 py-1 bg-[#EFF6FF] text-[#2563EB] font-mono text-[11px] rounded-lg border border-[#BFDBFE]">
                {selectedAuditItem.rule}
              </div>
              <p className="text-[11px] text-[#71717A] bg-[#F9FAFB] p-3 rounded-xl border border-[#E4E4E7] leading-relaxed">
                {selectedAuditItem.details}
              </p>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedAuditItem(null)}
                className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
