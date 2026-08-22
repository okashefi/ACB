import React from 'react';
import { BookOpen, UploadCloud, FileSpreadsheet, Scale, Layers, HelpCircle, ArrowRight } from 'lucide-react';

export const HelpView: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-8 shadow-2xs text-center space-y-4">
        <div className="w-16 h-16 bg-[#EFF6FF] rounded-full flex items-center justify-center mx-auto shadow-xs border border-[#BFDBFE]">
          <BookOpen className="w-8 h-8 text-[#2563EB]" />
        </div>
        <h2 className="text-2xl font-bold text-[#18181B]">Getting Started</h2>
        <p className="text-[#71717A] max-w-xl mx-auto text-sm leading-relaxed">
          Welcome to the Canadian ACB Engine. This platform helps you accurately track your Adjusted Cost Base (ACB) 
          and calculate realized capital gains/losses according to the Income Tax Act (Canada), specifically designed for IBKR users.
        </p>
      </div>

      {/* Step-by-Step Guide */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#2563EB]" />
          <span>Step-by-Step Workflow</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <UploadCloud className="w-24 h-24" />
            </div>
            <div className="w-8 h-8 bg-[#F4F4F5] rounded-xl flex items-center justify-center text-[#18181B] font-bold text-sm mb-4 border border-[#E4E4E7]">
              1
            </div>
            <h4 className="font-semibold text-[#18181B] mb-2 text-sm">Import Data</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Start by importing your IBKR Activity Flex Query XML or CSV. You can also configure the IBKR Sync for automated pulling.
            </p>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Scale className="w-24 h-24" />
            </div>
            <div className="w-8 h-8 bg-[#F4F4F5] rounded-xl flex items-center justify-center text-[#18181B] font-bold text-sm mb-4 border border-[#E4E4E7]">
              2
            </div>
            <h4 className="font-semibold text-[#18181B] mb-2 text-sm">Review Queue</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              If any corporate actions (like mergers or splits) are detected, they will appear in the Review Queue. Provide tax instructions for each.
            </p>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <FileSpreadsheet className="w-24 h-24" />
            </div>
            <div className="w-8 h-8 bg-[#F4F4F5] rounded-xl flex items-center justify-center text-[#18181B] font-bold text-sm mb-4 border border-[#E4E4E7]">
              3
            </div>
            <h4 className="font-semibold text-[#18181B] mb-2 text-sm">Verify Ledger</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              The engine recalculates your ACB according to ITA s.47 (Weighted Average Cost) and applies the 30-day superficial loss rules.
            </p>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <BookOpen className="w-24 h-24" />
            </div>
            <div className="w-8 h-8 bg-[#F4F4F5] rounded-xl flex items-center justify-center text-[#18181B] font-bold text-sm mb-4 border border-[#E4E4E7]">
              4
            </div>
            <h4 className="font-semibold text-[#18181B] mb-2 text-sm">Generate Reports</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Export your realized gains for Schedule 3, view ACB rollforwards, and prepare your T1135 foreign property summary.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ / Key Concepts */}
      <div className="space-y-4 pb-12">
        <h3 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#2563EB]" />
          <span>Key Tax Concepts & FAQ</span>
        </h3>
        
        <div className="bg-white border border-[#E4E4E7] rounded-2xl shadow-2xs overflow-hidden divide-y divide-[#E4E4E7]">
          
          <div className="p-6">
            <h4 className="font-semibold text-[#18181B] text-sm mb-2">Why can't I just use IBKR's tax reports?</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              IBKR's default tax reports often rely on US accounting rules (like FIFO or Specific Lot Identification). 
              The Canada Revenue Agency (CRA) mandates a <strong>Weighted Average Cost</strong> approach for identical properties (ITA s.47). 
              Furthermore, US Wash Sale rules differ significantly from Canadian <strong>Superficial Loss</strong> rules (ITA s.54).
            </p>
          </div>

          <div className="p-6">
            <h4 className="font-semibold text-[#18181B] text-sm mb-2">What is a Superficial Loss?</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Under ITA s.54, if you sell a security at a loss and you (or an affiliated person, like a spouse or your RRSP/TFSA) 
              buy the identical property within 30 days before or after the sale, the capital loss is denied. 
              Instead of being deductible against gains, the denied loss is added to the ACB of the repurchased shares.
            </p>
          </div>

          <div className="p-6">
            <h4 className="font-semibold text-[#18181B] text-sm mb-2">How do foreign currencies (USD) work?</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              The CRA requires you to calculate your ACB and proceeds in Canadian Dollars (CAD) using the exchange rate 
              on the settlement date of the transaction. This means a currency fluctuation can turn a USD gain into a CAD loss, or vice versa. 
              This engine tracks transactions in their original currency and applies embedded FX correctly.
            </p>
          </div>

          <div className="p-6">
            <h4 className="font-semibold text-[#18181B] text-sm mb-2">Return of Capital (ROC) vs. Dividends</h4>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Dividends (T5/foreign) are treated as taxable income in the year received and do not affect your ACB. 
              Return of Capital (ROC) distributions, however, are not immediately taxable; instead, they reduce your total ACB for that security. 
              If your ACB drops below zero, the negative amount is realized as an immediate capital gain.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
