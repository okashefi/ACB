import React from 'react';
import { AlertCircle } from 'lucide-react';

export const TaxDisclaimerBar: React.FC = () => {
  return (
    <div
      id="cpa-disclaimer-banner"
      className="bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-200/80 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 max-sm:h-auto max-sm:py-1.5 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-[11px] sm:text-xs text-amber-900 dark:text-amber-200 font-medium truncate max-sm:whitespace-normal max-sm:line-clamp-2">
            Tax-assist tool only — verify CRA elections and Schedule 3 figures with a qualified tax professional.
          </p>
        </div>
        <div className="shrink-0 hidden sm:flex items-center">
          <span className="px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-medium whitespace-nowrap">
            ITA ss. 40, 47, 49, 54
          </span>
        </div>
      </div>
    </div>
  );
};

export const DisclaimerBanner = TaxDisclaimerBar;
