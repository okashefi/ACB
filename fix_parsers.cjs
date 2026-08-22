const fs = require('fs');

function quoteFields(path) {
  let content = fs.readFileSync(path, 'utf8');
  // Just cast the actual mapped fields in the object literal
  content = content.replace(/:\s*Math\.abs\(parseFloat\(([^)]+)\)\)/g, ': Math.abs(parseFloat($1)).toString()');
  content = content.replace(/:\s*parseFloat\(([^)]+)\)/g, ': parseFloat($1).toString()');
  content = content.replace(/:\s*(qty|price|comm|explicitFx|cash|amount|costPrice|markPrice|posVal)(,|$)/gm, ': String($1)$2');
  fs.writeFileSync(path, content);
}

quoteFields('src/parsers/ibkrCsvParser.ts');
quoteFields('src/parsers/ibkrFlexXmlParser.ts');
