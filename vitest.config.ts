import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/engine/acbEngine.ts',
        'src/engine/superficialLoss.ts',
        'src/engine/corporateActions.ts',
        'src/engine/optionMatrix.ts',
        'src/parsers/ibkrFlexXmlParser.ts',
        'src/parsers/t5008Parser.ts',
      ],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 90,
        lines: 75,
      },
      reporter: ['text', 'json', 'html'],
    },
  },
});
