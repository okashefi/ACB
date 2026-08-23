import { T5008SlipEntry } from '../types/tax';

/**
 * Parses a T5008 CSV or CRA Slip export.
 * Supports standard broker exports and CRA standardized T5008 format.
 */
export function parseT5008Csv(csvContent: string, taxYear?: number): T5008SlipEntry[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Identify header row
  const headerIdx = lines.findIndex((line) => {
    const l = line.toLowerCase();
    return (
      (l.includes('proceeds') || l.includes('box 21') || l.includes('box21') || l.includes('settlement')) &&
      (l.includes('date') || l.includes('box 13') || l.includes('box13') || l.includes('symbol') || l.includes('security'))
    );
  });

  const startIndex = headerIdx >= 0 ? headerIdx + 1 : 0;
  const headers = headerIdx >= 0 ? parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().trim()) : [];

  // Column index finders
  const findCol = (terms: string[]): number => {
    return headers.findIndex((h) => terms.some((t) => h.includes(t)));
  };

  const dateCol = findCol(['box 13', 'box13', 'date', 'settle', 'trade date']);
  const symbolCol = findCol(['box 15', 'box15', 'symbol', 'ticker', 'security', 'description', 'name']);
  const qtyCol = findCol(['box 14', 'box14', 'qty', 'quantity', 'shares', 'units']);
  const proceedsCol = findCol(['box 21', 'box21', 'proceeds', 'settlement amount', 'gross proceeds', 'amount']);
  const costCol = findCol(['box 20', 'box20', 'cost', 'book value', 'bookvalue', 'acb']);
  const curCol = findCol(['box 22', 'box22', 'currency', 'curr']);

  const entries: T5008SlipEntry[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = parseCsvLine(rawLine);
    if (cols.length < 3) continue;

    let date = dateCol >= 0 ? cols[dateCol]?.trim() : cols[0]?.trim();
    let symbol = symbolCol >= 0 ? cols[symbolCol]?.trim() : cols[1]?.trim();
    let qtyStr = qtyCol >= 0 ? cols[qtyCol]?.trim() : (cols[2] || '0');
    let proceedsStr = proceedsCol >= 0 ? cols[proceedsCol]?.trim() : (cols[3] || '0');
    let costStr = costCol >= 0 ? cols[costCol]?.trim() : (cols[4] || '0');
    let currency = curCol >= 0 ? cols[curCol]?.trim() : 'CAD';

    // Normalize date (e.g. YYYY-MM-DD or MM/DD/YYYY or YYYYMMDD)
    date = normalizeDate(date);
    if (!date) continue;

    // Clean numeric values
    const cleanQty = Math.abs(parseFloat(qtyStr.replace(/[$, ]/g, '')) || 0);
    const cleanProceeds = parseFloat(proceedsStr.replace(/[$, ]/g, '')) || 0;
    const cleanCost = costStr ? parseFloat(costStr.replace(/[$, ]/g, '')) : undefined;

    const rowYear = parseInt(date.substring(0, 4), 10);
    if (taxYear && rowYear !== taxYear) {
      continue;
    }

    // Clean symbol
    symbol = symbol.replace(/["']/g, '').trim().toUpperCase();
    if (symbol.includes(' - ')) {
      symbol = symbol.split(' - ')[0].trim();
    }

    entries.push({
      id: `T5008_${rowYear}_${i}_${symbol}`,
      taxYear: rowYear,
      date,
      symbol,
      securityDescription: symbol,
      quantity: cleanQty.toString(),
      proceedsCad: cleanProceeds.toFixed(2),
      bookValueCad: cleanCost !== undefined && !isNaN(cleanCost) ? cleanCost.toFixed(2) : undefined,
      currency: currency || 'CAD',
      rawLine,
    });
  }

  return entries;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDate(str: string): string {
  if (!str) return '';
  const clean = str.replace(/["']/g, '').trim();

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(clean)) {
    return clean.replace(/\//g, '-');
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
  }

  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
    const parts = clean.split('/');
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }

  // Try standard Date parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return clean;
}
