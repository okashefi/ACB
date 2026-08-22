const fs = require('fs');

let code = fs.readFileSync('src/engine/testFixtures.ts', 'utf8');

// Replace strict equality with double equality for fields that might be string vs number now
code = code.replace(/(\w+\?\.\w+)\s*===\s*(\d+(\.\d+)?)/g, 'Number($1) === $2');

// And replace simple cg === 0
code = code.replace(/\bcg === (\d+)/g, 'Number(cg) === $1');
code = code.replace(/\bdivIncome === (\d+)/g, 'Number(divIncome) === $1');
code = code.replace(/Number\(parentBal\?\.totalAcbCad\)\s*===\s*(\d+)/g, 'Number(parentBal?.totalAcbCad) === $1');
code = code.replace(/Number\(spinBal\?\.totalAcbCad\)\s*===\s*(\d+)/g, 'Number(spinBal?.totalAcbCad) === $1');
code = code.replace(/Number\(oldBalance\?\.quantity\)\s*===\s*(\d+)/g, 'Number(oldBalance?.quantity) === $1');
code = code.replace(/Number\(newBalance\?\.quantity\)\s*===\s*(\d+)/g, 'Number(newBalance?.quantity) === $1');
code = code.replace(/Number\(newBalance\?\.totalAcbCad\)\s*===\s*(\d+)/g, 'Number(newBalance?.totalAcbCad) === $1');

fs.writeFileSync('src/engine/testFixtures.ts', code);
