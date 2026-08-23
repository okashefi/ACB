import React from 'react';
import { AlertCircle } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <div id="cpa-disclaimer-banner" className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-300 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong className="font-semibold text-amber-950 dark:text-amber-200">Canadian Tax Disclaimer:</strong> This application calculates Adjusted Cost Base (ACB) under the <em>Income Tax Act</em> (Canada) and CRA administrative practice. It is an audit-assist tool and not a substitute for professional CPA advice. Verify all elections with your tax professional before filing Schedule 3.
          </span>
        </div>
        <span className="hidden md:inline-block px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-mono text-[10px] font-medium">
          ITA s. 47 / s. 54 / s. 85.1 Compliant
        </span>
      </div>
    </div>
  );
};

