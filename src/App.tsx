import React, { useState, useEffect, useMemo } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { DashboardView } from './components/DashboardView';
import { LedgerView } from './components/LedgerView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { ConnectionsView } from './components/ConnectionsView';
import { ReportsView } from './components/ReportsView';
import { AccountsView } from './components/AccountsView';
import { SettingsView } from './components/SettingsView';
import { ManualEntryModal } from './components/ManualEntryModal';
import { ImportModal } from './components/ImportModal';
import { HelpView } from './components/HelpView';
import { runAcbEngine, reconcilePositions } from './engine/acbEngine';
import { d } from './engine/decimal';
import { fetchIbkrFlexStatement, FlexSyncResult } from './services/ibkrFlexService';
import { parseIbkrFlexXml } from './parsers/ibkrFlexXmlParser';
import { mergeAccounts, mergeSecurities, upsertTransactions, mergeOpenPositions } from './engine/syncMerge';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import {
  Transaction,
  Account,
  SecurityMaster,
  OpenPosition,
  FlexConnectorConfig,
  ReconciliationBreak,
  CorporateActionTreatment,
  TaxSettings,
} from './types/tax';

const LOCAL_STORAGE_KEY = 'canadian_acb_data_v1';

export interface SyncBannerState {
  type: 'success' | 'info' | 'error';
  title: string;
  message: string;
  details?: string[];
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedTaxYear, setSelectedTaxYear] = useState<number | 'ALL'>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  // Core Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [securities, setSecurities] = useState<SecurityMaster[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [flexConfig, setFlexConfig] = useState<FlexConnectorConfig>({
    token: '',
    tokenLast4: '',
    queryId: 'AF_CANADIAN_ACB',
    status: 'UNCONFIGURED',
    syncInterval: 'daily',
    overlapDays: 3,
  });

  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    taxResidentCountry: 'CA',
    province: 'ON',
    defaultFxSource: 'BANK_OF_CANADA',
    taxCharacter: 'capital',
    isDayTraderWarningAcknowledged: false,
    capitalGainsInclusionRate: '0.50',
    inclusionRateRulesByYear: {
      2026: { baseRate: '0.50' },
      2025: { baseRate: '0.50' },
      2024: { baseRate: '0.50' },
      2023: { baseRate: '0.50' },
    },
    cpaReviewDisclaimerAcknowledged: false,
  });

  const [syncBanner, setSyncBanner] = useState<SyncBannerState | null>(null);

  // Load from localStorage on first load (ensuring token is never read/stored)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.flexConfig) {
          const safeFlex = { ...parsed.flexConfig };
          delete safeFlex.token;
          setFlexConfig(safeFlex);
        }
        if (parsed.taxSettings) setTaxSettings(parsed.taxSettings);
        if (parsed.transactions && parsed.transactions.length > 0) {
          setTransactions(parsed.transactions);
          setAccounts(parsed.accounts || []);
          setSecurities(parsed.securities || []);
          setOpenPositions(parsed.openPositions || []);
          return;
        } else if (parsed.accounts && parsed.accounts.length > 0) {
          setAccounts(parsed.accounts);
          setSecurities(parsed.securities || []);
          setOpenPositions(parsed.openPositions || []);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
  }, []);

  // Save to localStorage (strictly excluding plaintext token)
  useEffect(() => {
    try {
      if (transactions.length > 0 || accounts.length > 0) {
        const safeFlexConfig = { ...flexConfig };
        delete safeFlexConfig.token;

        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            transactions,
            accounts,
            securities,
            openPositions,
            flexConfig: safeFlexConfig,
            taxSettings,
          })
        );
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist to localStorage', e);
    }
  }, [transactions, accounts, securities, openPositions, flexConfig, taxSettings]);

  // Replay Tax Engine
  const engineOutput = useMemo(() => {
    return runAcbEngine(transactions, accounts, securities, taxSettings);
  }, [transactions, accounts, securities, taxSettings]);

  // Available Tax Years derived from transactions
  const availableTaxYears = useMemo(() => {
    const years = new Set<number>();
    transactions.forEach((t) => {
      const yr = parseInt(t.date.substring(0, 4), 10);
      if (!isNaN(yr)) years.add(yr);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // Pending Reviews Count
  const pendingReviewCount = useMemo(() => {
    return transactions.filter((t) => t.status === 'needs_review').length;
  }, [transactions]);

  // Active account IDs referenced by current transactions or open positions
  const activeAccountIds = useMemo(() => {
    const ids = new Set<string>();
    transactions.forEach((t) => { if (t.accountId) ids.add(t.accountId); });
    openPositions.forEach((p) => { if (p.accountId) ids.add(p.accountId); });
    return ids;
  }, [transactions, openPositions]);

  // Displayed accounts: only accounts present in current transactions/import
  const displayedAccounts = useMemo(() => {
    if (activeAccountIds.size > 0) {
      const filtered = accounts.filter((a) => activeAccountIds.has(a.id) || activeAccountIds.has(a.accountId));
      if (filtered.length > 0) return filtered;
      return Array.from(activeAccountIds).map((id) => ({
        id,
        accountId: id,
        name: `IBKR ${id} (TAXABLE)`,
        broker: 'IBKR',
        accountType: 'taxable' as const,
        baseCurrency: 'CAD',
        isHouseholdAffiliate: false,
      }));
    }
    return accounts;
  }, [accounts, activeAccountIds]);



  useEffect(() => {
    fetch('/api/ibkr/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.isConfigured) {
          setFlexConfig((prev) => {
            const next = {
              ...prev,
              tokenLast4: data.tokenLast4,
              queryId: data.queryId || prev.queryId,
              status: prev.status === 'UNCONFIGURED' ? 'CONFIGURED' : prev.status,
            };
            delete next.token; // Ensure plaintext token is not kept
            return next;
          });
        }
      })
      .catch(console.error);
  }, []);


  // Reconciliation Breaks Check (Calculated share balances vs IBKR Open Positions)
  const reconciliationBreaks = useMemo<ReconciliationBreak[]>(() => {
    return reconcilePositions(engineOutput.securityBalances, openPositions);
  }, [engineOutput.securityBalances, openPositions]);

  // Trigger IBKR Sync
  const handleTriggerSync = async (isBackfill = false) => {
    setIsSyncing(true);
    setSyncBanner(null);
    try {
      const fetchChunk = async (startDate?: string, endDate?: string) => {
        return await fetchIbkrFlexStatement({
          token: flexConfig.token || '',
          queryId: flexConfig.queryId || 'AF_CANADIAN_ACB',
          startDate,
          endDate,
        });
      };

      let results: FlexSyncResult[] = [];
      const unavailableYears: number[] = [];
      const currentYear = new Date().getFullYear();

      // Find earliest account open year if available
      let minAccountOpenYear = currentYear - 4;
      accounts.forEach((acc) => {
        if (acc.openDate) {
          const y = parseInt(acc.openDate.substring(0, 4), 10);
          if (!isNaN(y) && y < minAccountOpenYear) {
            minAccountOpenYear = y;
          }
        }
      });
      const startYear = Math.max(minAccountOpenYear, currentYear - 4);

      if (isBackfill || !flexConfig.lastSyncTimestamp) {
        // Full backfill year walk (currentYear-4 through currentYear)
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        for (let year = startYear; year <= currentYear; year++) {
          const startDate = `${year}0101`;
          const endDate = year === currentYear ? todayStr : `${year}1231`;

          try {
            const res = await fetchChunk(startDate, endDate);
            if (res.success && res.parsedData) {
              const hasTrades =
                res.parsedData.transactions.length > 0 ||
                res.parsedData.hasTradesSection ||
                res.parsedData.hasCashTransactionsSection;
              if (!hasTrades) {
                unavailableYears.push(year);
              } else {
                results.push(res);
              }
            } else {
              unavailableYears.push(year);
            }
          } catch {
            unavailableYears.push(year);
          }
        }
      } else {
        // Incremental Pull: last success date - 3 days to today
        const lastSyncDate = new Date(flexConfig.lastSyncTimestamp);
        const startDateObj = new Date(lastSyncDate.getTime() - 3 * 24 * 60 * 60 * 1000);
        const startDate = startDateObj.toISOString().slice(0, 10).replace(/-/g, '');
        const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        try {
          const res = await fetchChunk(startDate, endDate);
          if (res.success && res.parsedData) {
            results.push(res);
          } else if (res.errorMessage) {
            setSyncBanner({
              type: 'error',
              title: 'IBKR Sync Failed',
              message: res.errorMessage,
            });
            setIsSyncing(false);
            return;
          }
        } catch (err: any) {
          setSyncBanner({
            type: 'error',
            title: 'IBKR Sync Exception',
            message: err.message || 'Network error connecting to IBKR Flex Web Service',
          });
          setIsSyncing(false);
          return;
        }
      }

      if (results.length > 0) {
        const allParsed = results
          .map((r) => r.parsedData)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));

        const allIncomingAccounts = allParsed.flatMap((p) => p.accounts);
        const allIncomingSecurities = allParsed.flatMap((p) => p.securities);
        const allIncomingTxs = allParsed.flatMap((p) => p.transactions);

        setAccounts((prev) => mergeAccounts(prev, allIncomingAccounts));
        setSecurities((prev) => mergeSecurities(prev, allIncomingSecurities));

        let updatedTxList: Transaction[] = [];
        setTransactions((prev) => {
          updatedTxList = upsertTransactions(prev, allIncomingTxs);
          return updatedTxList;
        });

        if (allParsed.length > 0) {
          const latestPositions = allParsed[allParsed.length - 1].openPositions;
          if (latestPositions && latestPositions.length > 0) {
            setOpenPositions((prev) => mergeOpenPositions(prev, latestPositions));
          }
        }

        setFlexConfig((prev) => ({
          ...prev,
          status: 'CONNECTED',
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncReferenceCode: results[results.length - 1].referenceCode,
        }));

        const tradeDates = updatedTxList.map((t) => t.date).sort();
        const firstTradeDate = tradeDates[0] || 'N/A';
        const lastTradeDate = tradeDates[tradeDates.length - 1] || 'N/A';

        const unavailDetails =
          unavailableYears.length > 0
            ? [`Unavailable / empty years during year walk: ${unavailableYears.join(', ')}`]
            : undefined;

        setSyncBanner({
          type: 'success',
          title: 'IBKR Flex Sync Completed',
          message: `Pulled IBKR history from ${firstTradeDate} to ${lastTradeDate}. History before ${firstTradeDate} needs Opening ACB.`,
          details: unavailDetails,
        });
      } else {
        setSyncBanner({
          type: 'info',
          title: 'No Data Retrieved from IBKR',
          message: 'No trade history returned for the requested date range.',
          details:
            unavailableYears.length > 0
              ? [`Unavailable / empty years: ${unavailableYears.join(', ')}`]
              : undefined,
        });
      }
    } catch (e: any) {
      setSyncBanner({
        type: 'error',
        title: 'IBKR Sync Error',
        message: e.message || 'Unexpected error during sync',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Add Manual Transaction
  const handleAddTransaction = (tx: Transaction, newSec?: SecurityMaster) => {
    if (newSec) {
      setSecurities((prev) => [...prev.filter((s) => s.id !== newSec.id), newSec]);
    }
    setTransactions((prev) => [...prev, tx].sort((a, b) => a.date.localeCompare(b.date)));
  };

  // Import parsed data complete
  const handleImportComplete = (
    data: {
      transactions: Transaction[];
      accounts: Account[];
      securities: SecurityMaster[];
      openPositions: OpenPosition[];
    },
    importMode: 'merge' | 'replace' = 'merge'
  ) => {
    if (importMode === 'replace') {
      setAccounts(data.accounts);
      setSecurities(data.securities);
      setTransactions(data.transactions.sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date)));
      setOpenPositions(data.openPositions || []);
      setSyncBanner({
        type: 'info',
        title: 'Import Completed (Replace Mode)',
        message: `Loaded ${data.transactions.length} transactions, replacing previous ledger.`,
      });
    } else {
      setAccounts((prev) => mergeAccounts(prev, data.accounts));
      setSecurities((prev) => mergeSecurities(prev, data.securities));
      setTransactions((prev) => upsertTransactions(prev, data.transactions));
      if (data.openPositions && data.openPositions.length > 0) {
        setOpenPositions((prev) => mergeOpenPositions(prev, data.openPositions));
      }
      setSyncBanner({
        type: 'success',
        title: 'Import Completed (Merge Mode)',
        message: `Merged statement data into existing ledger.`,
      });
    }
  };

  // Corporate Action review confirmation
  const handleConfirmTreatment = (
    txId: string,
    treatment: CorporateActionTreatment,
    details: {
      newShareFmvPerShare?: number;
      newSharesReceived?: number;
      totalCashReceived?: number;
      userNotes?: string;
    }
  ) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === txId) {
          return {
            ...t,
            status: 'approved',
            corporateAction: {
              ...t.corporateAction!,
              treatment,
              newShareFmvPerShare: details.newShareFmvPerShare ?? t.corporateAction?.newShareFmvPerShare,
              newSharesReceived: details.newSharesReceived ?? t.corporateAction?.newSharesReceived,
              totalCashReceived: details.totalCashReceived ?? t.corporateAction?.totalCashReceived,
              userConfirmedTreatment: true,
              userNotes: details.userNotes,
            },
          };
        }
        return t;
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100 transition-colors">
      
      {/* Top CPA Disclaimer Banner */}
      <DisclaimerBanner />

      {/* Main Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedTaxYear={selectedTaxYear}
        setSelectedTaxYear={setSelectedTaxYear}
        availableTaxYears={availableTaxYears}
        pendingReviewCount={pendingReviewCount}
        flexConfig={flexConfig}
        onOpenManualEntry={() => setIsManualEntryOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onTriggerSync={() => handleTriggerSync(false)}
        isSyncing={isSyncing}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Notification Banner */}
        {syncBanner && (
          <div
            className={`mb-6 p-4 rounded-2xl border text-xs flex items-start justify-between gap-3 shadow-2xs transition-all animate-in fade-in slide-in-from-top-2 ${
              syncBanner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : syncBanner.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            }`}
          >
            <div className="flex items-start gap-3">
              {syncBanner.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
              {syncBanner.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />}
              {syncBanner.type === 'info' && <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}
              <div>
                <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{syncBanner.title}</div>
                <div className="mt-0.5 leading-relaxed">{syncBanner.message}</div>
                {syncBanner.details && syncBanner.details.length > 0 && (
                  <ul className="mt-1.5 list-disc list-inside space-y-0.5 opacity-90">
                    {syncBanner.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncBanner(null)}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              title="Dismiss status banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            engineOutput={engineOutput}
            flexConfig={flexConfig}
            transactions={transactions}
            securities={securities}
            selectedTaxYear={selectedTaxYear}
            setSelectedTaxYear={setSelectedTaxYear}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onOpenReview={(txId) => setActiveTab('review')}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerView
            engineOutput={engineOutput}
            securities={securities}
            selectedTaxYear={selectedTaxYear}
          />
        )}

        {activeTab === 'review' && (
          <ReviewQueueView
            transactions={transactions}
            securities={securities}
            securityBalances={engineOutput.securityBalances}
            reconciliationBreaks={reconciliationBreaks}
            onConfirmTreatment={handleConfirmTreatment}
          />
        )}

        {activeTab === 'connector' && (
          <ConnectionsView
            flexConfig={flexConfig}
            onSaveConfig={(cfg) => setFlexConfig((prev) => ({ ...prev, ...cfg }))}
            onTriggerSync={handleTriggerSync}
            isSyncing={isSyncing}
            reconciliationBreaks={reconciliationBreaks}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            engineOutput={engineOutput}
            selectedTaxYear={selectedTaxYear}
            availableTaxYears={availableTaxYears}
            setSelectedTaxYear={setSelectedTaxYear}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsView
            accounts={displayedAccounts}
            securities={securities}
            onAddAccount={(acc) => setAccounts((prev) => [...prev, acc])}
            onUpdateAccount={(acc) => setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)))}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={taxSettings}
            onUpdateSettings={setTaxSettings}
            affiliateAccountsCount={displayedAccounts.filter((a) => a.isHouseholdAffiliate).length}
          />
        )}

        {activeTab === 'help' && <HelpView />}
      </main>

      {/* Modals */}
      <ManualEntryModal
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        accounts={displayedAccounts}
        securities={securities}
        onAddTransaction={handleAddTransaction}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-4 text-xs text-zinc-500 dark:text-zinc-400 font-sans transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Canadian ACB Engine</span>
            <span>•</span>
            <span>Income Tax Act (Canada) Compliance</span>
          </div>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">ITA ss. 40, 47, 53, 54, 85.1, 86, 86.1, 87, 261</span>
        </div>
      </footer>

    </div>
  );
}
export default App;
