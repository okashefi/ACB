const fs = require('fs');
let code = fs.readFileSync('src/engine/superficialLoss.ts', 'utf8');
code = code.replace(/rawLossCad: 0/g, "rawLossCad: '0'");
code = code.replace(/deniedLossCad: 0/g, "deniedLossCad: '0'");
code = code.replace(/isPermanentlyDeniedInRegistered:\s*isRegisteredReplacement,/g, "isPermanentlyDeniedInRegistered: isRegisteredReplacement,")
fs.writeFileSync('src/engine/superficialLoss.ts', code);
