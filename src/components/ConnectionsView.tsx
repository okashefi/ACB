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
  AlertTriangle,
  FileCode,
  Check,
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
  const [queryIdInput, setQueryIdInput] = useState(flexConfig.queryId || 'AF_CANADIAN_ACB');
  const [syncInterval, setSyncInterval] = useState(flexConfig.syncInterval || 'daily');
  const [isSaved, setIsSaved] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState<'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'>('ALL');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      queryId: queryIdInput,
      syncInterval: syncInterval as any,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

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

      {/* Guided Step-by-Step Setup Guide */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E4E7] pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              <span>IBKR Client Portal Flex Web Service Setup Guide</span>
            </h3>
            <p className="text-xs text-[#71717A] mt-0.5">
              Follow these exact steps in IBKR Client Portal to configure your reporting token and Activity Flex Query.
            </p>
          </div>
          
          <div className="flex items-center gap-1 bg-[#F4F4F5] p-1 rounded-xl text-[11px] font-medium shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveStepTab('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'ALL' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              Full Guide
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('A')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'A' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              A. Navigation
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('B')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'B' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              B. Token
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('C')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'C' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              C. Query
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('D')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'D' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              D. Sections
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('E')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'E' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              E. Query ID
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('F')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === 'F' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              F. Pitfalls
            </button>
          </div>
        </div>

        <div className="space-y-6 text-xs text-[#18181B]">
          
          {/* A. Where to go */}
          {(activeStepTab === 'ALL' || activeStepTab === 'A') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#2563EB] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[11px]">A</span>
                <span>Where to go in IBKR Client Portal</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] leading-relaxed pl-1">
                <li>Log in to IBKR Client Portal (<a href="https://www.interactivebrokers.com" target="_blank" rel="noreferrer" className="text-[#2563EB] underline hover:text-[#1D4ED8]">interactivebrokers.com</a>).</li>
                <li>Navigate to <strong>Performance & Reports → Flex Queries</strong> (Alternate path: <strong>Menu → Reporting → Flex Queries</strong>).</li>
                <li>Use <strong>Activity Flex Query</strong> only. Do <strong>not</strong> create a Trade Confirmation Flex Query.</li>
              </ol>
            </div>
          )}

          {/* B. Token (Flex Web Service) */}
          {(activeStepTab === 'ALL' || activeStepTab === 'B') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#D97706] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[11px]">B</span>
                <span>Token (Flex Web Service Setup)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-[#3F3F46] leading-relaxed pl-1">
                <li>Open <strong>Flex Web Service Configuration</strong> (click the gear icon on the Flex Queries page).</li>
                <li>Set status to <strong>Active</strong> and save.</li>
                <li>Click <strong>Generate New Token</strong>.</li>
                <li>
                  <strong>Should Expire After:</strong> Choose the longest period available (often <strong>1 year</strong>).
                  <span className="block mt-0.5 text-[#B45309] font-medium bg-[#FEF3C7]/60 px-2 py-0.5 rounded border border-[#FDE68A] text-[11px]">
                    ⚠️ Warning: The IBKR default is 6 hours and will break automated sync if left unchanged.
                  </span>
                </li>
                <li>Leave <strong>Valid For IP Address</strong> blank unless you explicitly know this application's public server IP address.</li>
                <li>
                  Copy <strong>Current Token</strong> → store strictly as server environment variable <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_TOKEN</code> (never in localStorage or git repositories).
                </li>
                <li className="text-[#B45309]">
                  <em>Note: Generating a new token invalidates any previously generated token immediately.</em>
                </li>
              </ol>
            </div>
          )}

          {/* C. Create the Activity Flex Query */}
          {(activeStepTab === 'ALL' || activeStepTab === 'C') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#059669] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[11px]">C</span>
                <span>Create the Activity Flex Query</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] leading-relaxed pl-1">
                <li>Next to Activity Flex Query, click <strong>+</strong> / <strong>Create</strong>.</li>
                <li><strong>Name:</strong> <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">Canadian ACB — full activity</code></li>
                <li><strong>Format:</strong> <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">XML</code></li>
                <li><strong>Period:</strong> <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">Last 365 Calendar Days</code> (the API automatically overrides dates during historical backfill calls).</li>
                <li><strong>Include Currency Rates:</strong> Set to <strong>Yes</strong> if the toggle exists.</li>
                <li><strong>Accounts:</strong> Include all desired accounts (Taxable, TFSA, RRSP, etc.). Account mapping and tax classification happen inside this application.</li>
              </ol>
            </div>
          )}

          {/* D. Sections — correct IBKR names */}
          {(activeStepTab === 'ALL' || activeStepTab === 'D') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#7C3AED] font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] flex items-center justify-center text-[11px]">D</span>
                  <span>Required Sections — Correct IBKR Names & Settings</span>
                </div>
              </div>

              <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-[#991B1B] text-[11px] leading-snug">
                <strong>Crucial IBKR Note:</strong> Do <strong>not</strong> look for a section named "Executions". Executions is the detail level setting inside the <strong>Trades</strong> section panel!
              </div>

              <p className="text-[11px] text-[#71717A]">
                For each section listed below: click the section name → <strong>Select All</strong> fields → <strong>Save</strong> on that panel.
              </p>

              <div className="overflow-x-auto border border-[#E4E4E7] rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#18181B] font-semibold text-[11px]">
                      <th className="py-2.5 px-3 w-1/3">IBKR Section to Click</th>
                      <th className="py-2.5 px-3">Instruction Inside the Panel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] text-[11px] text-[#3F3F46]">
                    <tr className="bg-[#EFF6FF]/40">
                      <td className="py-2.5 px-3 font-bold text-[#1D4ED8]">Trades</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        Set detail level to <strong>Execution</strong> (usually default). Click <strong>Select All</strong> fields. Do <strong>not</strong> also select <em>Orders</em> or <em>Closed Lots</em> (to avoid duplicate fill records).
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Cash Transactions</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Corporate Actions</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Transfers</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Open Positions</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Account Information</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Financial Instrument Information</td>
                      <td className="py-2.5 px-3">Select All fields.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Option Exercises, Assignments and Expirations</td>
                      <td className="py-2.5 px-3">Select All fields (wording may vary slightly).</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Conversion Details or FX / Currency Conversions</td>
                      <td className="py-2.5 px-3">Select All fields if listed.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="text-[11px] text-[#71717A] leading-relaxed">
                <em>Note: If a section is not present on your IBKR account, skip it. An empty section returns OK; omitting a section entirely from configuration causes a setup error.</em>
                <br />
                When finished selecting sections, click <strong>Continue</strong> → <strong>Create</strong>.
              </div>
            </div>
          )}

          {/* E. Query ID */}
          {(activeStepTab === 'ALL' || activeStepTab === 'E') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#0891B2] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#ECFEFF] border border-[#A5F3FC] flex items-center justify-center text-[11px]">E</span>
                <span>Query ID & Connecting</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] leading-relaxed pl-1">
                <li>On the Flex Queries list, your saved Activity query displays a short numeric <strong>Query ID</strong> (e.g. <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">123456</code>).</li>
                <li>This Query ID is <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_QUERY_ID</code>. It is distinct from the long alphanumeric Web Service Token.</li>
                <li>
                  In this application:
                  <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5 text-[11px]">
                    <li>Token → set in server environment file (<code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_TOKEN</code>)</li>
                    <li>Query ID → enter in the <strong>Activity Query ID</strong> field below (<code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_QUERY_ID</code>)</li>
                  </ul>
                </li>
                <li>Click <strong>Full Multi-Year Backfill</strong> below to perform historical synchronization across all available years.</li>
              </ol>
            </div>
          )}

          {/* F. Common mistakes */}
          {(activeStepTab === 'ALL' || activeStepTab === 'F') && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#DC2626] font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                <span>Common IBKR Setup Mistakes to Avoid</span>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-[#991B1B] leading-relaxed pt-1">
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>No Executions Row:</strong> There is no top-level Executions section; it is the detail level setting inside <strong>Trades</strong>.</span>
                </li>
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>Query Type:</strong> Must be an <strong>Activity Flex Query</strong>, not a Trade Confirmation Flex Query.</span>
                </li>
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>Token vs Query ID:</strong> Do not swap the long token and short numeric Query ID.</span>
                </li>
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>Token Expiry:</strong> Do not leave token expiry at 6 hours; change it to 1 year to prevent sync breaks.</span>
                </li>
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>Duplicate Fills:</strong> Under Trades, do not add <em>Orders</em> or <em>Closed Lots</em> alongside Executions.</span>
                </li>
                <li className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-[#FCA5A5]/40">
                  <span className="font-bold shrink-0">•</span>
                  <span><strong>Security:</strong> Never commit your token or credentials to GitHub or public repositories.</span>
                </li>
              </ul>
            </div>
          )}

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
              {flexConfig.tokenLast4 ? (
                <div className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono flex items-center justify-between">
                   <span>••••••••••••{flexConfig.tokenLast4}</span>
                   <button type="button" onClick={() => onSaveConfig({ tokenLast4: '', token: '' })} className="text-xs text-[#DC2626] font-sans">Clear</button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="w-full bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-3 py-2 text-xs leading-relaxed">
                     For security, please configure your Token in the server's <strong>.env</strong> file (<code className="font-mono bg-yellow-100/70 px-1 py-0.5 rounded">IBKR_FLEX_TOKEN</code>). 
                     Tokens are never stored in localStorage in plaintext or committed to repositories. 
                     <br/><br/>
                     <em>Warning: IBKR Flex Tokens expire! The default expiry is 6 hours; set expiration to 1 year in Client Portal to prevent sync breaks. Generating a new token invalidates the old one.</em>
                  </div>
                </div>
              )}
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
