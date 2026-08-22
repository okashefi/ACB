const fs = require('fs');

function patchFile(path, replacer) {
  let content = fs.readFileSync(path, 'utf8');
  content = replacer(content);
  fs.writeFileSync(path, content);
}

// 1. Fix ibkrCsvParser.ts
patchFile('src/parsers/ibkrCsvParser.ts', code => {
  return code.replace(/parseFloat\(([^)]+)\)/g, 'parseFloat($1).toString()');
});

// 2. Fix ibkrFlexXmlParser.ts
patchFile('src/parsers/ibkrFlexXmlParser.ts', code => {
  // We don't want to break standard variables, just the assignment to object fields
  // Let's replace the whole file where it assigns a string that was parseFloat.
  // Wait, I can just replace all parseFloat(xxx) with parseFloat(xxx).toString() where they are being assigned to transaction fields, but they are used in const as well.
  // Actually, wait, let's just use .toString() on the specific fields when creating objects.
  
  // It's easier to just cast everything in the output objects.
  let res = code.replace(/quantity: Math\.abs\([^)]+\)/g, match => match + '.toString()');
  res = res.replace(/price: parseFloat\([^)]+\)/g, match => match + '.toString()');
  res = res.replace(/commission: Math\.abs\([^)]+\)/g, match => match + '.toString()');
  res = res.replace(/amountCad: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  res = res.replace(/commissionCad: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  res = res.replace(/totalOutlaysCad: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  res = res.replace(/totalGrossAmount: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  res = res.replace(/totalNetAmount: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  res = res.replace(/fxRate: [^,]+,/g, match => match.trim().endsWith('toString(),') ? match : match.replace(/,$/, '.toString(),'));
  
  // Actually, simple regex to wrap all parseFloat in those files with String()
  return res;
});

// Let's run a more robust regex via node:
