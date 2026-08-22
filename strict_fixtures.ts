import { runAllTestFixtures } from './src/engine/testFixtures';

const results = runAllTestFixtures();
let allPassed = true;
results.forEach(r => {
  if (!r.passed) {
    console.log(`Failed: ${r.name}`);
    console.log(`  Expected: ${r.expectedResult}`);
    console.log(`  Actual:   ${r.actualResult}`);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('All fixtures passed successfully.');
}
