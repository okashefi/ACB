import React, { useState } from 'react';
import { PlusCircle, X, Calculator, Calendar, DollarSign, Split } from 'lucide-react';
import { Transaction, Account, SecurityMaster, TransactionType } from '../types/tax';
import { convertToCad } from '../engine/bocFx';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  securities: SecurityMaster[];
  onAddTransaction: (tx: Transaction, newSec?: SecurityMaster) => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  accounts,
  securities,
  onAddTransaction,
}) => {
  const [type, setType] = useState<TransactionType>('BUY');
  const [symbol, setSymbol] = useState('RY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('140.00');
  const [currency, setCurrency] = useState('CAD');
  const [commission, setCommission] = useState('1.00');
  const [accountId, setAccountId] = useState(accounts[0]?.id || 'U_DEFAULT');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity) || 0;
    const prc = parseFloat(price) || 0;
    const comm = parseFloat(commission) || 0;
    const gross = qty * prc;

    const { amountCad, fxRate, fxSource } = convertToCad(gross, currency, date);
    const { amountCad: commCad } = convertToCad(comm, currency, date);

    const secId = `SYM_${symbol.toUpperCase()}`;
    let newSec: SecurityMaster | undefined;

    if (!securities.some((s) => s.id === secId || s.symbol === symbol.toUpperCase())) {
      newSec = {
        id: secId,
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        assetClass: 'STK',
        currency,
      };
    }

    const tx: Transaction = {
      id: `MANUAL_${Date.now()}_${symbol.toUpperCase()}`,
      accountId,
      securityId: secId,
      symbol: symbol.toUpperCase(),
      date,
      transactionType: type,
      quantity: qty,
      price: prc,
      currency,
      commission: comm,
      totalGrossAmount: gross,
      totalNetAmount: gross + (type === 'BUY' ? comm : -comm),
      fxRate,
      fxRateSource: fxSource,
      amountCad,
      commissionCad: commCad,
      totalOutlaysCad: commCad,
      reviewNotes: notes,
      status: 'approved',
      source: 'MANUAL_ENTRY',
    };

    onAddTransaction(tx, newSec);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4E4E7] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 text-[#18181B] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3.5">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#2563EB]" />
            <h3 className="font-bold text-sm text-[#18181B]">Add Manual Tax Event / Transaction</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#18181B] p-1.5 rounded-lg hover:bg-[#F4F4F5] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Transaction Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] focus:bg-white transition-colors"
              >
                <option value="BUY">BUY (Acquisition)</option>
                <option value="SELL">SELL (Disposition)</option>
                <option value="RETURN_OF_CAPITAL">Return of Capital (ROC)</option>
                <option value="STOCK_SPLIT">Stock Split</option>
                <option value="DIVIDEND">Cash Dividend</option>
                <option value="OPENING_BALANCE">Opening Balance / Carryover</option>
              </select>
            </div>

            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] focus:bg-white transition-colors"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.accountId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono uppercase focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] focus:bg-white transition-colors font-mono"
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Quantity</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Price / Share</label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[#71717A] mb-1 font-medium">Commission</label>
              <input
                type="number"
                step="any"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] font-mono focus:border-[#3B82F6] focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#71717A] mb-1 font-medium">Notes / CRA Reference</label>
            <input
              type="text"
              placeholder="e.g. Purchased on TSX, transfer from spousal account"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl px-3 py-2 text-[#18181B] focus:border-[#3B82F6] focus:bg-white transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E4E4E7]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#71717A] rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              Save Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
