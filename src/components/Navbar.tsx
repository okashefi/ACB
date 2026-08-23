import React from 'react';
import {
  Layers,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  CheckCircle2,
  Database,
  Building2,
  ListTodo,
  TestTube2,
  PlusCircle,
  UploadCloud,
  Settings,
} from 'lucide-react';
import { FlexConnectorConfig } from '../types/tax';

export type ActiveTab =
  | 'dashboard'
  | 'ledger'
  | 'review'
  | 'connector'
  | 'reports'
  | 'securities'
  | 'accounts'
  | 'settings'
  | 'help';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  selectedTaxYear: number | 'ALL';
  setSelectedTaxYear: (year: number | 'ALL') => void;
  availableTaxYears: number[];
  pendingReviewCount: number;
  flexConfig: FlexConnectorConfig;
  onOpenManualEntry: () => void;
  onOpenImport: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  selectedTaxYear,
  setSelectedTaxYear,
  availableTaxYears,
  pendingReviewCount,
  flexConfig,
  onOpenManualEntry,
  onOpenImport,
  onTriggerSync,
  isSyncing,
}) => {
  return (
    <header id="main-app-header" className="bg-white text-[#18181B] border-b border-[#E4E4E7] sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setActiveTab('dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center text-white font-bold shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base tracking-tight text-[#18181B]">Canadian ACB Engine</span>
                <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                  IBKR Flex
                </span>
              </div>
              <p className="text-[11px] text-[#71717A]">ITA s. 47 Average Cost & Schedule 3</p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Layers },
              { id: 'ledger', label: 'ACB Ledger', icon: FileSpreadsheet },
              {
                id: 'review',
                label: 'Review Queue',
                icon: ListTodo,
                badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
              },
              { id: 'connector', label: 'IBKR Sync', icon: Database },
              { id: 'reports', label: 'Tax Reports', icon: FileSpreadsheet },
              { id: 'accounts', label: 'Accounts', icon: Building2 },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'help', label: 'Help & Guide', icon: HelpCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${
                    isActive
                      ? 'bg-[#F4F4F5] text-[#18181B] font-semibold border border-[#E4E4E7]'
                      : 'text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#2563EB]' : 'text-[#71717A]'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Tax Year, Sync, Manual Entry */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Tax Year Selector */}
            <div className="flex items-center gap-1 bg-[#F4F4F5] rounded-xl p-1 border border-[#E4E4E7]">
              <span className="text-[11px] text-[#71717A] px-1 font-medium">Year:</span>
              <select
                id="tax-year-selector"
                value={selectedTaxYear}
                onChange={(e) => setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))}
                className="bg-white text-[#18181B] text-xs font-medium rounded-lg px-2 py-1 border border-[#E4E4E7] focus:outline-none focus:border-[#3B82F6] cursor-pointer shadow-2xs font-mono"
              >
                <option value="ALL">All History</option>
                {availableTaxYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} Tax Year
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions: Unified Data Path */}
            <button
              id="btn-open-import"
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F4F4F5] text-[#18181B] text-xs font-semibold rounded-xl border border-[#E4E4E7] transition-colors shadow-2xs"
              title="Import Activity Flex XML or CSV statement"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Import File</span>
            </button>

            {/* Pull from IBKR Flex API Button */}
            <button
              id="btn-sync-ibkr"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl text-white shadow-xs transition-colors ${
                isSyncing
                  ? 'bg-zinc-700 cursor-wait'
                  : 'bg-[#18181B] hover:bg-black'
              }`}
              title="Pull statements directly from IBKR Flex Web Service"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Pulling...' : 'Pull from IBKR'}</span>
            </button>

            {/* Adjust / Opening ACB Button for Gaps */}
            <button
              id="btn-open-manual-entry"
              onClick={onOpenManualEntry}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-2 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#71717A] hover:text-[#18181B] text-xs font-medium rounded-xl border border-[#E4E4E7] transition-colors"
              title="Adjust or enter opening ACB / corporate action override for gaps"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#71717A]" />
              <span>Adjust / Opening ACB</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="lg:hidden flex items-center gap-1 overflow-x-auto py-2.5 border-t border-[#E4E4E7] text-xs">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Layers },
            { id: 'ledger', label: 'Ledger', icon: FileSpreadsheet },
            { id: 'review', label: `Review (${pendingReviewCount})`, icon: ListTodo },
            { id: 'connector', label: 'IBKR', icon: Database },
            { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
            { id: 'accounts', label: 'Accounts', icon: Building2 },
            { id: 'settings', label: 'Settings', icon: Settings },
            { id: 'help', label: 'Help', icon: HelpCircle },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                activeTab === tab.id ? 'bg-[#F4F4F5] text-[#18181B] font-semibold border border-[#E4E4E7]' : 'text-[#71717A] hover:bg-[#F4F4F5]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>
    </header>
  );
};
