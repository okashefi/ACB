import React, { useState } from 'react';
import {
  TestTube2,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { runAllTestFixtures, TestFixtureResult } from '../engine/testFixtures';

export const TestSuiteView: React.FC = () => {
  const [tests, setTests] = useState<TestFixtureResult[]>(() => runAllTestFixtures());
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runAllTestFixtures();
      setTests(res);
      setIsRunning(false);
    }, 150);
  };

  const total = tests.length;
  const passedCount = tests.filter((t) => t.passed).length;
  const failedCount = total - passedCount;
  const allPassed = failedCount === 0;

  return (
    <div id="test-suite-container" className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      
      {/* Top Header & Run button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <TestTube2 className="w-5 h-5 text-[#2563EB]" />
            <span>Canadian Tax Engine Automated Test Suite</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            Verification suite validating the <em>Income Tax Act</em> (Canada), CRA Interpretation Bulletins, and Corporate Actions.
          </p>
        </div>

        <button
          id="btn-run-tax-tests"
          onClick={handleRunTests}
          disabled={isRunning}
          className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 shrink-0"
        >
          <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Running Calculations...' : 'Run All Engine Tests'}</span>
        </button>
      </div>

      {/* Educational Banner */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[#18181B] text-sm">
          <Info className="w-5 h-5 text-[#2563EB]" />
          <h3>Why do we have a Test Suite?</h3>
        </div>
        <p className="text-[#71717A] text-xs leading-relaxed">
          Tax compliance is mathematically complex and the Canada Revenue Agency (CRA) enforces strict rules around concepts like <strong>Superficial Losses (ITA s.54)</strong>, <strong>Weighted Average Cost Base (ITA s.47)</strong>, and <strong>Foreign Exchange implications</strong>.
          <br /><br />
          This verification suite acts as an automated auditor. Every time the engine is updated, these tests run complex, real-world portfolio scenarios (including splits, mergers, and wash sales) against known correct CRA outcomes to guarantee that the application's math is 100% compliant with Canadian tax law. You can click on any test below to see the exact statutory authority and the math it verifies.
        </p>
      </div>

      {/* Results KPI card */}
      <div className={`p-5 rounded-2xl border flex items-center justify-between shadow-2xs transition-colors ${
        allPassed
          ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
          : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            allPassed ? 'bg-white border-[#A7F3D0] text-[#059669]' : 'bg-white border-[#FCA5A5] text-[#DC2626]'
          }`}>
            {allPassed ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#18181B]">
              {allPassed ? 'All Tax Engine Verification Tests Passed' : `${failedCount} Verification Tests Failed`}
            </h3>
            <p className={`text-xs mt-0.5 ${allPassed ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              Passed {passedCount} of {total} cases ({((passedCount / (total || 1)) * 100).toFixed(1)}% compliance)
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <span className={`px-2.5 py-1 rounded-md border font-bold ${allPassed ? 'bg-white border-[#A7F3D0] text-[#059669]' : 'bg-white border-[#FCA5A5] text-[#DC2626]'}`}>
            {allPassed ? '100% Green' : `${failedCount} Failing`}
          </span>
        </div>
      </div>

      {/* Test Cases List */}
      <div className="space-y-3">
        {tests.map((test) => {
          const isExpanded = expandedTest === test.id;
          return (
            <div
              key={test.id}
              className={`rounded-2xl border transition-colors overflow-hidden ${
                test.passed
                  ? 'bg-white border-[#E4E4E7] hover:border-[#3B82F6] shadow-2xs'
                  : 'bg-white border-[#FCA5A5] shadow-2xs'
              }`}
            >
              <div
                onClick={() => setExpandedTest(isExpanded ? null : test.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#F9FAFB] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {test.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold text-xs text-[#18181B] flex items-center gap-2">
                      <span>{test.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] text-[#71717A] text-[10px] font-mono border border-[#E4E4E7]">
                        {test.statutoryCitations.join(', ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#71717A] mt-0.5 font-sans">
                      {test.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[#71717A]">
                  <span className={`text-[10px] font-mono font-bold ${test.passed ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                    {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-[#E4E4E7] bg-[#F9FAFB] text-xs font-mono space-y-2">
                  <div className="text-[11px] text-[#71717A] mt-2">
                    <strong className="text-[#18181B] font-sans">Statutory Authority:</strong> {test.statutoryCitations.join('; ')}
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#E4E4E7] text-[11px] space-y-1.5 shadow-2xs">
                    <div className="text-[#71717A]">
                      <span className="text-[#A1A1AA] font-sans uppercase text-[10px] font-semibold mr-1">Expected:</span>
                      <span className="text-[#18181B]">{test.expectedResult}</span>
                    </div>
                    <div className="text-[#059669]">
                      <span className="text-[#A1A1AA] font-sans uppercase text-[10px] font-semibold mr-1">Actual:</span>
                      <span className="font-bold">{test.actualResult}</span>
                    </div>
                  </div>
                  {test.auditTrail.length > 0 && (
                    <div className="text-[10px] text-[#71717A] bg-white border border-[#E4E4E7] p-3 rounded-xl max-h-32 overflow-y-auto space-y-1 mt-2 shadow-2xs">
                      {test.auditTrail.map((log, lIdx) => (
                        <div key={lIdx} className="leading-relaxed border-b border-[#F4F4F5] last:border-0 pb-1 last:pb-0">• {log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
