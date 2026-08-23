import React, { useState } from 'react';
import {
  Layers,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  Building2,
  ListTodo,
  PlusCircle,
  UploadCloud,
  Settings,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { FlexConnectorConfig } from '../types/tax';
import { ThemeMode } from '../hooks/useTheme';
import { motion, AnimatePresence } from 'motion/react';

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
  onOpenManualEntry,
  onOpenImport,
  onTriggerSync,
  isSyncing,
  theme,
  toggleTheme,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layers },
    { id: 'ledger', label: 'Ledger', icon: FileSpreadsheet },
    {
      id: 'review',
      label: 'Review',
      icon: ListTodo,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { id: 'connector', label: 'IBKR', icon: Layers },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <header
      id="main-app-header"
      className="w-full max-w-[100vw] overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-b border-zinc-200/80 dark:border-zinc-800/80 sticky top-0 z-30 transition-colors shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)] h-[72px]"
    >
      <div className="max-w-7xl mx-auto h-full px-0 sm:px-4 lg:px-6">
        <div className="appHeaderInner h-full">
          
          {/* Sibling 1: Brand Cluster (max-width 180px on desktop) */}
          <div className="brandCluster shrink-0">
            {/* Hamburger Button (visible under 1536px) */}
            <button
              id="mobile-hamburger-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              className="min-[1536px]:hidden p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mr-1 shrink-0 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand Logo & Title */}
            <div
              id="brand-container"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 cursor-pointer select-none min-w-0"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              
              {/* Desktop Name (>= 1536px) */}
              <span className="hidden min-[1536px]:inline font-semibold text-base tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                Canadian ACB
              </span>
              
              {/* Compact Name (< 1536px) */}
              <span className="inline min-[1536px]:hidden font-semibold text-base tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                ACB
              </span>

              {/* IBKR Badge - only display at >= 1536px */}
              <span className="hidden min-[1536px]:inline-block text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 shrink-0">
                IBKR
              </span>
            </div>
          </div>

          {/* Sibling 2: Primary Navigation (visible only at >= 1536px) */}
          <nav className="primaryNav h-full hidden min-[1536px]:flex">
            {mainNavItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`relative flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40 leading-none shrink-0">
                      {tab.badge}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-blue-600 dark:bg-blue-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sibling 3: Header Actions */}
          <div className="headerActions shrink-0">
            {/* Theme Toggle Button (visible >= 1536px) */}
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="hidden min-[1536px]:inline-flex w-10 h-10 items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg transition-colors border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer shrink-0"
              title={`Theme: ${theme.toUpperCase()}`}
              aria-label="Toggle theme"
            >
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
              {theme === 'dark' && <Moon className="w-4 h-4 text-blue-400" />}
              {theme === 'system' && <Monitor className="w-4 h-4 text-zinc-500" />}
            </button>

            {/* Year Selector: One compact control, h-10, min-width 150px */}
            <div className="relative shrink-0 w-[150px] min-w-[150px]">
              <select
                id="tax-year-selector"
                value={selectedTaxYear}
                onChange={(e) =>
                  setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))
                }
                className="w-full h-10 pl-3 pr-10 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-900 dark:text-zinc-100 text-xs font-semibold rounded-lg transition-colors focus:outline-none cursor-pointer border border-zinc-200/30 dark:border-zinc-700/30 appearance-none text-left"
              >
                <option value="ALL">All years</option>
                {availableTaxYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Import Button */}
            <button
              id="btn-open-import"
              onClick={onOpenImport}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors shadow-2xs cursor-pointer select-none whitespace-nowrap shrink-0"
              title="Import Activity Statement"
              aria-label="Import activity file"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {/* Pull IBKR Button */}
            <button
              id="btn-sync-ibkr"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white transition-all shadow-2xs cursor-pointer select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Pull from IBKR"
              aria-label="Pull from IBKR"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Pulling...' : 'Pull IBKR'}</span>
              <span className="inline sm:hidden">{isSyncing ? 'Pulling...' : 'Pull'}</span>
            </button>
          </div>

        </div>
      </div>

      {/* Slide-over Drawer Menu for Mobile/Tablet (< 1536px) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs min-[1536px]:hidden"
            />

            {/* Drawer Container */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-[280px] max-w-[80vw] bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 flex flex-col gap-4 min-[1536px]:hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
                    ACB
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Scrollable Links */}
              <div className="flex-1 overflow-y-auto space-y-1.5 py-1">
                <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-2">
                  Navigation
                </p>
                {mainNavItems.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as ActiveTab);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4 space-y-1.5">
                  <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-2">
                    Preferences & Tools
                  </p>
                  
                  {/* Theme Toggle inside Drawer */}
                  <button
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {theme === 'light' && <Sun className="w-4 h-4 text-amber-500 shrink-0" />}
                      {theme === 'dark' && <Moon className="w-4 h-4 text-blue-400 shrink-0" />}
                      {theme === 'system' && <Monitor className="w-4 h-4 text-zinc-500 shrink-0" />}
                      <span>Theme Mode</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono">
                      {theme}
                    </span>
                  </button>

                  {/* Manual Entry Adjust inside Drawer */}
                  <button
                    onClick={() => {
                      onOpenManualEntry();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                    <span>Adjust / Opening ACB</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
