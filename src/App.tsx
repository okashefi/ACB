import React, { useState, useEffect, useMemo } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { DashboardView } from './components/DashboardView';
import { LedgerView } from './components/LedgerView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { ConnectionsView } from './components/ConnectionsView';
import { ReportsView } from './components/ReportsView';
import { AccountsView } from './components/AccountsView';
import { TestSuiteView } from './components/TestSuiteView';
import { ManualEntryModal } from './components/ManualEntryModal';
import { ImportModal } from './components/ImportModal';
import { HelpView } from './components/HelpView';
import { runAcbEngine } from './engine/acbEngine';
import { fetchIbkrFlexStatement, generateSandboxFlexXml } from './services/ibkrFlexService';
import { parseIbkrFlexXml } from './parsers/ibkrFlexXmlParser';
import {
  Transaction,
  Account,
  SecurityMaster,
  OpenPosition,
  FlexConnectorConfig,
  ReconciliationBreak,
  CorporateActionTreatment,
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

  // Load from localStorage or seed initial sandbox demo data on first load
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
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }

    // Default: Load realistic multi-year sandbox data immediately
    loadSandboxDemoData();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (transactions.length > 0) {
      try {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            transactions,
            accounts,
            securities,
            openPositions,
            flexConfig,
          })
        );
      } catch (e) {
        console.warn('Failed to persist to localStorage', e);
      }
    }
  }, [transactions, accounts, securities, openPositions, flexConfig]);

  // Load Sandbox Demo Data
  const loadSandboxDemoData = () => {
    const xml = generateSandboxFlexXml();
    const parsed = parseIbkrFlexXml(xml);
    setTransactions(parsed.transactions);
    setAccounts(parsed.accounts);
    setSecurities(parsed.securities);
    setOpenPositions(parsed.openPositions);
    setFlexConfig((prev) => ({
      ...prev,
      token: 'DEMO_SANDBOX_TOKEN',
      tokenLast4: 'OKEN',
      queryId: 'AF_CANADIAN_ACB',
      status: 'CONNECTED',
      lastSyncTimestamp: new Date().toISOString(),
    }));
  };

  // Replay Tax Engine
  const engineOutput = useMemo(() => {
    return runAcbEngine(transactions, accounts, securities);
  }, [transactions, accounts, securities]);

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

  // Reconciliation Breaks Check (Calculated share balances vs IBKR Open Positions)
  const reconciliationBreaks = useMemo<ReconciliationBreak[]>(() => {
    const breaks: ReconciliationBreak[] = [];
    const openPosMap = new Map<string, number>();
    openPositions.forEach((pos) => {
      openPosMap.set(pos.symbol, (openPosMap.get(pos.symbol) || 0) + pos.position);
    });

    engineOutput.securityBalances.forEach((bal) => {
      if (bal.quantity > 0) {
        const brokerReported = openPosMap.get(bal.symbol) || 0;
        const diff = Math.abs(bal.quantity - brokerReported);
        if (diff > 0.0001) {
          breaks.push({
            securityId: bal.securityId,
            symbol: bal.symbol,
            calculatedQuantity: bal.quantity,
            brokerReportedQuantity: brokerReported,
            quantityDiscrepancy: bal.quantity - brokerReported,
            calculatedAcbCad: bal.totalAcbCad,
            status: 'QUANTITY_BREAK',
            explanation: `Calculated quantity (${bal.quantity}) differs from IBKR Open Position (${brokerReported})`,
          });
        }
      }
    });

    return breaks;
  }, [engineOutput.securityBalances, openPositions]);

  // Trigger IBKR Sync
  const handleTriggerSync = async (isBackfill = false) => {
    setIsSyncing(true);
    try {
      const res = await fetchIbkrFlexStatement({
        token: flexConfig.token || 'DEMO_SANDBOX_TOKEN',
        queryId: flexConfig.queryId || 'AF_CANADIAN_ACB',
        useSandbox: !flexConfig.token || flexConfig.token.startsWith('DEMO_'),
      });

      if (res.success && res.parsedData) {
        // Merge accounts
        setAccounts((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]));
          res.parsedData!.accounts.forEach((a) => map.set(a.id, a));
          return Array.from(map.values());
        });

        // Merge securities
        setSecurities((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]));
          res.parsedData!.securities.forEach((s) => map.set(s.id, s));
          return Array.from(map.values());
        });

        // Merge transactions (deduplicating by ID)
        setTransactions((prev) => {
          const map = new Map(prev.map((t) => [t.id, t]));
          res.parsedData!.transactions.forEach((t) => map.set(t.id, t));
          return Array.from(map.values()).sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
        });

        setOpenPositions(res.parsedData.openPositions);

        setFlexConfig((prev) => ({
          ...prev,
          status: 'CONNECTED',
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncReferenceCode: res.referenceCode,
        }));
      } else {
        alert(`IBKR Sync: ${res.errorMessage || 'Unknown sync error'}`);
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
  const handleImportComplete = (data: {
    transactions: Transaction[];
    accounts: Account[];
    securities: SecurityMaster[];
    openPositions: OpenPosition[];
  }) => {
    setAccounts((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      data.accounts.forEach((a) => map.set(a.id, a));
      return Array.from(map.values());
    });
    setSecurities((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]));
      data.securities.forEach((s) => map.set(s.id, s));
      return Array.from(map.values());
    });
    setTransactions((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      data.transactions.forEach((t) => map.set(t.id, t));
      return Array.from(map.values()).sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
    });
    if (data.openPositions.length > 0) {
      setOpenPositions(data.openPositions);
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
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onOpenReview={(txId) => setActiveTab('review')}
            onLoadDemoData={loadSandboxDemoData}
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
            onLoadSandbox={loadSandboxDemoData}
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
            accounts={accounts}
            securities={securities}
            onAddAccount={(acc) => setAccounts((prev) => [...prev, acc])}
            onUpdateAccount={(acc) => setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)))}
          />
        )}

        {activeTab === 'tests' && <TestSuiteView />}
        {activeTab === 'help' && <HelpView />}
      </main>

      {/* Modals */}
      <ManualEntryModal
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        accounts={accounts}
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
