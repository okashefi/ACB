import { runAllTestFixtures, TestFixtureResult } from './src/engine/testFixtures';

const results = runAllTestFixtures();
results.forEach(r => {
  if (!r.passed) {
    console.log(`Failed: ${r.name}`);
    console.log(`  Expected: ${r.expectedResult}`);
    console.log(`  Actual:   ${r.actualResult}`);
  }
});
