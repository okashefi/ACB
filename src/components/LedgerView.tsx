import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  Info,
  Calendar,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle,
  Split,
  DollarSign,
  HelpCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CalculationEngineOutput, AcbLedgerEntry, SecurityMaster } from '../types/tax';
import { formatCad, formatShares, formatRate } from '../engine/decimal';

interface LedgerViewProps {
  engineOutput: CalculationEngineOutput;
  securities: SecurityMaster[];
  selectedTaxYear: number | 'ALL';
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  engineOutput,
  securities,
  selectedTaxYear,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSecurity, setSelectedSecurity] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [activeEntryDetails, setActiveEntryDetails] = useState<AcbLedgerEntry | null>(null);

  // Available unique securities in ledger
  const uniqueSecurities = useMemo(() => {
    const map = new Map<string, string>();
    engineOutput.ledger.forEach((l) => map.set(l.securityId, l.symbol));
    return Array.from(map.entries());
  }, [engineOutput.ledger]);

  // Filter ledger entries
  const filteredEntries = useMemo(() => {
    return engineOutput.ledger.filter((entry) => {
      // Filter by tax year
      if (selectedTaxYear !== 'ALL') {
        const yr = parseInt(entry.date.substring(0, 4), 10);
        if (yr !== selectedTaxYear) return false;
      }

      // Filter by security
      if (selectedSecurity !== 'ALL' && entry.securityId !== selectedSecurity) {
        return false;
      }

      // Filter by type
      if (selectedType !== 'ALL') {
        if (selectedType === 'BUYS' && !entry.transactionType.includes('BUY') && entry.transactionType !== 'OPENING_BALANCE' && entry.transactionType !== 'TRANSFER_IN') return false;
        if (selectedType === 'SELLS' && !entry.transactionType.includes('SELL') && entry.transactionType !== 'TRANSFER_OUT') return false;
        if (selectedType === 'CA' && !entry.transactionType.includes('SPLIT') && !entry.transactionType.includes('MERGER') && !entry.transactionType.includes('SPINOFF')) return false;
        if (selectedType === 'ROC' && entry.transactionType !== 'RETURN_OF_CAPITAL') return false;
      }

      // Search query (symbol or description)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSym = entry.symbol.toLowerCase().includes(q);
        const matchesDesc = entry.description.toLowerCase().includes(q);
        const matchesRule = entry.statutoryRule.toLowerCase().includes(q);
        if (!matchesSym && !matchesDesc && !matchesRule) return false;
      }

      return true;
    });
  }, [engineOutput.ledger, selectedTaxYear, selectedSecurity, selectedType, searchQuery]);

  // Selected security card balance
  const activeSecurityBalance = selectedSecurity !== 'ALL' ? engineOutput.securityBalances.get(selectedSecurity) : null;

  // Export Ledger to CSV
  const handleExportCsv = () => {
    const headers = ['Date', 'Symbol', 'Type', 'Description', 'Qty Change', 'Running Qty', 'Cost Change (CAD)', 'Running Total ACB (CAD)', 'Running ACB/Unit (CAD)', 'Realized Gain/Loss (CAD)', 'FX Rate', 'FX Source', 'Statutory Rule'];
    const rows = filteredEntries.map((e) => [
      e.date,
      e.symbol,
      e.transactionType,
      `"${e.description.replace(/"/g, '""')}"`,
      e.quantityChange,
      e.runningQuantity,
      e.costChangeCad,
      e.runningTotalAcbCad,
      e.runningAcbPerUnitCad,
      e.realizedGainLossCad ?? '',
      e.fxRateUsed,
      e.fxRateSource,
      `"${e.statutoryRule.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Canadian_ACB_Ledger_${selectedTaxYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="ledger-view-container" className="space-y-6">
      
      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2563EB]" />
            <span>Adjusted Cost Base (ACB) Transaction Ledger</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            Audit-ready running average cost pools under <strong>ITA s. 47(1)</strong> with Bank of Canada FX conversions.
          </p>
        </div>

        <button
          id="btn-export-ledger-csv"
          onClick={handleExportCsv}
          className="px-3.5 py-2 bg-white hover:bg-[#F4F4F5] text-[#18181B] border border-[#E4E4E7] rounded-xl text-xs font-medium transition-colors flex items-center gap-2 shadow-2xs shrink-0"
        >
          <Download className="w-4 h-4 text-[#71717A]" />
          <span>Export Ledger (CSV)</span>
        </button>
      </div>

      {/* Security Quick Filter Pill Selector */}
      {activeSecurityBalance && (
        <div className="bg-white border border-[#BFDBFE] rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#18181B] font-mono">{activeSecurityBalance.symbol}</span>
              <span className="text-xs text-[#71717A] font-medium">{activeSecurityBalance.name}</span>
              <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] text-[10px] font-mono border border-[#BFDBFE]">
                ITA s. 47 Pool
              </span>
            </div>
            <p className="text-xs text-[#71717A] mt-1">
              Currently holding <strong>{formatShares(activeSecurityBalance.quantity)} units</strong> across all non-registered accounts.
            </p>
          </div>

          <div className="flex items-center gap-4 text-right font-mono">
            <div>
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Total Pool ACB</div>
              <div className="text-base font-bold text-[#059669]">{formatCad(activeSecurityBalance.totalAcbCad)}</div>
            </div>
            <div className="border-l border-[#E4E4E7] pl-4">
              <div className="text-[10px] text-[#71717A] uppercase font-sans font-semibold">Average ACB / Unit</div>
              <div className="text-base font-bold text-[#18181B]">{formatCad(activeSecurityBalance.acbPerUnitCad)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-ledger-search"
            type="text"
            placeholder="Search symbol, note, rule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F9FAFB] text-[#18181B] text-xs rounded-xl pl-9 pr-3 py-2 border border-[#E4E4E7] focus:outline-none focus:border-[#3B82F6] focus:bg-white placeholder-[#A1A1AA] transition-colors"
          />
        </div>

        {/* Security Dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            id="filter-security-select"
            value={selectedSecurity}
            onChange={(e) => setSelectedSecurity(e.target.value)}
            className="bg-[#F9FAFB] text-[#18181B] text-xs rounded-xl px-3 py-2 border border-[#E4E4E7] focus:outline-none focus:border-[#3B82F6] cursor-pointer font-mono shadow-2xs"
          >
            <option value="ALL">All Securities ({uniqueSecurities.length})</option>
            {uniqueSecurities.map(([secId, sym]) => (
              <option key={secId} value={secId}>
                {sym}
              </option>
            ))}
          </select>

          {/* Type Dropdown */}
          <select
            id="filter-type-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#F9FAFB] text-[#18181B] text-xs rounded-xl px-3 py-2 border border-[#E4E4E7] focus:outline-none focus:border-[#3B82F6] cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Transactions</option>
            <option value="BUYS">Acquisitions (Buys/DRIPs)</option>
            <option value="SELLS">Dispositions (Sells)</option>
            <option value="CA">Corporate Actions</option>
            <option value="ROC">Return of Capital</option>
          </select>
        </div>

        <div className="text-xs text-[#71717A] font-mono">
          Showing <strong>{filteredEntries.length}</strong> events
        </div>
      </div>

      {/* Hero Table */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table id="main-acb-ledger-table" className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#71717A] uppercase tracking-wider text-[10px] font-mono">
                <th className="py-3 px-3.5 font-semibold">Date</th>
                <th className="py-3 px-3.5 font-semibold">Security</th>
                <th className="py-3 px-3.5 font-semibold">Event</th>
                <th className="py-3 px-3.5 font-semibold text-right">Qty Delta</th>
                <th className="py-3 px-3.5 font-semibold text-right">Running Qty</th>
                <th className="py-3 px-3.5 font-semibold text-right">Cost Delta (CAD)</th>
                <th className="py-3 px-3.5 font-semibold text-right">Running ACB (CAD)</th>
                <th className="py-3 px-3.5 font-semibold text-right">ACB / Unit (CAD)</th>
                <th className="py-3 px-3.5 font-semibold text-right">Gain / Loss</th>
                <th className="py-3 px-3.5 font-semibold text-center">FX Rate</th>
                <th className="py-3 px-3.5 font-semibold text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] font-mono">
              {filteredEntries.map((entry) => {
                const isBuy = entry.quantityChange > 0;
                const isSell = entry.quantityChange < 0;
                const hasGain = entry.realizedGainLossCad !== undefined && entry.realizedGainLossCad >= 0;
                const hasLoss = entry.realizedGainLossCad !== undefined && entry.realizedGainLossCad < 0;

                return (
                  <tr
                    key={entry.id}
                    onClick={() => setActiveEntryDetails(entry)}
                    className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                  >
                    {/* Date */}
                    <td className="py-3 px-3.5 text-[#18181B] whitespace-nowrap">{entry.date}</td>

                    {/* Symbol */}
                    <td className="py-3 px-3.5 font-bold text-[#18181B]">{entry.symbol}</td>

                    {/* Event badge & Description */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          isBuy ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                          : isSell ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                          : 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
                        }`}>
                          {entry.transactionType}
                        </span>
                        <span className="text-[11px] text-[#71717A] font-sans truncate max-w-[200px]" title={entry.description}>
                          {entry.description}
                        </span>
                      </div>
                    </td>

                    {/* Qty Delta */}
                    <td className={`py-3 px-3.5 text-right font-medium ${isBuy ? 'text-[#059669]' : isSell ? 'text-[#DC2626]' : 'text-[#71717A]'}`}>
                      {entry.quantityChange > 0 ? `+${formatShares(entry.quantityChange)}` : formatShares(entry.quantityChange)}
                    </td>

                    {/* Running Qty */}
                    <td className="py-3 px-3.5 text-right font-semibold text-[#18181B]">
                      {formatShares(entry.runningQuantity)}
                    </td>

                    {/* Cost Delta CAD */}
                    <td className={`py-3 px-3.5 text-right ${entry.costChangeCad >= 0 ? 'text-[#059669]' : 'text-[#71717A]'}`}>
                      {entry.costChangeCad >= 0 ? `+${formatCad(entry.costChangeCad)}` : formatCad(entry.costChangeCad)}
                    </td>

                    {/* Running Total ACB CAD */}
                    <td className="py-3 px-3.5 text-right font-bold text-[#059669]">
                      {formatCad(entry.runningTotalAcbCad)}
                    </td>

                    {/* Running ACB Per Unit CAD */}
                    <td className="py-3 px-3.5 text-right text-[#18181B]">
                      {formatCad(entry.runningAcbPerUnitCad)}
                    </td>

                    {/* Realized Capital Gain / Loss */}
                    <td className="py-3 px-3.5 text-right">
                      {entry.realizedGainLossCad !== undefined ? (
                        <span className={`font-bold ${hasGain ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                          {hasGain ? `+${formatCad(entry.realizedGainLossCad)}` : formatCad(entry.realizedGainLossCad)}
                        </span>
                      ) : (
                        <span className="text-[#D4D4D8]">—</span>
                      )}
                    </td>

                    {/* FX Rate */}
                    <td className="py-3 px-3.5 text-center text-[10px] text-[#71717A]">
                      <div>{formatRate(entry.fxRateUsed)}</div>
                      <div className="text-[9px] text-[#A1A1AA] font-sans">{entry.originalCurrency}</div>
                    </td>

                    {/* Details icon */}
                    <td className="py-3 px-3.5 text-center text-[#A1A1AA] hover:text-[#2563EB]">
                      <ChevronRight className="w-4 h-4 inline" />
                    </td>
                  </tr>
                );
              })}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#71717A] font-sans text-xs">
                    No ledger transactions match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Detail Drawer Modal if entry clicked */}
      {activeEntryDetails && (
        <div className="fixed inset-0 z-50 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 text-[#18181B] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#2563EB]" />
                <h3 className="font-bold text-sm text-[#18181B]">Ledger Event Audit Details</h3>
              </div>
              <button
                onClick={() => setActiveEntryDetails(null)}
                className="text-[#71717A] hover:text-[#18181B] text-xs px-2.5 py-1 bg-[#F4F4F5] hover:bg-[#E4E4E7] rounded-lg transition-colors"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2 bg-[#F9FAFB] p-3.5 rounded-xl border border-[#E4E4E7]">
                <div>
                  <span className="text-[#71717A] font-sans">Date:</span> {activeEntryDetails.date}
                </div>
                <div>
                  <span className="text-[#71717A] font-sans">Symbol:</span> <strong>{activeEntryDetails.symbol}</strong>
                </div>
                <div>
                  <span className="text-[#71717A] font-sans">Event:</span> {activeEntryDetails.transactionType}
                </div>
                <div>
                  <span className="text-[#71717A] font-sans">Statutory Basis:</span> <span className="text-[#2563EB] font-semibold">{activeEntryDetails.statutoryRule}</span>
                </div>
              </div>

              <div className="space-y-1.5 font-sans text-[#18181B]">
                <div className="font-semibold text-xs text-[#18181B]">Description:</div>
                <p className="bg-[#F9FAFB] p-3 rounded-xl border border-[#E4E4E7] text-[11px] text-[#71717A] leading-relaxed">
                  {activeEntryDetails.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 font-mono">
                <div className="p-3 rounded-xl bg-[#F4F4F5] border border-[#E4E4E7]">
                  <div className="text-[10px] text-[#71717A] font-sans">Resulting Total ACB</div>
                  <div className="text-sm font-bold text-[#059669]">{formatCad(activeEntryDetails.runningTotalAcbCad)}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F4F4F5] border border-[#E4E4E7]">
                  <div className="text-[10px] text-[#71717A] font-sans">Resulting ACB / Unit</div>
                  <div className="text-sm font-bold text-[#18181B]">{formatCad(activeEntryDetails.runningAcbPerUnitCad)}</div>
                </div>
              </div>

              {activeEntryDetails.notes && (
                <div className="font-sans text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] p-3 rounded-xl">
                  <strong>CRA Note:</strong> {activeEntryDetails.notes}
                </div>
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setActiveEntryDetails(null)}
                className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-medium shadow-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
