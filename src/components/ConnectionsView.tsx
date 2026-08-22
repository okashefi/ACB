import React, { useState } from 'react';
import {
  Database,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  Layers,
  Calendar,
} from 'lucide-react';
import { FlexConnectorConfig, OpenPosition, ReconciliationBreak } from '../types/tax';
import { formatCad, formatShares } from '../engine/decimal';

interface ConnectionsViewProps {
  flexConfig: FlexConnectorConfig;
  onSaveConfig: (config: Partial<FlexConnectorConfig>) => void;
  onTriggerSync: (isBackfill?: boolean) => void;
  isSyncing: boolean;
  reconciliationBreaks: ReconciliationBreak[];
  onLoadSandbox: () => void;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({
  flexConfig,
  onSaveConfig,
  onTriggerSync,
  isSyncing,
  reconciliationBreaks,
  onLoadSandbox,
}) => {
  const [tokenInput, setTokenInput] = useState(flexConfig.token || '');
  const [queryIdInput, setQueryIdInput] = useState(flexConfig.queryId || 'AF_CANADIAN_ACB');
  const [syncInterval, setSyncInterval] = useState(flexConfig.syncInterval || 'daily');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      token: tokenInput,
      tokenLast4: tokenInput ? tokenInput.slice(-4) : '',
      queryId: queryIdInput,
      syncInterval: syncInterval as any,
      status: tokenInput ? 'CONNECTED' : 'UNCONFIGURED',
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const isDemo = !flexConfig.token || flexConfig.token.startsWith('DEMO_') || flexConfig.token === 'DEMO_SANDBOX_TOKEN';

  return (
    <div id="connections-view-container" className="max-w-5xl mx-auto space-y-6">
      
      {/* Top Header */}
      <div>
        <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
          <Database className="w-5 h-5 text-[#2563EB]" />
          <span>Interactive Brokers (IBKR) Flex Web Service Connector</span>
        </h2>
        <p className="text-xs text-[#71717A] mt-0.5">
          Automated API-first synchronization of multi-year trades, cash distributions, option exercises, and corporate actions directly from IBKR.
        </p>
      </div>

      {/* Guided Step-by-Step Checklist */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider text-[11px]">
          IBKR Flex Web Service Setup Checklist
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          
          <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E4E4E7] space-y-1.5">
            <div className="flex items-center gap-2 text-[#059669] font-bold">
              <span className="w-5 h-5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[10px]">1</span>
              <span>Create Activity Query</span>
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed">
              Log into IBKR Portal → <strong>Performance & Reports → Flex Queries</strong>. Create an <strong>Activity Flex Query</strong> with Executions, Corporate Actions (Detail), Cash Transactions, and Open Positions.
            </p>
          </div>

          <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E4E4E7] space-y-1.5">
            <div className="flex items-center gap-2 text-[#D97706] font-bold">
              <span className="w-5 h-5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[10px]">2</span>
              <span>Enable Web Service Token</span>
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed">
              Click the gear icon next to <strong>Flex Web Service Configuration</strong>. Generate a token. <strong>Important:</strong> IBKR default is 6 hours; set expiration to the maximum allowed (1 year) to prevent sync breaks.
            </p>
          </div>

          <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E4E4E7] space-y-1.5">
            <div className="flex items-center gap-2 text-[#2563EB] font-bold">
              <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[10px]">3</span>
              <span>Connect & Backfill</span>
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed">
              Paste your Token and Query ID below. Run <strong>Backfill</strong> to pull all available historical years (chunked ≤ 365 days).
            </p>
          </div>

        </div>
      </div>

      {/* Form: Credentials & Sync Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Configuration Form */}
        <div className="lg:col-span-2 bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
            <h3 className="text-sm font-semibold text-[#18181B] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#2563EB]" />
              <span>Connector Configuration</span>
            </h3>
            {flexConfig.status === 'CONNECTED' && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-[#059669] bg-[#ECFDF5] px-2.5 py-0.5 rounded-md border border-[#A7F3D0]">
                <CheckCircle2 className="w-3 h-3" />
                <span>Connected</span>
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="block text-[#18181B] font-medium mb-1">
                Flex Web Service Token <span className="text-[#71717A] font-normal">(Read-only reporting token)</span>
              </label>
              <input
                id="input-flex-token"
                type="password"
                placeholder="e.g. 12345678901234567890"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:outline-none focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
              <p className="text-[10px] text-[#A1A1AA] mt-1">
                Tokens are stored locally encrypted and never sent to third parties.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#18181B] font-medium mb-1">
                  Activity Query ID
                </label>
                <input
                  id="input-flex-query-id"
                  type="text"
                  placeholder="e.g. 123456"
                  value={queryIdInput}
                  onChange={(e) => setQueryIdInput(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:outline-none focus:border-[#3B82F6] focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-[#18181B] font-medium mb-1">
                  Automatic Sync Interval
                </label>
                <select
                  id="select-sync-interval"
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(e.target.value as any)}
                  className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#3B82F6] cursor-pointer shadow-2xs"
                >
                  <option value="daily">Daily (Overnight with 3-day overlap)</option>
                  <option value="weekly">Weekly</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                id="btn-save-flex-credentials"
                className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                {isSaved ? 'Saved Successfully!' : 'Save Credentials'}
              </button>

              <button
                type="button"
                id="btn-load-sandbox-data"
                onClick={onLoadSandbox}
                className="px-3 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE] rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Realistic Sandbox Ledger</span>
              </button>
            </div>
          </form>

          {/* Sync Trigger Actions */}
          <div className="border-t border-[#E4E4E7] pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-[#71717A]">
              Backfill pulls multi-year history in ≤ 365-day slices. Incremental sync updates the last 3 days.
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-trigger-backfill"
                onClick={() => onTriggerSync(true)}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-white hover:bg-[#F4F4F5] text-[#18181B] border border-[#E4E4E7] rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5 text-[#71717A]" />
                <span>Full Multi-Year Backfill</span>
              </button>

              <button
                id="btn-trigger-incremental-sync"
                onClick={() => onTriggerSync(false)}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Reconciliation & Position Break Checker */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#18181B]">Live Positions Reconciliation</h3>
            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
              reconciliationBreaks.length === 0 ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]' : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
            }`}>
              {reconciliationBreaks.length === 0 ? 'All Matched' : `${reconciliationBreaks.length} Discrepancies`}
            </span>
          </div>

          <p className="text-xs text-[#71717A] leading-relaxed">
            Compares calculated share balances against IBKR <strong>Open Positions</strong> reported in Flex.
          </p>

          <div className="space-y-2">
            {reconciliationBreaks.map((b) => (
              <div key={b.securityId} className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E4E4E7] space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#18181B]">{b.symbol}</span>
                  <span className="text-[#DC2626] text-[10px]">Break: {b.quantityDiscrepancy} units</span>
                </div>
                <div className="text-[11px] text-[#71717A] font-sans">
                  Calculated: {b.calculatedQuantity} vs Broker: {b.brokerReportedQuantity}
                </div>
              </div>
            ))}

            {reconciliationBreaks.length === 0 && (
              <div className="p-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-center text-[#059669] text-xs space-y-1">
                <CheckCircle2 className="w-5 h-5 mx-auto text-[#059669]" />
                <div className="font-semibold text-[#065F46]">100% Quantity Matched</div>
                <p className="text-[11px] text-[#047857]">All calculated quantities align perfectly with IBKR Open Positions.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
