const fs = require('fs');

function patch(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/parseFloat\(([^)]+)\)/g, "String(parseFloat($1))");
  content = content.replace(/Math\.abs\(([^)]+)\)/g, "String(Math.abs($1))");
  
  // Actually, wait, simpler just to remove the float stuff and just map the types in tax.ts if I have to.
  // Wait, I can just replace `parseFloat` in transaction mapping with `String(parseFloat)`.
  
  // The problem is `const qty = parseFloat(...)` vs `quantity: parseFloat(...)`
  // Let's just fix the assignment.
}
