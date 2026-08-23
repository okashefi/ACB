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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const navItems = [
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
      className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-b border-zinc-200/80 dark:border-zinc-800/80 sticky top-0 z-30 transition-colors h-16 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 h-full w-full">
          
          {/* Left Cluster: Hamburger (Mobile) + Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            {/* Hamburger Button for Mobile/Tablet */}
            <button
              id="mobile-hamburger-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand Logo & Name */}
            <div
              id="brand-container"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 cursor-pointer select-none min-w-0"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-sm sm:text-base tracking-tight text-zinc-900 dark:text-zinc-50 truncate whitespace-nowrap">
                    Canadian ACB
                  </span>
                  <span className="hidden sm:inline-block text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 shrink-0">
                    IBKR
                  </span>
                </div>
                <p className="hidden xl:inline-block text-[10px] text-zinc-400 dark:text-zinc-500 truncate whitespace-nowrap leading-none mt-0.5">
                  CRA capital-gains ledger
                </p>
              </div>
            </div>
          </div>

          {/* Centre Cluster: Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center justify-center gap-1 min-w-0 h-full">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`relative flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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

          {/* Right Cluster: Control Center */}
          <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0">
            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="w-9 h-9 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg transition-colors border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
              title={`Current Theme: ${theme.toUpperCase()} (Click to toggle)`}
              aria-label="Toggle visual theme"
            >
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
              {theme === 'dark' && <Moon className="w-4 h-4 text-blue-400" />}
              {theme === 'system' && <Monitor className="w-4 h-4 text-zinc-500" />}
            </button>

            {/* Tax Year Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 h-9 border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider hidden sm:inline-block">
                Year
              </span>
              <select
                id="tax-year-selector"
                value={selectedTaxYear}
                onChange={(e) =>
                  setSelectedTaxYear(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))
                }
                className="bg-transparent text-zinc-900 dark:text-zinc-100 text-xs font-semibold focus:outline-none cursor-pointer font-mono pr-1 border-0"
              >
                <option value="ALL">All Years</option>
                {availableTaxYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Import Button */}
            <button
              id="btn-open-import"
              onClick={onOpenImport}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors shadow-2xs cursor-pointer select-none whitespace-nowrap"
              title="Import Activity Flex XML or CSV statement"
              aria-label="Import activity file"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden md:inline">Import</span>
            </button>

            {/* Pull IBKR Button */}
            <button
              id="btn-sync-ibkr"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white transition-all shadow-2xs cursor-pointer select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title="Pull statements directly from IBKR Flex Web Service"
              aria-label="Pull from IBKR"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Pulling...' : 'Pull IBKR'}</span>
            </button>

            {/* Adjust / Opening ACB Button (Show at xl widths, otherwise in "More" menu) */}
            <button
              id="btn-open-manual-entry-xl"
              onClick={onOpenManualEntry}
              className="hidden xl:inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors shadow-2xs cursor-pointer select-none whitespace-nowrap"
              title="Adjust or enter opening ACB"
            >
              <PlusCircle className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Adjust</span>
            </button>

            {/* "More" Menu Button (Visible at lg breakpoint, hidden at xl) */}
            <div className="relative hidden lg:block xl:hidden">
              <button
                id="btn-nav-more"
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/30 dark:border-zinc-700/30 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors cursor-pointer"
                title="More actions"
              >
                <span>More</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {isMoreMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsMoreMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 mt-2 w-52 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg py-1 z-40 text-left font-sans"
                    >
                      <button
                        onClick={() => {
                          onOpenManualEntry();
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors flex items-center gap-2 font-medium"
                      >
                        <PlusCircle className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                        <span>Adjust / Opening ACB</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>
      </div>

      {/* Slide-over Drawer Menu for Mobile/Tablet (< 1024px) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
            />

            {/* Drawer Container */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-[280px] max-w-[80vw] bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 flex flex-col gap-4 lg:hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
                    Canadian ACB
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
                {navItems.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as ActiveTab);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-colors ${
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
                    Quick Actions
                  </p>
                  
                  {/* Manual Entry inside Drawer */}
                  <button
                    onClick={() => {
                      onOpenManualEntry();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    <span>Adjust / Opening ACB</span>
                  </button>

                  {/* Pull IBKR (Shown inside Drawer on mobile screen sizes only) */}
                  <button
                    disabled={isSyncing}
                    onClick={() => {
                      onTriggerSync();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing with IBKR...' : 'Sync IBKR'}</span>
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
