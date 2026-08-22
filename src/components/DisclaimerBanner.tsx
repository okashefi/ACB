import React from 'react';
import { AlertCircle } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <div id="cpa-disclaimer-banner" className="bg-[#FFFBEB] border-b border-[#FEF3C7] px-4 py-2.5 text-xs text-[#92400E]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />
          <span>
            <strong className="font-semibold text-[#78350F]">Canadian Tax Disclaimer:</strong> This application calculates Adjusted Cost Base (ACB) under the <em>Income Tax Act</em> (Canada) and CRA administrative practice. It is an audit-assist tool and not a substitute for professional CPA advice. Verify all elections with your tax professional before filing Schedule 3.
          </span>
        </div>
        <span className="hidden md:inline-block px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-mono text-[10px] font-medium">
          ITA s. 47 / s. 54 / s. 85.1 Compliant
        </span>
      </div>
    </div>
  );
};
