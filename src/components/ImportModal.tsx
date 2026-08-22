import React, { useState } from 'react';
import { UploadCloud, FileCode2, FileSpreadsheet, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseIbkrFlexXml } from '../parsers/ibkrFlexXmlParser';
import { parseIbkrCsv } from '../parsers/ibkrCsvParser';
import { Transaction, Account, SecurityMaster, OpenPosition } from '../types/tax';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (data: {
    transactions: Transaction[];
    accounts: Account[];
    securities: SecurityMaster[];
    openPositions: OpenPosition[];
  }) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [importSummary, setImportSummary] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
    };
    reader.readAsText(file);
  };

  const handleProcessImport = () => {
    if (!fileContent.trim()) {
      setErrorMsg('Please select a file or paste XML / CSV content.');
      return;
    }

    try {
      if (fileContent.includes('<FlexQueryResponse') || fileContent.includes('<FlexStatements')) {
        // XML parser
        const parsed = parseIbkrFlexXml(fileContent);
        if (parsed.errors.length > 0) {
          setErrorMsg(`Parser warning: ${parsed.errors.join('; ')}`);
        }
        onImportComplete(parsed);
        onClose();
      } else if (fileContent.includes(',') || fileContent.includes('Trades') || fileContent.includes('Data')) {
        // CSV parser
        const parsed = parseIbkrCsv(fileContent);
        if (parsed.transactions.length === 0) {
          setErrorMsg('No trades found in CSV. Ensure this is an IBKR Activity Statement CSV export.');
          return;
        }
        onImportComplete(parsed);
        onClose();
      } else {
        setErrorMsg('Unrecognized format. Please provide an IBKR Flex XML or Activity Statement CSV.');
      }
    } catch (err: any) {
      setErrorMsg(`Parsing error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4E4E7] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 text-[#18181B] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3.5">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-[#2563EB]" />
            <h3 className="font-bold text-sm text-[#18181B]">Import IBKR Statement (XML or CSV)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#18181B] p-1.5 rounded-lg hover:bg-[#F4F4F5] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          
          <div className="border-2 border-dashed border-[#E4E4E7] hover:border-[#3B82F6] rounded-2xl p-6 text-center cursor-pointer relative bg-[#F9FAFB] transition-colors">
            <input
              type="file"
              accept=".xml,.csv,.txt"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <UploadCloud className="w-8 h-8 mx-auto text-[#71717A] mb-2" />
            <div className="font-semibold text-[#18181B]">
              {fileName ? fileName : 'Click to select IBKR Flex XML or CSV'}
            </div>
            <p className="text-[11px] text-[#71717A] mt-1">
              Supports Activity Flex Query XML, Multi-Year statement XML, and Activity CSV
            </p>
          </div>

          <div>
            <label className="block text-[#71717A] mb-1 font-medium">Or Paste Statement Content:</label>
            <textarea
              rows={5}
              placeholder="Paste raw XML (<FlexQueryResponse...>) or CSV text here..."
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E4E4E7] rounded-xl p-3 text-[#18181B] font-mono text-[11px] focus:outline-none focus:border-[#3B82F6] focus:bg-white transition-colors"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E4E7]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#71717A] rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProcessImport}
              className="px-4 py-2 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              Parse & Load into Engine
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
