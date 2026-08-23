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
  Upload,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import {
  CalculationEngineOutput,
  SecurityRollforward,
  RealizedGainLoss,
  SuperficialLossEvent,
  T5008SlipEntry,
  T5008DiscrepancyRow,
} from '../types/tax';
import { formatCad, formatShares, formatRate, d, toMoney } from '../engine/decimal';
import { parseT5008Csv } from '../parsers/t5008Parser';

interface ReportsViewProps {
  engineOutput: CalculationEngineOutput;
  selectedTaxYear: number | 'ALL';
  availableTaxYears: number[];
  setSelectedTaxYear: (year: number | 'ALL') => void;
}

type ReportTab =
  | 'schedule3'
  | 't5008_diff'
  | 'rollforward'
  | 'superficial'
  | 'dividends'
  | 'provenance';

export const ReportsView: React.FC<ReportsViewProps> = ({
  engineOutput,
  selectedTaxYear,
  availableTaxYears,
  setSelectedTaxYear,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('schedule3');
  const [selectedAuditItem, setSelectedAuditItem] = useState<{ id: string; rule: string; details: string } | null>(null);
  
  // T5008 slips loaded per tax year (optional user upload for comparison)
  const [uploadedT5008Slips, setUploadedT5008Slips] = useState<Record<number, T5008SlipEntry[]>>({});
  const [t5008UploadMessage, setT5008UploadMessage] = useState<string | null>(null);

  // Active Tax Year integer
  const activeYearInt = typeof selectedTaxYear === 'number' ? selectedTaxYear : availableTaxYears[0] || 2024;

  // 1. Realized Gains / Schedule 3 dispositions for selected tax year
  const filteredRealizedGains = useMemo<RealizedGainLoss[]>(() => {
    return engineOutput.realizedGainsLosses.filter((g) => {
      if (selectedTaxYear === 'ALL') return true;
      return g.taxYear === selectedTaxYear;
    });
  }, [engineOutput.realizedGainsLosses, selectedTaxYear]);

  // 2. Rollforward Data for selected tax year
  const rollforwardList = useMemo<SecurityRollforward[]>(() => {
    const yearMap = engineOutput.rollforwardsByYear.get(activeYearInt);
    if (!yearMap) return [];
    const list: SecurityRollforward[] = Array.from(yearMap.values()) as SecurityRollforward[];
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [engineOutput.rollforwardsByYear, activeYearInt]);

  // 3. Superficial Losses
  const superficialLossesList = useMemo<SuperficialLossEvent[]>(() => {
    return engineOutput.superficialLosses.filter((s) => {
      if (selectedTaxYear === 'ALL') return true;
      return s.dispositionDate.startsWith(`${selectedTaxYear}-`);
    });
  }, [engineOutput.superficialLosses, selectedTaxYear]);

  // Totals for Schedule 3
  const schedule3Totals = useMemo(() => {
    let grossProceeds = d(0);
    let outlays = d(0);
    let acbRemoved = d(0);
    let recognized = d(0);
    let deniedSuperficial = d(0);

    filteredRealizedGains.forEach((g) => {
      grossProceeds = grossProceeds.plus(d(g.grossProceedsCad));
      outlays = outlays.plus(d(g.dispositionOutlaysCad));
      acbRemoved = acbRemoved.plus(d(g.acbOfUnitsDisposedCad));
      recognized = recognized.plus(d(g.recognizedGainLossCad));
      deniedSuperficial = deniedSuperficial.plus(d(g.superficialLossDeniedCad));
    });

    return {
      grossProceeds: grossProceeds.toString(),
      outlays: outlays.toString(),
      acbRemoved: acbRemoved.toString(),
      recognized: recognized.toString(),
      deniedSuperficial: deniedSuperficial.toString(),
      recognizedIsPos: recognized.gte(0),
    };
  }, [filteredRealizedGains]);

  // 4. T5008 vs App Discrepancy Rows
  const t5008DiscrepancyRows = useMemo<T5008DiscrepancyRow[]>(() => {
    const yearSlips = uploadedT5008Slips[activeYearInt] || [];
    const usedSlipIds = new Set<string>();

    const getDayDiff = (d1: string, d2: string) => {
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      if (isNaN(t1) || isNaN(t2)) return 999;
      return Math.abs((t1 - t2) / (1000 * 60 * 60 * 24));
    };

    const matchedRows: T5008DiscrepancyRow[] = filteredRealizedGains.map((rgl) => {
      // Find matching T5008 slip by exact symbol, qty, and date within trade/settlement ±3 days
      const matchedSlip = yearSlips.find((slip) => {
        if (usedSlipIds.has(slip.id)) return false;
        
        const cleanSlipSym = slip.symbol.trim().toUpperCase();
        const cleanRglSym = rgl.symbol.trim().toUpperCase();
        if (cleanSlipSym !== cleanRglSym) return false;

        const slipQty = Math.abs(parseFloat(slip.quantity) || 0);
        const rglQty = Math.abs(parseFloat(rgl.quantityDisposed) || 0);
        if (Math.abs(slipQty - rglQty) >= 0.001) return false;

        const diffDisp = getDayDiff(slip.date, rgl.dispositionDate);
        const diffSettle = rgl.settlementDate ? getDayDiff(slip.date, rgl.settlementDate) : 999;
        return diffDisp <= 3 || diffSettle <= 3;
      });

      if (matchedSlip) {
        usedSlipIds.add(matchedSlip.id);
        const t5008Proc = d(matchedSlip.proceedsCad);
        const appProc = d(rgl.grossProceedsCad);
        const deltaProc = appProc.minus(t5008Proc);

        const t5008Book = matchedSlip.bookValueCad ? d(matchedSlip.bookValueCad) : null;
        let deltaGain: string | null = null;
        if (t5008Book !== null) {
          const t5008ImpliedGain = t5008Proc.minus(t5008Book);
          deltaGain = d(rgl.recognizedGainLossCad).minus(t5008ImpliedGain).toString();
        }

        const isProcDiff = deltaProc.abs().gt(0.05);

        return {
          dispositionId: rgl.id,
          date: rgl.dispositionDate,
          symbol: rgl.symbol,
          securityName: rgl.securityName,
          quantityDisposed: rgl.quantityDisposed,
          appProceedsCad: rgl.grossProceedsCad,
          appAcbCad: rgl.acbOfUnitsDisposedCad,
          appOutlaysCad: rgl.dispositionOutlaysCad,
          appGainLossCad: rgl.recognizedGainLossCad,
          t5008ProceedsCad: matchedSlip.proceedsCad,
          t5008BookValueCad: matchedSlip.bookValueCad || null,
          deltaProceedsCad: deltaProc.toString(),
          deltaGainCad: deltaGain,
          status: isProcDiff ? 'PROCEEDS_DIFFERENCE' : 'MATCHED',
          notes: isProcDiff ? 'Proceeds differ (check settlement date vs trade date FX rate)' : 'Proceeds matched with T5008 slip',
        };
      }

      // No matching T5008 line found for this disposition
      return {
        dispositionId: rgl.id,
        date: rgl.dispositionDate,
        symbol: rgl.symbol,
        securityName: rgl.securityName,
        quantityDisposed: rgl.quantityDisposed,
        appProceedsCad: rgl.grossProceedsCad,
        appAcbCad: rgl.acbOfUnitsDisposedCad,
        appOutlaysCad: rgl.dispositionOutlaysCad,
        appGainLossCad: rgl.recognizedGainLossCad,
        t5008ProceedsCad: null,
        t5008BookValueCad: null,
        deltaProceedsCad: null,
        deltaGainCad: null,
        status: 'T5008_NOT_LOADED',
        notes: yearSlips.length > 0 ? 'No matching T5008 line found for this disposition' : 'T5008 slip not loaded for this tax year',
      };
    });

    // Unmatched T5008 lines as EXTRA_T5008
    const extraRows: T5008DiscrepancyRow[] = yearSlips
      .filter((slip) => !usedSlipIds.has(slip.id))
      .map((slip) => {
        const fxNote = slip.currency && slip.currency !== 'CAD' ? ` (Converted from ${slip.currency} at ${slip.fxRateUsed || 1.35} CAD/${slip.currency})` : '';
        return {
          dispositionId: `EXTRA_${slip.id}`,
          date: slip.date,
          symbol: slip.symbol,
          securityName: slip.securityDescription || slip.symbol,
          quantityDisposed: slip.quantity,
          appProceedsCad: '0.00',
          appAcbCad: '0.00',
          appOutlaysCad: '0.00',
          appGainLossCad: '0.00',
          t5008ProceedsCad: slip.proceedsCad,
          t5008BookValueCad: slip.bookValueCad || null,
          deltaProceedsCad: `-${slip.proceedsCad}`,
          deltaGainCad: null,
          status: 'EXTRA_T5008',
          notes: `T5008 slip line reported by broker but no matching disposition in app ledger${fxNote}`,
        };
      });

    return [...matchedRows, ...extraRows];
  }, [filteredRealizedGains, uploadedT5008Slips, activeYearInt]);

  // T5008 Totals
  const t5008Totals = useMemo(() => {
    let appProc = d(0);
    let appAcb = d(0);
    let appOutlays = d(0);
    let appGain = d(0);
    let t5008Proc = d(0);
    let t5008Book = d(0);
    let hasAnyT5008 = false;

    t5008DiscrepancyRows.forEach((r) => {
      appProc = appProc.plus(d(r.appProceedsCad));
      appAcb = appAcb.plus(d(r.appAcbCad));
      appOutlays = appOutlays.plus(d(r.appOutlaysCad));
      appGain = appGain.plus(d(r.appGainLossCad));

      if (r.t5008ProceedsCad !== null) {
        hasAnyT5008 = true;
        t5008Proc = t5008Proc.plus(d(r.t5008ProceedsCad));
      }
      if (r.t5008BookValueCad !== null) {
        t5008Book = t5008Book.plus(d(r.t5008BookValueCad));
      }
    });

    const deltaProc = hasAnyT5008 ? appProc.minus(t5008Proc) : null;
    const deltaGain = hasAnyT5008 ? appGain.minus(t5008Proc.minus(t5008Book)) : null;

    return {
      appProc: appProc.toString(),
      appAcb: appAcb.toString(),
      appOutlays: appOutlays.toString(),
      appGain: appGain.toString(),
      t5008Proc: hasAnyT5008 ? t5008Proc.toString() : null,
      t5008Book: hasAnyT5008 ? t5008Book.toString() : null,
      deltaProc: deltaProc ? deltaProc.toString() : null,
      deltaGain: deltaGain ? deltaGain.toString() : null,
      hasAnyT5008,
    };
  }, [t5008DiscrepancyRows]);

  // Handle T5008 CSV Upload for the active year
  const handleT5008FileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_FILE_SIZE) {
      setT5008UploadMessage('File size exceeds 20MB limit.');
      setTimeout(() => setT5008UploadMessage(null), 4000);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && !['csv', 'txt'].includes(ext)) {
      setT5008UploadMessage('Unsupported file format. Please upload a CSV file.');
      setTimeout(() => setT5008UploadMessage(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const parsed = parseT5008Csv(text, activeYearInt);
        setUploadedT5008Slips((prev) => ({
          ...prev,
          [activeYearInt]: parsed,
        }));
        setT5008UploadMessage(`Loaded ${parsed.length} T5008 slip lines for Tax Year ${activeYearInt}.`);
        setTimeout(() => setT5008UploadMessage(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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

    const csvText = [
      '# GOVERNMENT OF CANADA - CRA SCHEDULE 3 CAPITAL GAINS (SECTION 3: PUBLIC SHARES & MUTUAL FUNDS)',
      `# Tax Year: ${selectedTaxYear} | Currency: Canadian Dollars (CAD) | Converted via Bank of Canada Daily Rates`,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      `TOTALS,,,,,"${toMoney(schedule3Totals.grossProceeds)}","${toMoney(schedule3Totals.acbRemoved)}","${toMoney(schedule3Totals.outlays)}",,"${toMoney(schedule3Totals.recognized)}"`,
    ].join('\n');

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `CRA_Schedule_3_Capital_Gains_${selectedTaxYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export T5008 Discrepancy CSV
  const handleExportT5008DiscrepancyCsv = () => {
    const headers = [
      'Disposition Date',
      'Symbol',
      'Security Name',
      'Quantity Disposed',
      'App Proceeds (CAD)',
      'App ACB (CAD)',
      'App Outlays (CAD)',
      'App Capital Gain / (Loss) (CAD)',
      'IBKR / T5008 Proceeds (CAD)',
      'IBKR Book Value (CAD) [Not CRA ACB]',
      'Delta Proceeds (CAD)',
      'Delta Gain (CAD)',
      'Status / Notes',
    ];

    const rows = t5008DiscrepancyRows.map((r) => [
      r.date,
      r.symbol,
      `"${r.securityName.replace(/"/g, '""')}"`,
      formatShares(r.quantityDisposed),
      toMoney(r.appProceedsCad),
      toMoney(r.appAcbCad),
      toMoney(r.appOutlaysCad),
      toMoney(r.appGainLossCad),
      r.t5008ProceedsCad ? toMoney(r.t5008ProceedsCad) : 'N/A',
      r.t5008BookValueCad ? toMoney(r.t5008BookValueCad) : 'N/A',
      r.deltaProceedsCad ? toMoney(r.deltaProceedsCad) : 'N/A',
      r.deltaGainCad ? toMoney(r.deltaGainCad) : 'N/A',
      `"${r.notes || ''}"`,
    ]);

    const csvText = [
      '# T5008 vs CRA SCHEDULE 3 DISCREPANCY RECONCILIATION REPORT',
      '# DISCLAIMER: Do not copy IBKR book value onto Schedule 3. Use this app’s ACB. Use T5008 to check proceeds.',
      `# Tax Year: ${activeYearInt} | Currency: Canadian Dollars (CAD)`,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      `TOTALS,,,,${toMoney(t5008Totals.appProc)},${toMoney(t5008Totals.appAcb)},${toMoney(t5008Totals.appOutlays)},${toMoney(t5008Totals.appGain)},${t5008Totals.t5008Proc ? toMoney(t5008Totals.t5008Proc) : 'N/A'},${t5008Totals.t5008Book ? toMoney(t5008Totals.t5008Book) : 'N/A'},${t5008Totals.deltaProc ? toMoney(t5008Totals.deltaProc) : 'N/A'},${t5008Totals.deltaGain ? toMoney(t5008Totals.deltaGain) : 'N/A'},`,
    ].join('\n');

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `T5008_vs_Schedule3_Discrepancy_${activeYearInt}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="reports-view-container" className="space-y-6">
      
      {/* Top Header & Sticky Tax Year Switcher */}
      <div className="sticky top-0 z-20 bg-slate-50/90 dark:bg-zinc-950/90 backdrop-blur-md py-3 -mt-3 border-b border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Canadian Tax Reports & Schedule 3 Schedules</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Compliant with the Income Tax Act (Canada), Form T1 Schedule 3, Form T5008 reconciliation, and CRA Information Circulars.
          </p>
        </div>

        {/* Year Select & Export buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            id="reports-year-select"
            value={selectedTaxYear}
            onChange={(e) => setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))}
            className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-semibold rounded-xl px-3 py-2 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs font-mono transition-colors"
          >
            <option value="ALL">All Tax Years</option>
            {availableTaxYears.map((yr) => (
              <option key={yr} value={yr}>
                Tax Year {yr}
              </option>
            ))}
          </select>

          {activeReportTab === 't5008_diff' ? (
            <button
              id="btn-export-t5008-csv"
              onClick={handleExportT5008DiscrepancyCsv}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>Export T5008 Discrepancy CSV</span>
            </button>
          ) : (
            <button
              id="btn-export-schedule3-csv"
              onClick={handleExportSchedule3Csv}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>Download Schedule 3 CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* CPA Mandatory Disclaimer Banner */}
      <div className="p-4 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl flex items-start gap-3 shadow-2xs text-xs text-zinc-600 dark:text-zinc-400">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
            Chartered Professional Accountant (CPA) Audit & Verification Notice
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            All calculations in this report represent adjusted cost bases, proceeds of disposition, and capital gains calculated strictly in Canadian Dollars (CAD) using Bank of Canada daily foreign exchange rates under <strong>ITA s. 261</strong> and average cost pooling under <strong>ITA s. 47(1)</strong>. These schedules are designed for Canadian tax filing preparation and should be reviewed by a qualified CPA prior to submission to the Canada Revenue Agency (CRA).
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs (Wrapping tab list) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-px text-xs font-medium">
        <button
          id="tab-btn-schedule3"
          onClick={() => setActiveReportTab('schedule3')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'schedule3'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>1. Schedule 3 (Capital Gains)</span>
        </button>

        <button
          id="tab-btn-t5008-diff"
          onClick={() => setActiveReportTab('t5008_diff')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 't5008_diff'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>2. T5008 vs This App</span>
        </button>

        <button
          id="tab-btn-rollforward"
          onClick={() => setActiveReportTab('rollforward')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'rollforward'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>3. ACB Rollforward by Security</span>
        </button>

        <button
          id="tab-btn-superficial"
          onClick={() => setActiveReportTab('superficial')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'superficial'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>4. Superficial Losses</span>
        </button>

        <button
          id="tab-btn-dividends"
          onClick={() => setActiveReportTab('dividends')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'dividends'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>5. Dividends & ROC</span>
        </button>

        <button
          id="tab-btn-provenance"
          onClick={() => setActiveReportTab('provenance')}
          className={`px-4 py-2.5 rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeReportTab === 'provenance'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 font-semibold'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>6. FX & Audit Provenance</span>
        </button>
      </div>

      {/* TAB 1: Realized Capital Gains (Schedule 3) */}
      {activeReportTab === 'schedule3' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-[#71717A]">
              Tax Year <strong>{selectedTaxYear}</strong> • Section 3: Qualified Publicly Traded Shares & Mutual Fund Units
            </span>
            <span className="text-[11px] text-[#A1A1AA] font-mono">
              Proceeds - Outlays - ACB Removed = Realized Capital Gain / Loss (CAD)
            </span>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 font-semibold">Date</th>
                    <th className="py-3 px-3 font-semibold">Symbol</th>
                    <th className="py-3 px-3 font-semibold">Security Description</th>
                    <th className="py-3 px-3 font-semibold text-right">Quantity</th>
                    <th className="py-3 px-3 font-semibold text-right">Proceeds (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">ACB (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Outlays (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Gain / (Loss) (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-center">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7]">
                  {filteredRealizedGains.map((rgl) => (
                    <tr key={rgl.id} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 px-3 text-[#18181B]">{rgl.dispositionDate}</td>
                      <td className="py-3 px-3 font-bold text-[#18181B]">{rgl.symbol}</td>
                      <td className="py-3 px-3 text-[#71717A] font-sans truncate max-w-[200px]">
                        {rgl.securityName}
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B]">
                        {formatShares(rgl.quantityDisposed)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B] font-medium">
                        {formatCad(rgl.grossProceedsCad)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B]">
                        {formatCad(rgl.acbOfUnitsDisposedCad)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#71717A]">
                        {formatCad(rgl.dispositionOutlaysCad)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        <span className={d(rgl.recognizedGainLossCad).gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'}>
                          {d(rgl.recognizedGainLossCad).gte(0) ? `+${formatCad(rgl.recognizedGainLossCad)}` : formatCad(rgl.recognizedGainLossCad)}
                        </span>
                        {rgl.isSuperficialLoss && (
                          <div className="text-[9px] text-[#7C3AED] font-normal">
                            Superficial: {formatCad(rgl.superficialLossDeniedCad)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedAuditItem({
                            id: rgl.dispositionTransactionId,
                            rule: rgl.statutoryCitations.join('; '),
                            details: `Disposed ${formatShares(rgl.quantityDisposed)} units of ${rgl.symbol} on ${rgl.dispositionDate}. ACB removed: ${formatCad(rgl.acbOfUnitsDisposedCad)}. Outlays deducted: ${formatCad(rgl.dispositionOutlaysCad)}. Net Capital Gain/Loss: ${formatCad(rgl.recognizedGainLossCad)}.`,
                          })}
                          className="px-2 py-0.5 rounded bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#71717A] hover:text-[#18181B] text-[10px] transition-colors"
                        >
                          Audit
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredRealizedGains.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No realized dispositions found for tax year {selectedTaxYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredRealizedGains.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F4F4F5] border-t-2 border-[#E4E4E7] font-bold text-[#18181B]">
                      <td colSpan={4} className="py-3.5 px-3 uppercase text-[10px] text-[#71717A] font-sans">
                        Schedule 3 Section 3 Totals ({filteredRealizedGains.length} Dispositions)
                      </td>
                      <td className="py-3.5 px-3 text-right">{formatCad(schedule3Totals.grossProceeds)}</td>
                      <td className="py-3.5 px-3 text-right">{formatCad(schedule3Totals.acbRemoved)}</td>
                      <td className="py-3.5 px-3 text-right">{formatCad(schedule3Totals.outlays)}</td>
                      <td className="py-3.5 px-3 text-right">
                        <span className={schedule3Totals.recognizedIsPos ? 'text-[#059669]' : 'text-[#DC2626]'}>
                          {schedule3Totals.recognizedIsPos ? `+${formatCad(schedule3Totals.recognized)}` : formatCad(schedule3Totals.recognized)}
                        </span>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: T5008 vs This App Discrepancy Report */}
      {activeReportTab === 't5008_diff' && (
        <div className="space-y-5">
          
          {/* Prominent Disclaimer & Regulatory Guidance */}
          <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl space-y-2 shadow-2xs">
            <div className="flex items-center gap-2 text-[#92400E] font-bold text-xs">
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>CRA Filing Directive: T5008 Statement of Securities Transactions</span>
            </div>
            <p className="text-xs text-[#B45309] font-medium leading-relaxed">
              <strong>Do not copy IBKR book value onto Schedule 3. Use this app’s ACB. Use T5008 to check proceeds.</strong>
            </p>
            <p className="text-[11px] text-[#92400E] leading-relaxed">
              Broker T5008 Box 20 ("Cost or book value") is typically calculated using lot-by-lot FIFO and may not reflect Canadian tax rules. Canada’s <em>Income Tax Act</em> (s. 47) requires identical properties across all your non-registered accounts to share a single weighted-average Adjusted Cost Base in Canadian Dollars (CAD) calculated using Bank of Canada trade-date exchange rates (s. 261), adjusted for superficial loss deferrals (s. 54) and option assignments (s. 49).
            </p>
          </div>

          {/* Optional T5008 CSV Upload Dropzone for active year */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors">
            <div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Upload T5008 Slip CSV for Tax Year {activeYearInt} (Optional)</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Upload your broker's T5008 or tax software slip export to automatically reconcile Box 21 proceeds and identify Box 20 book value deltas. (Does not overwrite your ACB ledger).
              </p>
              {t5008UploadMessage && (
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t5008UploadMessage}</span>
                </div>
              )}
            </div>

            <label className="px-3.5 py-2 bg-zinc-900 dark:bg-zinc-800 hover:bg-black dark:hover:bg-zinc-700 text-white dark:text-zinc-100 rounded-xl text-xs font-semibold cursor-pointer shadow-2xs transition-colors shrink-0 flex items-center gap-1.5 border border-zinc-800 dark:border-zinc-700">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose T5008 CSV</span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleT5008FileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* T5008 Discrepancy Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs transition-colors">
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[850px] text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 font-semibold">Date</th>
                    <th className="py-3 px-3 font-semibold">Symbol</th>
                    <th className="py-3 px-3 font-semibold text-right">Qty</th>
                    <th className="py-3 px-3 font-semibold text-right">App Proceeds (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">App ACB (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">App Outlays (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">App Gain/Loss (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">IBKR/T5008 Proceeds</th>
                    <th className="py-3 px-3 font-semibold text-right">
                      IBKR Book Value
                      <span className="block text-[8px] font-sans font-normal text-amber-600 dark:text-amber-400">not CRA ACB — usually FIFO</span>
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">Delta Proceeds</th>
                    <th className="py-3 px-3 font-semibold text-right">Delta Gain</th>
                    <th className="py-3 px-3 font-semibold text-center font-sans">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">

                  {t5008DiscrepancyRows.map((row) => (
                    <tr key={row.dispositionId} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 px-3 text-[#18181B]">{row.date}</td>
                      <td className="py-3 px-3 font-bold text-[#18181B]">
                        {row.symbol}
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B]">
                        {formatShares(row.quantityDisposed)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#18181B] font-medium">
                        {formatCad(row.appProceedsCad)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#059669] font-medium">
                        {formatCad(row.appAcbCad)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#71717A]">
                        {formatCad(row.appOutlaysCad)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        <span className={d(row.appGainLossCad).gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'}>
                          {d(row.appGainLossCad).gte(0) ? `+${formatCad(row.appGainLossCad)}` : formatCad(row.appGainLossCad)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium">
                        {row.t5008ProceedsCad !== null ? (
                          <span className="text-[#18181B]">{formatCad(row.t5008ProceedsCad)}</span>
                        ) : (
                          <span className="text-[#A1A1AA] italic text-[11px] font-sans">T5008 not loaded</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {row.t5008BookValueCad !== null ? (
                          <span className="text-[#71717A]">{formatCad(row.t5008BookValueCad)}</span>
                        ) : (
                          <span className="text-[#A1A1AA] italic text-[11px] font-sans">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-medium">
                        {row.deltaProceedsCad !== null ? (
                          <span className={d(row.deltaProceedsCad).abs().lt(0.05) ? 'text-[#059669]' : 'text-[#D97706]'}>
                            {formatCad(row.deltaProceedsCad)}
                          </span>
                        ) : (
                          <span className="text-[#A1A1AA]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-medium">
                        {row.deltaGainCad !== null ? (
                          <span className={d(row.deltaGainCad).abs().lt(0.05) ? 'text-[#059669]' : 'text-[#2563EB]'}>
                            {formatCad(row.deltaGainCad)}
                          </span>
                        ) : (
                          <span className="text-[#A1A1AA]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        {row.status === 'MATCHED' && (
                          <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-[10px] font-semibold">
                            Matched
                          </span>
                        )}
                        {row.status === 'PROCEEDS_DIFFERENCE' && (
                          <span className="px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] text-[10px] font-semibold">
                            Proceeds Delta
                          </span>
                        )}
                        {row.status === 'T5008_NOT_LOADED' && (
                          <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7] text-[10px]">
                            T5008 not loaded
                          </span>
                        )}
                        {row.status === 'EXTRA_T5008' && (
                          <span className="px-2 py-0.5 rounded-md bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] text-[10px] font-semibold">
                            Unmatched T5008
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {t5008DiscrepancyRows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No taxable dispositions in Tax Year {selectedTaxYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
                {t5008DiscrepancyRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F4F4F5] border-t-2 border-[#E4E4E7] font-bold text-[#18181B]">
                      <td colSpan={3} className="py-3.5 px-3 uppercase text-[10px] text-[#71717A] font-sans">
                        Totals ({t5008DiscrepancyRows.length} Dispositions)
                      </td>
                      <td className="py-3.5 px-3 text-right">{formatCad(t5008Totals.appProc)}</td>
                      <td className="py-3.5 px-3 text-right text-[#059669]">{formatCad(t5008Totals.appAcb)}</td>
                      <td className="py-3.5 px-3 text-right text-[#71717A]">{formatCad(t5008Totals.appOutlays)}</td>
                      <td className="py-3.5 px-3 text-right">
                        <span className={d(t5008Totals.appGain).gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'}>
                          {d(t5008Totals.appGain).gte(0) ? `+${formatCad(t5008Totals.appGain)}` : formatCad(t5008Totals.appGain)}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {t5008Totals.t5008Proc !== null ? formatCad(t5008Totals.t5008Proc) : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {t5008Totals.t5008Book !== null ? formatCad(t5008Totals.t5008Book) : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {t5008Totals.deltaProc !== null ? formatCad(t5008Totals.deltaProc) : '—'}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {t5008Totals.deltaGain !== null ? formatCad(t5008Totals.deltaGain) : '—'}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Technical Explanations of Systematic Discrepancies */}
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4 text-xs">
            <h3 className="font-bold text-sm text-[#18181B] flex items-center gap-2">
              <Info className="w-4 h-4 text-[#2563EB]" />
              <span>Why IBKR Broker Book Value Differs From CRA Schedule 3 ACB</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-[#71717A] leading-relaxed">
              <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-1.5">
                <div className="font-bold text-xs text-[#18181B]">1. Cost Method: CRA Average Cost Pool (ITA s. 47) vs FIFO</div>
                <p>
                  IBKR tracks cost basis using First-In First-Out (FIFO) or LIFO on a per-account basis. Under Canadian tax law (ITA s. 47(1)), all identical shares held across all your non-registered taxable accounts must be pooled into a single weighted average cost base.
                </p>
              </div>

              <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-1.5">
                <div className="font-bold text-xs text-[#18181B]">2. Foreign Exchange Rates: Bank of Canada Trade Date (ITA s. 261)</div>
                <p>
                  IBKR reports gains in USD and converts the net gain using current spot rates. The CRA requires each acquisition cost and each disposition proceed to be converted into CAD on its respective trade date using official Bank of Canada daily exchange rates.
                </p>
              </div>

              <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-1.5">
                <div className="font-bold text-xs text-[#18181B]">3. Superficial Loss Deferrals (ITA s. 54 / s. 40(2)(g)(i))</div>
                <p>
                  If you or an affiliated person (such as your spouse or TFSA/RRSP) re-acquires the same security within the 61-day superficial loss window, the loss is denied and added to the ACB of the replacement property under ITA s. 53(1)(f). Broker book values do not adjust for Canadian superficial loss rules.
                </p>
              </div>

              <div className="p-4 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-1.5">
                <div className="font-bold text-xs text-[#18181B]">4. Option Exercises and Assignments (ITA s. 49)</div>
                <p>
                  When call options are exercised or put options are assigned, the premium paid or received is rolled directly into the share acquisition ACB or disposition proceeds under ITA s. 49, whereas brokers frequently report option closes separately.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACB Rollforward by Security */}
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
                    <th className="py-3 px-3 font-semibold text-right">Dispositions ACB</th>
                    <th className="py-3 px-3 font-semibold text-right">ROC (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Superficial Add (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Closing Qty</th>
                    <th className="py-3 px-3 font-semibold text-right">Closing ACB (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">ACB / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] font-mono">
                  {rollforwardList.map((rf) => (
                    <tr key={rf.securityId} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#18181B]">{rf.symbol}</div>
                        <div className="text-[11px] text-[#71717A] font-sans truncate max-w-[150px]">{rf.name}</div>
                      </td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatShares(rf.openingQuantity)}</td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatCad(rf.openingAcbCad)}</td>
                      <td className="py-3 px-3 text-right text-[#059669]">+{formatCad(rf.acquisitionsCostCad)}</td>
                      <td className="py-3 px-3 text-right text-[#DC2626]">-{formatCad(rf.dispositionsAcbRemovedCad)}</td>
                      <td className="py-3 px-3 text-right text-[#D97706]">
                        {d(rf.rocAdjustmentsCad).gt(0) ? `-${formatCad(rf.rocAdjustmentsCad)}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-[#7C3AED]">
                        {d(rf.superficialLossAdditionsCad).gt(0) ? `+${formatCad(rf.superficialLossAdditionsCad)}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-[#18181B]">{formatShares(rf.closingQuantity)}</td>
                      <td className="py-3 px-3 text-right font-bold text-[#18181B]">{formatCad(rf.closingTotalAcbCad)}</td>
                      <td className="py-3 px-3 text-right text-[#71717A]">{formatCad(rf.closingAcbPerUnitCad)}</td>
                    </tr>
                  ))}

                  {rollforwardList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No transactions recorded for tax year {activeYearInt}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Superficial Loss Schedule */}
      {activeReportTab === 'superficial' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#F5F3FF] border border-[#DDD6FE] rounded-2xl text-xs text-[#5B21B6] space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-xs">
              <Scale className="w-4 h-4 text-[#7C3AED]" />
              <span>CRA Superficial Loss Rules (ITA s. 54, s. 40(2)(g)(i), s. 53(1)(f))</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#6D28D9]">
              A capital loss is deemed superficial when you or an affiliated person (including your spouse, a corporation you control, or your registered accounts like TFSA/RRSP) acquires the identical property during the period beginning 30 days before and ending 30 days after the disposition, and owns the property at the end of that period. Denied losses are added to the ACB of the replacement property.
            </p>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 font-semibold">Date</th>
                    <th className="py-3 px-3 font-semibold">Symbol</th>
                    <th className="py-3 px-3 font-semibold text-right">Qty Disposed</th>
                    <th className="py-3 px-3 font-semibold text-right">Potential Loss</th>
                    <th className="py-3 px-3 font-semibold text-right">Loss Denied (CAD)</th>
                    <th className="py-3 px-3 font-semibold text-right">Allowable Loss</th>
                    <th className="py-3 px-3 font-semibold">Replacement Transaction</th>
                    <th className="py-3 px-3 font-semibold">Tax Treatment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7]">
                  {superficialLossesList.map((sl) => {
                    const rowId = sl.id || sl.dispositionTransactionId;
                    const disposedShares = sl.disposedShares || '0';
                    const grossLoss = sl.grossLossCad || sl.rawCapitalLossCad || '0.00';
                    const allowableLoss = sl.allowableLossCad || sl.allowedLossCad || '0.00';
                    return (
                      <tr key={rowId} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 px-3 text-[#18181B]">{sl.dispositionDate}</td>
                        <td className="py-3 px-3 font-bold text-[#18181B]">{sl.symbol}</td>
                        <td className="py-3 px-3 text-right text-[#18181B]">{formatShares(disposedShares)}</td>
                        <td className="py-3 px-3 text-right text-[#DC2626]">-{formatCad(grossLoss)}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#7C3AED]">-{formatCad(sl.deniedLossCad)}</td>
                        <td className="py-3 px-3 text-right text-[#DC2626]">-{formatCad(allowableLoss)}</td>
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
                    );
                  })}

                  {superficialLossesList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#71717A] font-sans text-xs">
                        No superficial losses detected in this portfolio for tax year {selectedTaxYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Dividend & Return of Capital (ROC) Summary */}
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
