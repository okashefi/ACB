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
import { fetchIbkrFlexStatement } from './services/ibkrFlexService';
import { parseIbkrFlexXml } from './parsers/ibkrFlexXmlParser';
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

export function App() {
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

  // Load from localStorage on first load
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.transactions && parsed.transactions.length > 0) {
          setTransactions(parsed.transactions);
          setAccounts(parsed.accounts || []);
          setSecurities(parsed.securities || []);
          setOpenPositions(parsed.openPositions || []);
          if (parsed.flexConfig) setFlexConfig(parsed.flexConfig);
          if (parsed.taxSettings) setTaxSettings(parsed.taxSettings);
          return;
        } else if (parsed.accounts && parsed.accounts.length > 0) {
          setAccounts(parsed.accounts);
          setSecurities(parsed.securities || []);
          setOpenPositions(parsed.openPositions || []);
          if (parsed.flexConfig) setFlexConfig(parsed.flexConfig);
          if (parsed.taxSettings) setTaxSettings(parsed.taxSettings);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      if (transactions.length > 0 || accounts.length > 0) {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            transactions,
            accounts,
            securities,
            openPositions,
            flexConfig,
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
    try {
      const fetchChunk = async (startDate?: string, endDate?: string) => {
        return await fetchIbkrFlexStatement({
          token: flexConfig.token || '',
          queryId: flexConfig.queryId || 'AF_CANADIAN_ACB',
          startDate,
          endDate,
        });
      };

      let results: any[] = [];
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

      if (isBackfill || true) { // Walk full CRA window (currentYear-4 through currentYear)
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        for (let year = startYear; year <= currentYear; year++) {
          const startDate = `${year}0101`;
          const endDate = year === currentYear ? todayStr : `${year}1231`;
          
          try {
            const res = await fetchChunk(startDate, endDate);
            if (res.success && res.parsedData) {
              const hasTrades = res.parsedData.transactions.length > 0 || res.parsedData.hasTradesSection || res.parsedData.hasCashTransactionsSection;
              if (!hasTrades) {
                unavailableYears.push(year);
              } else {
                results.push(res);
              }
            } else {
              unavailableYears.push(year);
            }
          } catch (chunkErr) {
            unavailableYears.push(year);
          }
        }
      }

      if (results.length > 0) {
        const allParsed = results.map(r => r.parsedData).filter((p): p is NonNullable<typeof p> => Boolean(p));
        
        // Merge accounts
        setAccounts((prev) => {
          const map = new Map<string, Account>(prev.map((a) => [a.id, a]));
          allParsed.forEach((parsed) => {
            parsed.accounts.forEach((a) => map.set(a.id, a));
          });
          return Array.from(map.values());
        });

        // Merge securities
        setSecurities((prev) => {
          const map = new Map<string, SecurityMaster>(prev.map((s) => [s.id, s]));
          allParsed.forEach((parsed) => {
            parsed.securities.forEach((s) => map.set(s.id, s));
          });
          return Array.from(map.values());
        });

        // Merge transactions (upsert by ID, do not wipe earlier years)
        let mergedTxList: Transaction[] = [];
        setTransactions((prev: Transaction[]) => {
          const map = new Map<string, Transaction>(prev.map((t) => [t.id, t]));
          
          allParsed.forEach((parsed) => {
            parsed.transactions.forEach((t: Transaction) => {
              if (t.isCancelled) {
                map.delete(t.id);
                return;
              }
              const existing = map.get(t.id);
              if (existing && existing.status === 'approved' && existing.corporateAction && t.status === 'needs_review') {
                t.status = 'approved';
                t.corporateAction = existing.corporateAction;
              }
              map.set(t.id, t);
            });
          });
          
          mergedTxList = Array.from(map.values()).sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
          return mergedTxList;
        });

        // Use open positions from the most recent result
        if (allParsed.length > 0) {
          setOpenPositions(allParsed[allParsed.length - 1].openPositions);
        }

        setFlexConfig((prev) => ({
          ...prev,
          status: 'CONNECTED',
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncReferenceCode: results[results.length - 1].referenceCode,
        }));

        // Calculate trade range for status alert
        const tradeDates = mergedTxList.map((t) => t.date).sort();
        const firstTradeDate = tradeDates[0] || 'N/A';
        const lastTradeDate = tradeDates[tradeDates.length - 1] || 'N/A';

        const unavailStr = unavailableYears.length > 0 ? ` (Unavailable/empty years: ${unavailableYears.join(', ')})` : '';
        alert(`Pulled IBKR history from ${firstTradeDate} to ${lastTradeDate}. History before ${firstTradeDate} needs Opening ACB.${unavailStr}`);
      } else {
        alert(`No data retrieved from IBKR. Unavailable/empty years: ${unavailableYears.join(', ')}`);
      }
    } catch (e: any) {
      alert(`Sync error: ${e.message}`);
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
    } else {
      // Merge accounts
      setAccounts((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        data.accounts.forEach((a) => map.set(a.id, a));
        return Array.from(map.values());
      });

      // Merge securities
      setSecurities((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        data.securities.forEach((s) => map.set(s.id, s));
        return Array.from(map.values());
      });

      // Merge transactions by transaction ID (upsert)
      setTransactions((prev) => {
        const map = new Map<string, Transaction>(prev.map((t) => [t.id, t]));
        data.transactions.forEach((t) => {
          if (t.isCancelled) {
            map.delete(t.id);
          } else {
            const existing = map.get(t.id);
            if (existing && existing.status === 'approved' && existing.corporateAction && t.status === 'needs_review') {
              t.status = 'approved';
              t.corporateAction = existing.corporateAction;
            }
            map.set(t.id, t);
          }
        });
        return Array.from(map.values()).sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
      });

      // Merge open positions
      if (data.openPositions && data.openPositions.length > 0) {
        setOpenPositions((prev) => {
          const map = new Map(prev.map((p) => [`${p.accountId}_${p.securityId}`, p]));
          data.openPositions.forEach((p) => map.set(`${p.accountId}_${p.securityId}`, p));
          return Array.from(map.values());
        });
      }
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
    <div className="min-h-screen bg-[#F9FAFB] text-[#18181B] flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      
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
      />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      <footer className="border-t border-[#E4E4E7] bg-white py-4 text-xs text-[#71717A] font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#18181B]">Canadian ACB Engine</span>
            <span>•</span>
            <span>Income Tax Act (Canada) Compliance</span>
          </div>
          <span className="text-[11px] text-[#A1A1AA] font-mono">ITA ss. 40, 47, 53, 54, 85.1, 86, 86.1, 87, 261</span>
        </div>
      </footer>

    </div>
  );
}
export default App;
