import { describe, it, expect } from 'vitest';
import { runAllTestFixtures } from '../testFixtures';

describe('Canadian ACB Regression Suite - E2E Test Fixtures', () => {
  it('should pass all 28 E2E tax engine and option matrix fixtures', () => {
    const results = runAllTestFixtures();
    const failed = results.filter((r) => !r.passed);
    
    if (failed.length > 0) {
      console.error('Failed fixtures:', failed.map(f => `${f.id}: ${f.name} (Expected: ${f.expectedResult}, Actual: ${f.actualResult})`));
    }
    
    expect(failed).toHaveLength(0);
  });
});
