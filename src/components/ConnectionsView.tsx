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
  const [activeStepTab, setActiveStepTab] = useState<'ALL' | '1' | '2' | '3' | '4' | '5'>('ALL');

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
              <span>How to create the Activity Flex Query</span>
            </h3>
            <p className="text-xs text-[#71717A] mt-0.5 font-medium">
              Use Activity Flex Query only. There is no section named Executions. Executions is a choice inside Trades.
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
              onClick={() => setActiveStepTab('1')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === '1' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              1. Navigation
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('2')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === '2' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              2. Token & Query ID
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('3')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === '3' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              3. Delivery Config
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('4')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === '4' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              4. General Config
            </button>
            <button
              type="button"
              onClick={() => setActiveStepTab('5')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${activeStepTab === '5' ? 'bg-white text-[#18181B] font-bold shadow-2xs' : 'text-[#71717A] hover:text-[#18181B]'}`}
            >
              5. Sections
            </button>
          </div>
        </div>

        <div className="space-y-6 text-xs text-[#18181B]">
          
          {/* 1. Navigation & Overview */}
          {(activeStepTab === 'ALL' || activeStepTab === '1') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#2563EB] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[11px]">1</span>
                <span>Where to go in IBKR Client Portal</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] leading-relaxed pl-1">
                <li>Log in to IBKR Client Portal (<a href="https://www.interactivebrokers.com" target="_blank" rel="noreferrer" className="text-[#2563EB] underline hover:text-[#1D4ED8]">interactivebrokers.com</a>).</li>
                <li>Navigate to <strong>Performance & Reports → Flex Queries</strong> (Alternate path: <strong>Menu → Reporting → Flex Queries</strong>).</li>
                <li>Use <strong>Activity Flex Query</strong> only. There is no section named Executions. Executions is a choice inside Trades.</li>
              </ol>
            </div>
          )}

          {/* 2. Token & Query ID */}
          {(activeStepTab === 'ALL' || activeStepTab === '2') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#D97706] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[11px]">2</span>
                <span>Token & Query ID Setup</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 text-[#3F3F46] leading-relaxed pl-1">
                <li>
                  <strong>Token:</strong> Go to <strong>Flex Web Service Configuration</strong> → <strong>Current Token</strong> → set as <code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_TOKEN</code> on the server.
                </li>
                <li>
                  <strong>Query ID:</strong> The short numeric ID shown on your saved Activity query list (<code className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[#18181B] font-mono text-[11px]">IBKR_FLEX_QUERY_ID</code>).
                </li>
                <li>
                  <strong>Token expiry:</strong> Select the longest available duration (often 1 year). Default 6 hours breaks sync.
                </li>
              </ul>
            </div>
          )}

          {/* 3. Delivery Configuration */}
          {(activeStepTab === 'ALL' || activeStepTab === '3') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-[#2563EB] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[11px]">3</span>
                <span>Delivery Configuration</span>
              </div>

              <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl text-[#1D4ED8] text-[11px] font-medium leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#2563EB]" />
                <div>
                  <strong>Note:</strong> Skip email, FTP, sFTP, and encryption here. Those are a different Delivery screen and are not used by this connector.
                </div>
              </div>

              <div className="overflow-x-auto border border-[#E4E4E7] rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#18181B] font-semibold text-[11px]">
                      <th className="py-2.5 px-3 w-1/4">Field (IBKR label)</th>
                      <th className="py-2.5 px-3 w-1/3">Set to</th>
                      <th className="py-2.5 px-3">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] text-[11px] text-[#3F3F46]">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Accounts</td>
                      <td className="py-2.5 px-3 font-medium text-[#2563EB]">
                        Add/Edit Accounts → select every account to include (taxable margin/cash, TFSA, RRSP, FHSA, etc.)
                      </td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        App maps account type later. If an account is omitted, its history never syncs. (If you have only one account, Accounts can stay the default selected account.)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Models</td>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">
                        Optional (or All if they use IBKR models)
                      </td>
                      <td className="py-2.5 px-3">Models are not required for ACB.</td>
                    </tr>
                    <tr className="bg-[#EFF6FF]/30">
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Format</td>
                      <td className="py-2.5 px-3 font-bold text-[#1D4ED8]">XML</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        App’s Flex parser is XML-first. Do not pick CSV/Text for API sync.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Period</td>
                      <td className="py-2.5 px-3 font-bold text-[#18181B]">Last 365 Calendar Days</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        Saved default only. The app overrides dates on backfill (max 365 days per request).
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Multi-account / statement layout (if shown)</td>
                      <td className="py-2.5 px-3 font-bold text-[#18181B]">
                        One consolidated statement <span className="font-normal text-[#71717A]">(not ZIP of separate accounts)</span>
                      </td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        One XML is easier to parse. Same-taxpayer taxable accounts still share one ACB pool.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. General Configuration */}
          {(activeStepTab === 'ALL' || activeStepTab === '4') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-[#059669] font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[11px]">4</span>
                <span>General Configuration</span>
              </div>

              <div className="p-2.5 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl text-[#047857] text-[11px] font-medium">
                💡 Note: If a row is missing on your page, skip it.
              </div>

              <div className="overflow-x-auto border border-[#E4E4E7] rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[#18181B] font-semibold text-[11px]">
                      <th className="py-2.5 px-3 w-1/3">Field (IBKR label; wording may vary slightly)</th>
                      <th className="py-2.5 px-3 w-1/4">Set to</th>
                      <th className="py-2.5 px-3">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] text-[11px] text-[#3F3F46]">
                    <tr className="bg-[#ECFDF5]/30">
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Date Format</td>
                      <td className="py-2.5 px-3 font-bold text-[#047857]">yyyy-MM-dd <span className="font-normal text-[#71717A]">(or yyyyMMdd if that is the only ISO option)</span></td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        Unambiguous. Parser accepts both. Do not use M/d/yy.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Time Format</td>
                      <td className="py-2.5 px-3 font-bold text-[#18181B]">HH:mm:ss</td>
                      <td className="py-2.5 px-3">24-hour.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Date/Time Separator</td>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">single space <span className="font-normal text-[#71717A]">(if listed)</span></td>
                      <td className="py-2.5 px-3">Avoid commas.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Profit and Loss</td>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Default / as reported</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        Do not rely on IBKR FIFO P&L. Canadian ACB is calculated in this app.
                      </td>
                    </tr>
                    <tr className="bg-[#ECFDF5]/30">
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Include Canceled Trades</td>
                      <td className="py-2.5 px-3 font-bold text-[#047857]">Yes</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        Needed so cancellations (code Ca) can void the original fill.
                      </td>
                    </tr>
                    <tr className="bg-[#ECFDF5]/30">
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Include Currency Rates</td>
                      <td className="py-2.5 px-3 font-bold text-[#047857]">Yes</td>
                      <td className="py-2.5 px-3 leading-relaxed">
                        USD/CAD conversion. This is where FX lives — not a Conversion Details section.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Include Audit Trail Fields</td>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">No</td>
                      <td className="py-2.5 px-3">Not used.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-[#18181B]">Display Account Alias</td>
                      <td className="py-2.5 px-3 font-medium text-[#18181B]">Yes <span className="font-normal text-[#71717A]">(if listed)</span></td>
                      <td className="py-2.5 px-3">Helps map TFSA vs RRSP vs taxable.</td>
                    </tr>
                    <tr className="bg-[#FEF2F2]/40">
                      <td className="py-2.5 px-3 font-semibold text-[#991B1B]">Include Open/Closed lots or similar FIFO lot breakout</td>
                      <td className="py-2.5 px-3 font-bold text-[#DC2626]">No <span className="font-normal text-[#71717A]">(if listed)</span></td>
                      <td className="py-2.5 px-3 text-[#991B1B] leading-relaxed">
                        Lots are U.S. matching. We want executions only.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-[#F4F4F5] border border-[#E4E4E7] rounded-xl text-[#18181B] text-[11px] font-semibold leading-relaxed">
                ➡️ After Delivery + General are set, you still must configure Sections (Trades → Executions, etc.), then Continue → Create.
              </div>
            </div>
          )}

          {/* 5. Section Instructions */}
          {(activeStepTab === 'ALL' || activeStepTab === '5') && (
            <div className="bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#7C3AED] font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] flex items-center justify-center text-[11px]">5</span>
                  <span>Inside-the-Panel Instructions for Each Section</span>
                </div>
              </div>

              <div className="bg-white border border-[#E4E4E7] rounded-xl p-3.5 space-y-1.5 shadow-2xs text-[11px]">
                <div className="font-bold text-[#18181B]">General Section Workflow:</div>
                <ol className="list-decimal list-inside space-y-1 text-[#3F3F46]">
                  <li>In Sections, click the section name (a panel/dialog opens).</li>
                  <li>Follow the inside-the-panel steps below.</li>
                  <li>Click <strong>Save</strong> at the bottom of THAT panel (not Create yet).</li>
                  <li>Repeat for the next section.</li>
                  <li>After every required section is saved, click <strong>Continue</strong>, then <strong>Create</strong>.</li>
                </ol>
              </div>

              <div className="p-3 bg-[#ECFEFF] border border-[#A5F3FC] rounded-xl text-[#0891B2] text-[11px] font-medium leading-relaxed">
                💡 Currency conversion is included automatically as FX Rate to Base on Trades and Cash Transactions.
              </div>

              <div className="space-y-4 text-[11px] text-[#27272A] leading-relaxed">
                
                {/* Trades */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Trades</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Sections → Trades.</li>
                    <li>At the top of the panel, find the detail / options dropdown.</li>
                    <li>Choose <strong>Executions</strong> (not Orders, not Closed Lots / Lots).</li>
                    <li>Tick <strong>Select All</strong>.</li>
                    <li>Confirm these fields are included if you see them: Trade ID, Date/Time, Buy/Sell, Quantity, Trade Price, Proceeds, IB Commission, Taxes, Currency, FX Rate to Base, Asset Class, Symbol, Description, Conid, ISIN, Underlying Symbol, Put/Call, Strike, Expiry, Multiplier, Code, Open/Close, Order Time, Transaction Type, Notes/Codes.</li>
                    <li>Do not also enable Orders or Closed Lots on this query.</li>
                    <li>Save the panel.</li>
                  </ol>
                </div>

                {/* Cash Transactions */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Cash Transactions</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Cash Transactions.</li>
                    <li>Select All.</li>
                    <li>Confirm: Date, Type, Amount, Currency, FX Rate to Base, Symbol, Description, Conid, Transaction ID, Code.</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Corporate Actions */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Corporate Actions</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Corporate Actions.</li>
                    <li>Select All.</li>
                    <li>Confirm: Date/Time, Type, Symbol, Description, Quantity, Amount, Proceeds, Currency, FX Rate to Base, Conid, Code, Transaction ID.</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Transfers */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Transfers</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Transfers.</li>
                    <li>If a detail dropdown exists, choose Transfer (not Lots).</li>
                    <li>Select All.</li>
                    <li>Confirm: Date, Direction/Type, Symbol, Quantity, Currency, Account ID, and any Target/From Account fields.</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Open Positions */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Open Positions</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Open Positions.</li>
                    <li>If a dropdown offers Summary vs Lot, choose <strong>Summary</strong> (not Lot).</li>
                    <li>Select All.</li>
                    <li>Confirm: Symbol, Quantity, Currency, Conid, Mark Price, Position Value, Cost Basis / Cost Price.</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Account Information */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Account Information</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Account Information.</li>
                    <li>Select All (Account ID, Account Alias, Currency, Account Type/Title).</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Financial Instrument Information */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded border border-[#BFDBFE] text-[10px]">REQUIRED</span>
                    <span>Financial Instrument Information</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>Click Financial Instrument Information (sometimes Securities Info).</li>
                    <li>Select All (Symbol, Conid, ISIN, CUSIP, Asset Class, Multiplier, Underlying, Put/Call, Strike, Expiry, Listing Exchange).</li>
                    <li>Save.</li>
                  </ol>
                </div>

                {/* Option Exercises, Assignments and Expirations */}
                <div className="bg-white border border-[#E4E4E7] p-3.5 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-[#18181B] text-xs">
                    <span className="px-1.5 py-0.5 bg-[#FEF3C7] text-[#D97706] rounded border border-[#FDE68A] text-[10px]">RECOMMENDED</span>
                    <span>Option Exercises, Assignments and Expirations</span>
                  </div>
                  <p className="text-[11px] text-[#71717A]">
                    IBKR may label this <strong>Option EAE</strong> or <strong>Option Exercises, Assignments and Expirations</strong>.
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[#3F3F46] pl-1">
                    <li>If you see it, click it → Select All → Save.</li>
                    <li>If you do not see it, skip. Do not hunt for another name.</li>
                  </ol>
                </div>

              </div>
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
