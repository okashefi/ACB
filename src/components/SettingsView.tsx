import React from 'react';
import {
  Settings,
  Scale,
  ShieldAlert,
  Users,
  Coins,
  FileCheck2,
  Calendar,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { TaxSettings } from '../types/tax';

interface SettingsViewProps {
  settings: TaxSettings;
  onUpdateSettings: (newSettings: TaxSettings) => void;
  affiliateAccountsCount: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  affiliateAccountsCount,
}) => {
  const handleChange = <K extends keyof TaxSettings>(key: K, value: TaxSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div id="settings-view-container" className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#2563EB]" />
            <span>Canadian Tax & Engine Settings</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            Configure CRA statutory parameters, foreign exchange conversion sources, inclusion rates, and affiliate rules.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] rounded-xl text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Income Tax Act (Canada) Profile Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        
        {/* 1. Foreign Exchange Conversion Source */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
            <Coins className="w-4 h-4 text-[#2563EB]" />
            <span>1. Foreign Exchange (FX) Conversion Source</span>
          </div>

          <p className="text-[#71717A] text-[11px] leading-relaxed">
            Under <strong>ITA s. 261</strong>, Canadian taxpayers must convert foreign transactions to CAD using the Bank of Canada daily rate on trade date.
          </p>

          <div className="space-y-2">
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                settings.defaultFxSource === 'BANK_OF_CANADA'
                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#18181B]'
                  : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="fxSource"
                checked={settings.defaultFxSource === 'BANK_OF_CANADA'}
                onChange={() => handleChange('defaultFxSource', 'BANK_OF_CANADA')}
                className="mt-0.5 text-[#2563EB] focus:ring-0 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-xs text-[#18181B]">Bank of Canada Daily Rate (CRA Standard)</div>
                <div className="text-[11px] text-[#71717A] mt-0.5">
                  Official Valet API daily noon/closing exchange rate for USD, EUR, GBP to CAD on transaction date.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                settings.defaultFxSource === 'IBKR_ACTUAL'
                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#18181B]'
                  : 'bg-[#F9FAFB] border-[#E4E4E7] text-[#71717A] hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="fxSource"
                checked={settings.defaultFxSource === 'IBKR_ACTUAL'}
                onChange={() => handleChange('defaultFxSource', 'IBKR_ACTUAL')}
                className="mt-0.5 text-[#2563EB] focus:ring-0 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-xs text-[#18181B]">IBKR Activity Statement Settlement Rate</div>
                <div className="text-[11px] text-[#71717A] mt-0.5">
                  Uses broker-provided execution FX rate if Bank of Canada rate is unavailable or user elects.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 2. Dated Capital Gains Inclusion Rate */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
            <Calendar className="w-4 h-4 text-[#2563EB]" />
            <span>2. Capital Gains Inclusion Rate Rules</span>
          </div>

          <p className="text-[#71717A] text-[11px] leading-relaxed">
            Canadian capital gains are included into taxable income at statutory rates under <strong>ITA s. 38(a)</strong>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[#71717A] text-[11px] font-medium mb-1">Standard Base Inclusion Rate</label>
              <select
                value={settings.capitalGainsInclusionRate}
                onChange={(e) => handleChange('capitalGainsInclusionRate', e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] cursor-pointer"
              >
                <option value="0.50">50.0% (Standard Historical Inclusion Rate)</option>
                <option value="0.6667">66.67% (Tiered Post-June 25, 2024 Rule)</option>
              </select>
            </div>

            <div className="p-3 bg-[#F9FAFB] rounded-xl border border-[#E4E4E7] space-y-1">
              <div className="font-semibold text-[11px] text-[#18181B]">Dated Capital Gain Periods:</div>
              <div className="text-[10px] text-[#71717A] space-y-0.5">
                <div>• Period 1 (Prior to June 25, 2024): 50% inclusion on all net capital gains.</div>
                <div>• Period 2 (Post June 25, 2024): 50% on first $250k CAD, 66.67% on excess for individuals.</div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Tax Character & Trading Frequency Warning */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
            <Scale className="w-4 h-4 text-[#D97706]" />
            <span>3. Tax Character & Day Trading Scrutiny</span>
          </div>

          <p className="text-[#71717A] text-[11px] leading-relaxed">
            The CRA may assess high-volume trading, option flipping, or short holding periods as <strong>Business Income (100% taxable)</strong> rather than Capital Gains (Interpretation Bulletin IT-479R).
          </p>

          <div className="space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.isDayTraderWarningAcknowledged}
                onChange={(e) => handleChange('isDayTraderWarningAcknowledged', e.target.checked)}
                className="rounded-md border-[#E4E4E7] text-[#2563EB] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-[#18181B] font-medium">
                Enable CRA Business Character Scrutiny Alerts
              </span>
            </label>

            <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-[11px] text-[#92400E] space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>CRA IT-479R Factors Considered:</span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Frequency of transactions, duration of holdings, intention to resell for quick profit, use of debt/margin, and specialized derivative strategies.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Household Affiliates for Superficial Loss Tracking */}
        <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
            <Users className="w-4 h-4 text-[#7C3AED]" />
            <span>4. Household Affiliated Persons Matrix</span>
          </div>

          <p className="text-[#71717A] text-[11px] leading-relaxed">
            Under <strong>ITA s. 54 & s. 251.1</strong>, superficial losses occur if identical property is acquired within 30 days by the taxpayer OR an <em>affiliated person</em> (spouse, controlled corporation, or registered plan).
          </p>

          <div className="p-3.5 bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#18181B]">Registered Affiliates:</span>
              <span className="font-mono font-bold text-[#7C3AED] px-2 py-0.5 bg-[#F5F3FF] rounded-md border border-[#DDD6FE]">
                {affiliateAccountsCount} Accounts Linked
              </span>
            </div>
            <p className="text-[10px] text-[#71717A]">
              Automated 61-day window cross-matching is actively enabled across all linked accounts in the Accounts tab.
            </p>
          </div>

          <div className="text-[10px] text-[#71717A] space-y-1">
            <div>• Losses on transfers to TFSA/RRSP/FHSA are <strong>permanently denied</strong> (s. 40(2)(g)(iv)).</div>
            <div>• Losses on transfers to spouse/affiliate are suspended and added to affiliate's ACB (s. 40(3.4)).</div>
          </div>
        </div>

      </div>

      {/* CPA Mandatory Disclaimer Confirmation */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#18181B]">
          <FileCheck2 className="w-4 h-4 text-[#2563EB]" />
          <span>Chartered Professional Accountant (CPA) Audit Disclaimer</span>
        </div>

        <p className="text-xs text-[#71717A] leading-relaxed">
          This software produces calculated adjusted cost bases, realized capital gains, and Schedule 3 schedules under Canadian tax rules. However, taxation of corporate reorganizations, derivative contracts, and foreign spin-offs can be highly fact-specific. Reports should be verified by a Canadian CPA or qualified tax practitioner prior to CRA filing.
        </p>
      </div>

    </div>
  );
};
