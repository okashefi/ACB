const fs = require('fs');

let code = fs.readFileSync('src/engine/testFixtures.ts', 'utf8');

// Replace category missing error
code = code.replace(/passed\s*\n\s*\}\);/g, "passed,\n      category: 'Uncategorized',\n    });");

// Replace numbers in Transactions
// e.g. quantity: 100 -> quantity: '100'
const fieldsToQuote = ['quantity', 'price', 'commission', 'totalGrossAmount', 'totalNetAmount', 'fxRate', 'amountCad', 'commissionCad', 'totalOutlaysCad'];

fieldsToQuote.forEach(f => {
  const regex = new RegExp(`(\\b${f}:\\s*)(-?\\d+(\\.\\d+)?)`, 'g');
  code = code.replace(regex, '$1\'$2\'');
});

fs.writeFileSync('src/engine/testFixtures.ts', code);
