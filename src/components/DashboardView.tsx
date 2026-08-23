import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  FileCheck2,
  Calendar,
  Layers,
  Sparkles,
  Info,
  DollarSign,
  Activity,
  CheckCircle2,
  UploadCloud,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';
import {
  CalculationEngineOutput,
  FlexConnectorConfig,
  Transaction,
  SecurityMaster,
} from '../types/tax';
import { formatCad, formatShares, d } from '../engine/decimal';

interface DashboardViewProps {
  engineOutput: CalculationEngineOutput;
  flexConfig: FlexConnectorConfig;
  transactions: Transaction[];
  securities: SecurityMaster[];
  selectedTaxYear: number | 'ALL';
  setSelectedTaxYear?: (year: number | 'ALL') => void;
  onNavigateToTab: (tab: any) => void;
  onOpenReview: (txId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  engineOutput,
  flexConfig,
  transactions,
  securities,
  selectedTaxYear,
  setSelectedTaxYear,
  onNavigateToTab,
  onOpenReview,
}) => {
  const pendingReviews = transactions.filter((t) => t.status === 'needs_review');

  // Dates and Years derivation
  const { firstTradeDate, lastTradeDate, allTaxYears, yearlySummaries } = useMemo(() => {
    if (transactions.length === 0) {
      return { firstTradeDate: null, lastTradeDate: null, allTaxYears: [], yearlySummaries: [] };
    }

    const sortedDates = transactions
      .map((t) => t.date)
      .filter(Boolean)
      .sort();

    const first = sortedDates[0];
    const last = sortedDates[sortedDates.length - 1];

    // Find all distinct years in transactions and realized gains
    const yearSet = new Set<number>();
    transactions.forEach((t) => {
      if (t.date && t.date.length >= 4) {
        const y = parseInt(t.date.substring(0, 4), 10);
        if (!isNaN(y)) yearSet.add(y);
      }
    });
    engineOutput.realizedGainsLosses.forEach((r) => {
      yearSet.add(r.taxYear);
    });

    const years = Array.from(yearSet).sort((a, b) => b - a); // Descending

    // Compute summaries per year
    const summaries = years.map((yr) => {
      const yearGains = engineOutput.realizedGainsLosses.filter((r) => r.taxYear === yr);
      let grossProceeds = d(0);
      let acbDisposed = d(0);
      let netGain = d(0);
      let superficialDenied = d(0);

      yearGains.forEach((r) => {
        grossProceeds = grossProceeds.plus(d(r.grossProceedsCad));
        acbDisposed = acbDisposed.plus(d(r.acbOfUnitsDisposedCad));
        netGain = netGain.plus(d(r.recognizedGainLossCad));
        superficialDenied = superficialDenied.plus(d(r.superficialLossDeniedCad));
      });

      const yearTxs = transactions.filter((t) => t.date.startsWith(`${yr}-`));

      return {
        year: yr,
        dispositionCount: yearGains.length,
        transactionCount: yearTxs.length,
        grossProceeds: grossProceeds.toString(),
        acbDisposed: acbDisposed.toString(),
        netGain: netGain.toString(),
        superficialDenied: superficialDenied.toString(),
        isGainPositive: netGain.gte(0),
      };
    });

    return {
      firstTradeDate: first,
      lastTradeDate: last,
      allTaxYears: years,
      yearlySummaries: summaries,
    };
  }, [transactions, engineOutput.realizedGainsLosses]);

  // Filter realized gains by selected tax year
  const filteredGains = selectedTaxYear === 'ALL'
    ? engineOutput.realizedGainsLosses
    : engineOutput.realizedGainsLosses.filter((r) => r.taxYear === selectedTaxYear);

  let yearGain = d(0);
  let yearLoss = d(0);
  filteredGains.forEach((r) => {
    const val = d(r.recognizedGainLossCad);
    if (val.gt(0)) yearGain = yearGain.plus(val);
    else if (val.lt(0)) yearLoss = yearLoss.plus(val.abs());
  });
  const netGainLoss = yearGain.minus(yearLoss);

  // Calculate total portfolio ACB
  let totalPortfolioAcb = d(0);
  engineOutput.securityBalances.forEach((bal) => {
    if (d(bal.quantity).gt(0)) {
      totalPortfolioAcb = totalPortfolioAcb.plus(d(bal.totalAcbCad));
    }
  });

  // Total superficial loss denied
  const totalSuperficialDenied = engineOutput.superficialLosses.reduce(
    (acc, s) => acc.plus(d(s.deniedLossCad)),
    d(0)
  );

  return (
    <div id="dashboard-container" className="space-y-6">
      
      {/* Top Banner: Sync & Health State */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs text-[#18181B] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            flexConfig.status === 'CONNECTED'
              ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
              : 'bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]'
          }`}>
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-sm text-[#18181B]">
                IBKR Flex Web Service: {flexConfig.status === 'CONNECTED' ? 'Active & Synced' : 'Not Connected'}
              </h2>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                flexConfig.status === 'CONNECTED' ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]' : 'bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]'
              }`}>
                Query: {flexConfig.queryId || 'AF_CANADIAN_ACB'}
              </span>
            </div>
            <p className="text-xs text-[#71717A] mt-0.5">
              {flexConfig.lastSyncTimestamp
                ? `Last successful sync: ${new Date(flexConfig.lastSyncTimestamp).toLocaleString()}`
                : 'No sync history. Connect your IBKR Flex Token or upload files to update.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            id="btn-goto-connector"
            onClick={() => onNavigateToTab('connector')}
            className="px-3.5 py-2 bg-white hover:bg-[#F4F4F5] text-[#18181B] border border-[#E4E4E7] rounded-xl text-xs font-medium transition-colors shadow-2xs"
          >
            Configure Connector
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-12 shadow-2xs text-center space-y-6">
          <div className="w-16 h-16 bg-[#F4F4F5] rounded-full flex items-center justify-center mx-auto shadow-xs border border-[#E4E4E7]">
            <Database className="w-8 h-8 text-[#71717A]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#18181B] mb-2">No Transactions Loaded</h2>
            <p className="text-[#71717A] text-sm max-w-md mx-auto leading-relaxed">
              To begin calculating your Adjusted Cost Base and capital gains, import an IBKR Activity Flex XML file or connect your Flex Web Service token.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              id="btn-empty-import"
              onClick={() => {
                const btn = document.getElementById('btn-open-import');
                if (btn) btn.click();
                else onNavigateToTab('connector');
              }}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Flex XML or CSV</span>
            </button>
            <button
              onClick={() => onNavigateToTab('connector')}
              className="px-5 py-2.5 bg-[#18181B] hover:bg-black text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
            >
              <Layers className="w-4 h-4" />
              <span>Connect IBKR Token</span>
            </button>
            <button
              onClick={() => onNavigateToTab('help')}
              className="px-5 py-2.5 bg-white hover:bg-[#F4F4F5] text-[#18181B] border border-[#E4E4E7] rounded-xl text-sm font-medium transition-colors shadow-2xs flex items-center gap-2"
            >
              <Info className="w-4 h-4 text-[#2563EB]" />
              <span>Read the Guide</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Missing History & Tax Year Coverage Notice */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#0F172A]">
                  Loaded Ledger Range: {firstTradeDate} to {lastTradeDate} ({allTaxYears.length} Tax Year{allTaxYears.length > 1 ? 's' : ''}: {allTaxYears.join(', ')})
                </span>
                <p className="text-[#64748B] text-[11px] mt-0.5 leading-relaxed">
                  The tax year selector lists all years present in your loaded trade history. If your imported statement covers {firstTradeDate} to {lastTradeDate}, only those years appear. If you held securities acquired prior to {firstTradeDate}, enter an Opening ACB or upload prior-year statements so previous acquisitions are factored into your weighted-average cost.
                </p>
              </div>
            </div>
          </div>

          {/* Review Alert if items need attention */}
          {pendingReviews.length > 0 && (
            <div id="pending-review-banner" className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#92400E]">
                    {pendingReviews.length} Corporate Action{pendingReviews.length > 1 ? 's' : ''} Require Review
                  </h3>
                  <p className="text-xs text-[#B45309] mt-0.5">
                    Under CRA rules, corporate actions with mixed consideration or ambiguous cash classification cannot be posted without tax character confirmation.
                  </p>
                </div>
              </div>
              <button
                id="btn-review-now"
                onClick={() => onNavigateToTab('review')}
                className="px-3.5 py-2 bg-[#92400E] hover:bg-[#78350F] text-white font-medium text-xs rounded-xl shadow-xs shrink-0 transition-colors"
              >
                Resolve in Review Queue
              </button>
            </div>
          )}

          {/* Tax Years Grid (One card per tax year in data; empty years omitted) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#2563EB]" />
                <span>Tax Years in Ledger ({yearlySummaries.length})</span>
              </h3>
              <span className="text-xs text-[#71717A]">
                Click any year to view its CRA Schedule 3 and T5008 reconciliation
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {yearlySummaries.map((ys) => (
                <div
                  key={ys.year}
                  onClick={() => {
                    if (setSelectedTaxYear) {
                      setSelectedTaxYear(ys.year);
                    }
                    onNavigateToTab('reports');
                  }}
                  className={`bg-white border rounded-2xl p-5 shadow-2xs hover:border-[#3B82F6] hover:shadow-xs transition-all cursor-pointer space-y-3 ${
                    selectedTaxYear === ys.year ? 'border-[#2563EB] ring-1 ring-[#2563EB]' : 'border-[#E4E4E7]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#18181B]">{ys.year} Tax Year</span>
                      {selectedTaxYear === ys.year && (
                        <span className="px-1.5 py-0.2 rounded bg-[#EFF6FF] text-[#2563EB] text-[9px] font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className={`p-1 rounded-md ${ys.isGainPositive ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
                      {ys.isGainPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] text-[#71717A]">Net Realized Capital Gain / (Loss)</div>
                    <div className={`text-xl font-bold font-mono ${ys.isGainPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {ys.isGainPositive ? `+${formatCad(ys.netGain)}` : formatCad(ys.netGain)}
                    </div>
                  </div>

                  <div className="border-t border-[#E4E4E7] pt-2 text-[11px] font-mono text-[#71717A] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-sans">Gross Proceeds:</span>
                      <span className="text-[#18181B]">{formatCad(ys.grossProceeds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">ACB Disposed:</span>
                      <span className="text-[#18181B]">{formatCad(ys.acbDisposed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">Dispositions:</span>
                      <span className="text-[#18181B]">{ys.dispositionCount} sales ({ys.transactionCount} txs)</span>
                    </div>
                    {d(ys.superficialDenied).gt(0) && (
                      <div className="flex justify-between text-[#7C3AED]">
                        <span className="font-sans">Superficial Denied:</span>
                        <span>{formatCad(ys.superficialDenied)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4 Core Financial KPI Metric Cards for Active Selected Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Net Realized Gains */}
            <div id="kpi-net-gains" className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#71717A]">
                  {selectedTaxYear === 'ALL' ? 'Total Realized Capital Gains' : `${selectedTaxYear} Net Capital Gains`}
                </span>
                <div className={`p-1.5 rounded-lg ${netGainLoss.gte(0) ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
                  {netGainLoss.gte(0) ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl font-bold tracking-tight ${netGainLoss.gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {formatCad(netGainLoss)}
                </span>
              </div>
              <div className="mt-2.5 text-[11px] text-[#71717A] flex items-center justify-between border-t border-[#E4E4E7] pt-2 font-mono">
                <span>Gains: +{formatCad(yearGain)}</span>
                <span>Losses: -{formatCad(yearLoss)}</span>
              </div>
            </div>

            {/* Card 2: Active Portfolio ACB */}
            <div id="kpi-portfolio-acb" className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#71717A]">Total Taxable Portfolio ACB</span>
                <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold tracking-tight text-[#18181B]">
                  {formatCad(totalPortfolioAcb)}
                </span>
              </div>
              <div className="mt-2.5 text-[11px] text-[#71717A] flex items-center justify-between border-t border-[#E4E4E7] pt-2 font-mono">
                <span>Active Pools: {(Array.from(engineOutput.securityBalances.values()) as Array<{ quantity: string }>).filter(b => d(b.quantity).gt(0)).length}</span>
                <span>ITA s. 47 Weighted Avg</span>
              </div>
            </div>

            {/* Card 3: Superficial Loss Denied */}
            <div id="kpi-superficial-loss" className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#71717A]">Superficial Losses Denied</span>
                <div className="p-1.5 rounded-lg bg-[#F5F3FF] text-[#7C3AED]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold tracking-tight text-[#7C3AED]">
                  {formatCad(totalSuperficialDenied)}
                </span>
              </div>
              <div className="mt-2.5 text-[11px] text-[#71717A] flex items-center justify-between border-t border-[#E4E4E7] pt-2 font-mono">
                <span>30-Day Window Events: {engineOutput.superficialLosses.length}</span>
                <span>Added to Replacement ACB</span>
              </div>
            </div>

            {/* Card 4: Dividend & ROC Distributions */}
            <div id="kpi-distributions" className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#71717A]">Income & ROC Distributions</span>
                <div className="p-1.5 rounded-lg bg-[#FFFBEB] text-[#D97706]">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold tracking-tight text-[#18181B]">
                  {formatCad(d(engineOutput.incomeDistributions.dividendsCad).plus(d(engineOutput.incomeDistributions.rocCad)))}
                </span>
              </div>
              <div className="mt-2.5 text-[11px] text-[#71717A] flex items-center justify-between border-t border-[#E4E4E7] pt-2 font-mono">
                <span>Div: {formatCad(engineOutput.incomeDistributions.dividendsCad)}</span>
                <span>ROC: {formatCad(engineOutput.incomeDistributions.rocCad)}</span>
              </div>
            </div>

          </div>

          {/* Main Grid: Active Holdings ACB Table + Recent Realized Dispositions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Active Securities ACB Pools */}
            <div className="lg:col-span-2 bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#18181B]">Active Security ACB Pools (ITA s. 47)</h3>
                  <p className="text-xs text-[#71717A] mt-0.5">Consolidated across all non-registered accounts at IBKR and other brokers</p>
                </div>
                <button
                  onClick={() => onNavigateToTab('ledger')}
                  className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1"
                >
                  <span>Full Ledger</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto border border-[#E4E4E7] rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3.5 font-semibold">Security</th>
                      <th className="py-3 px-3.5 font-semibold text-right">Quantity</th>
                      <th className="py-3 px-3.5 font-semibold text-right">Total ACB (CAD)</th>
                      <th className="py-3 px-3.5 font-semibold text-right">ACB / Unit (CAD)</th>
                      <th className="py-3 px-3.5 font-semibold text-center">Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] font-mono">
                    {Array.from(engineOutput.securityBalances.entries())
                      .filter(([_, b]) => d(b.quantity).gt(0))
                      .map(([secId, b]) => (
                        <tr key={secId} className="hover:bg-[#F9FAFB] transition-colors">
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-[#18181B]">{b.symbol}</div>
                            <div className="text-[11px] text-[#71717A] font-sans truncate max-w-[180px]">{b.name}</div>
                          </td>
                          <td className="py-3 px-3.5 text-right font-medium text-[#18181B]">
                            {formatShares(b.quantity)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-semibold text-[#059669]">
                            {formatCad(b.totalAcbCad)}
                          </td>
                          <td className="py-3 px-3.5 text-right text-[#18181B]">
                            {formatCad(b.acbPerUnitCad)}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7] text-[10px]">
                              s. 47(1)
                            </span>
                          </td>
                        </tr>
                      ))}
                    {(Array.from(engineOutput.securityBalances.values()) as Array<{ quantity: string }>).filter(b => d(b.quantity).gt(0)).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#71717A] font-sans text-xs">
                          No active positions in the ACB pool. Import an Activity Flex statement or connect your IBKR token to calculate ACB.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 1 Col: Recent Realized Dispositions / Schedule 3 preview */}
            <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#18181B]">Recent Dispositions</h3>
                  <p className="text-xs text-[#71717A] mt-0.5">Schedule 3 capital gains audit line items</p>
                </div>
                <button
                  onClick={() => onNavigateToTab('reports')}
                  className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1"
                >
                  <span>Reports</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {filteredGains.slice(-5).reverse().map((rgl) => (
                  <div key={rgl.id} className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#18181B] font-mono">{rgl.symbol}</span>
                        <span className="text-[10px] text-[#71717A] font-mono">{rgl.dispositionDate}</span>
                      </div>
                      <div className="text-[11px] text-[#71717A] mt-0.5">
                        Sold {formatShares(rgl.quantityDisposed)} units • Proceeds {formatCad(rgl.netProceedsCad)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-bold font-mono ${
                        d(rgl.recognizedGainLossCad).gte(0) ? 'text-[#059669]' : 'text-[#DC2626]'
                      }`}>
                        {d(rgl.recognizedGainLossCad).gte(0) ? `+${formatCad(rgl.recognizedGainLossCad)}` : formatCad(rgl.recognizedGainLossCad)}
                      </div>
                      {rgl.isSuperficialLoss && (
                        <span className="inline-block px-1.5 py-0.2 rounded bg-[#F3E8FF] text-[#7E22CE] border border-[#DDD6FE] text-[9px] font-mono">
                          Superficial (Denied)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {filteredGains.length === 0 && (
                  <div className="py-8 text-center text-[#71717A] text-xs">
                    No realized dispositions found in this tax year.
                  </div>
                )}
              </div>

              {/* Trader Status / CRA Character Warning Card */}
              <div className="bg-[#F4F4F5] border border-[#E4E4E7] rounded-xl p-3.5 text-[11px] text-[#71717A] space-y-1">
                <div className="flex items-center gap-1.5 text-[#18181B] font-medium">
                  <Info className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  <span>CRA Tax Character Notice (ITA s. 9 vs s. 39)</span>
                </div>
                <p>
                  By default, dispositions are treated on <strong>capital account</strong> (Schedule 3). If you engage in high-frequency day trading, CRA may classify trading profits as <strong>business income</strong> (100% inclusion, mark-to-market).
                </p>
              </div>
            </div>

          </div>

        </>
      )}

    </div>
  );
};
