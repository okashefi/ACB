import React, { useState } from 'react';
import { Building2, Shield, PlusCircle, CheckCircle2, User, Key } from 'lucide-react';
import { Account, SecurityMaster } from '../types/tax';

interface AccountsViewProps {
  accounts: Account[];
  securities: SecurityMaster[];
  onAddAccount: (acc: Account) => void;
  onUpdateAccount: (acc: Account) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  securities,
  onAddAccount,
  onUpdateAccount,
}) => {
  const [newAccName, setNewAccName] = useState('');
  const [newAccId, setNewAccId] = useState('');
  const [newAccType, setNewAccType] = useState<any>('taxable');
  const [isAffiliate, setIsAffiliate] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccId) return;

    onAddAccount({
      id: newAccId,
      accountId: newAccId,
      name: newAccName || newAccId,
      broker: 'IBKR',
      accountType: newAccType,
      baseCurrency: 'CAD',
      isHouseholdAffiliate: isAffiliate,
    });

    setNewAccName('');
    setNewAccId('');
    setShowAddForm(false);
  };

  return (
    <div id="accounts-view-container" className="space-y-6 max-w-5xl mx-auto">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#18181B] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#2563EB]" />
            <span>Accounts & Security Registry</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            Configure taxable vs registered accounts and link household affiliates for superficial loss tracking (ITA s. 54).
          </p>
        </div>

        <button
          id="btn-add-account-toggle"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3.5 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Add Account</span>
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4 text-xs">
          <h3 className="font-semibold text-[#18181B] text-sm">Register New Broker / Affiliate Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[#71717A] mb-1">Account Number / ID</label>
              <input
                type="text"
                placeholder="e.g. U1234567 or RBC-1234"
                value={newAccId}
                onChange={(e) => setNewAccId(e.target.value)}
                required
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1">Account Alias / Name</label>
              <input
                type="text"
                placeholder="e.g. Spouse Margin Account"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1">Account Tax Classification</label>
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value as any)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] cursor-pointer shadow-2xs"
              >
                <option value="taxable">Taxable Non-Registered (Margin / Cash)</option>
                <option value="tfsa">TFSA (Tax-Free Savings Account)</option>
                <option value="rrsp">RRSP / RRIF (Registered Retirement)</option>
                <option value="fhsa">FHSA (First Home Savings Account)</option>
                <option value="corporate">Corporate (Controlled Corp)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-affiliate-checkbox"
              checked={isAffiliate}
              onChange={(e) => setIsAffiliate(e.target.checked)}
              className="rounded-md border-[#E4E4E7] text-[#2563EB] focus:ring-0 cursor-pointer"
            />
            <label htmlFor="is-affiliate-checkbox" className="text-[#18181B] cursor-pointer text-xs">
              Mark as <strong>Affiliated Person Account</strong> (Spouse / Controlled Corporation under ITA s. 251.1 for superficial loss tracking)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#71717A] rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              Save Account
            </button>
          </div>
        </form>
      )}

      {/* Accounts List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-white border border-[#E4E4E7] rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#2563EB]" />
                <span className="font-bold text-xs text-[#18181B] font-mono">{acc.accountId}</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                acc.accountType === 'taxable'
                  ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                  : 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
              }`}>
                {acc.accountType.toUpperCase()}
              </span>
            </div>

            <div className="text-xs text-[#18181B] font-semibold">{acc.name}</div>

            <div className="text-[11px] text-[#71717A] flex items-center justify-between border-t border-[#E4E4E7] pt-2.5">
              <span>Broker: {acc.broker}</span>
              {acc.isHouseholdAffiliate ? (
                <span className="text-[#7C3AED] flex items-center gap-1 font-medium">
                  <Shield className="w-3 h-3" />
                  <span>Affiliated Person</span>
                </span>
              ) : (
                <span className="text-[#71717A]">Primary Taxpayer</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Securities Master List */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl p-6 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider text-[11px]">
          Security Master Directory ({securities.length} Securities)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-[#E4E4E7] bg-[#F4F4F5] text-[#71717A] text-[10px] uppercase font-semibold">
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Security Name</th>
                <th className="py-2.5 px-3">Asset Class</th>
                <th className="py-2.5 px-3">Currency</th>
                <th className="py-2.5 px-3">Exchange</th>
                <th className="py-2.5 px-3">ISIN / CUSIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7]">
              {securities.map((sec) => (
                <tr key={sec.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-[#18181B]">{sec.symbol}</td>
                  <td className="py-2.5 px-3 text-[#18181B] font-sans">{sec.name}</td>
                  <td className="py-2.5 px-3 text-[#71717A]">{sec.assetClass}</td>
                  <td className="py-2.5 px-3 text-[#71717A]">{sec.currency}</td>
                  <td className="py-2.5 px-3 text-[#71717A]">{sec.exchange || 'TSE/NASDAQ'}</td>
                  <td className="py-2.5 px-3 text-[#A1A1AA] text-[10px]">{sec.isin || sec.cusip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
