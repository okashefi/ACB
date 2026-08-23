# Contributing to Canadian ACB Regression Suite

Thank you for contributing! This project is a highly professional, deterministic CPA-style tax and ACB engine regression suite designed to compute adjusted cost base (ACB) and capital gains/losses according to the Canadian Income Tax Act (ITA).

---

## Strict Security & Privacy Guidelines

### 1. No Real-World Data or Secrets
- **DO NOT** commit, paste, or reference real broker files, client data, real accounts, names, or real financial tokens.
- All testing and fixtures must use completely **synthetic, anonymized** data.
- Accounts should be named generically (e.g. `ACCT_TAXABLE`, `ACCT_TFSA`, `ACCT_BROKER_2`) rather than using real personal account numbers or personal names.
- Do not add real broker files or API credentials/tokens to the repository, including any `.env` secrets.

### 2. High-Quality Deterministic Testing
- **Never use `Math.random()`** or dynamic dates (`new Date()`) inside test files or mock helper functions. All test suites must be 100% deterministic to prevent transient or flaky test failures.
- Always use the fixed/mocked reference dates and transaction counters to ensure test reproducibility.

---

## Test Framework and Commands

This repository uses [Vitest](https://vitest.dev/) for unit and regression test execution, with built-in V8 coverage thresholds.

### Runs all unit tests
```bash
npm test
```

### Launches Vitest in interactive watch mode
```bash
npm run test:watch
```

### Runs coverage reporting and verifies coverage thresholds
```bash
npm run test:coverage
```

### Runs local statement and diagnostic end-to-end report
```bash
npm run e2e:report
```

---

## Architectural Principles
- **Tax Rules Precision**: Ensure all calculations adhere strictly to Canada's Income Tax Act (ITA) concepts (s. 47 weighted average, s. 54 superficial losses, s. 49 option exercises/assignments, etc.).
- **Zero Real-World Dependency**: Tests must be completely isolated, self-contained, and run instantly without requiring a browser, external server, or local storage.
