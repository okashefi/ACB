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
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { FlexConnectorConfig } from '../types/tax';
import { ThemeMode } from '../hooks/useTheme';

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
  theme: ThemeMode;
  toggleTheme: () => void;
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
  theme,
  toggleTheme,
}) => {
  return (
    <header id="main-app-header" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30 shadow-2xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setActiveTab('dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold shadow-2xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base tracking-tight text-zinc-900 dark:text-zinc-100">Canadian ACB Engine</span>
                <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  IBKR Flex
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">ITA s. 47 Average Cost & Schedule 3</p>
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
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold border border-zinc-200 dark:border-zinc-700'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Tax Year, Theme Toggle, Primary & Secondary Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors"
              title={`Current Theme: ${theme.toUpperCase()} (Click to toggle Light -> Dark -> System)`}
            >
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
              {theme === 'dark' && <Moon className="w-4 h-4 text-blue-400" />}
              {theme === 'system' && <Monitor className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />}
            </button>
            
            {/* Tax Year Selector */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 border border-zinc-200 dark:border-zinc-700">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1 font-medium">Year:</span>
              <select
                id="tax-year-selector"
                value={selectedTaxYear}
                onChange={(e) => setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))}
                className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs font-medium rounded-lg px-2 py-1 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs font-mono"
              >
                <option value="ALL">All History</option>
                {availableTaxYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} Tax Year
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions: Primary 1 (Import File) */}
            <button
              id="btn-open-import"
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors shadow-2xs"
              title="Import Activity Flex XML or CSV statement"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Import File</span>
            </button>

            {/* Quick Actions: Primary 2 (Pull from IBKR) */}
            <button
              id="btn-sync-ibkr"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl text-white shadow-2xs transition-colors ${
                isSyncing
                  ? 'bg-zinc-700 dark:bg-zinc-700 cursor-wait'
                  : 'bg-zinc-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500'
              }`}
              title="Pull statements directly from IBKR Flex Web Service"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Pulling...' : 'Pull from IBKR'}</span>
            </button>

            {/* Quick Actions: Secondary (Adjust / Opening ACB) */}
            <button
              id="btn-open-manual-entry"
              onClick={onOpenManualEntry}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-2 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors"
              title="Adjust or enter opening ACB / corporate action override for gaps"
            >
              <PlusCircle className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Adjust / Opening ACB</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="lg:hidden flex items-center gap-1 overflow-x-auto py-2.5 border-t border-zinc-200 dark:border-zinc-800 text-xs">
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
                activeTab === tab.id
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
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

