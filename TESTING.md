# Canadian ACB Regression Suite (CPA-Style Test Suite)

This project contains a comprehensive, highly deterministic regression suite designed to validate the core Canadian Adjusted Cost Base (ACB) calculation engine and parse procedures against various Income Tax Act (ITA) rules, statutory requirements, and complex corporate/option transactions.

---

## ⚠️ Important Disclaimer
**The Canadian ACB Regression Suite is a CPA-style diagnostic tool designed to help identify anomalies, verify calculation algorithms, and test adjustments under the Income Tax Act.**
- **This software is NOT "CRA-certified", "CPA-approved", or legally guaranteed.**
- Calculations are designed according to standard interpretation of ITA rules and CRA reporting guidelines. 
- Tax rules contain complex, case-by-case subjectivities. **A professional CPA review is highly recommended and required before using any output for final tax filings.**

---

## 📂 Test Matrix & Coverage

The test suite is isolated, deterministic (using a fixed mock `referenceDate`), and does not require active browser context, `localStorage`, or external network calls. It is divided into 6 distinct unit and regression test specifications:

### 1. Core ACB Engine Calculations (`acbEngine.spec.ts`)
- **s. 47 Pool Continuity (Matrix A):** Verifies buy/sell transactions, cost basis additions, and average cost per share adjustments.
- **s. 54 Superficial Loss Rules (Matrix B):** Evaluates 30-day pre/post lookback windows, partial or total loss denials, and cost basis reallocation to remaining shares.
- **s. 53(2)(a) Return of Capital (Matrix C):** Tests cost-basis reductions due to ROC distributions and triggering of immediate capital gains (s. 40(3)) when ACB falls below zero.
- **Corporate Action Allocations (Matrix D):** Models stock splits, consolidations, asset reorganizations, and spin-off pro-rations.
- **Options Exercise & Assignment (Matrix E):** Asserts cost adjustments for long and short contracts under ITA s. 49 guidelines.
- **Short Selling / Missing ACB (Matrix F):** Ensures robust handling of zero-balance sales and short positions without producing negative taxable ACB pools or NaN errors.

### 2. Bank of Canada FX resolution (`bocFx.spec.ts`)
- Asserts accurate USD/CAD, EUR/CAD, and GBP/CAD translation.
- Verifies business-day lookbacks and manual registration overrides.

### 3. Corporate Actions Tax Matrix (`corporateActions.spec.ts`)
- Automatically classifies raw broker descriptions.
- Calculates outcomes for 11 distinct treatments including mergers, eligible/ineligible spin-offs, s. 85.1 rollovers, and capital boot adjustments.

### 4. Option Lifecycle Matrix (`optionMatrix.spec.ts`)
- Computes tax effects of stand-alone closes, expirations, exercises, and assignments for PUTs and CALLs.

### 5. Parser Specifications (`t5008Parser.spec.ts` & `ibkrFlexXmlParser.spec.ts`)
- **T5008 Parser:** Parses CSV listings, normalizing dates and header mappings.
- **IBKR Flex XML Parser:** Parses synthetic XML feeds containing accounts, trade IDs, security conids, commissions, and underlying symbols.

---

## 🛠️ How to Run the Suite

Execute the suite using standard npm package scripts:

### Run Full Unit Suite Once
```bash
npm test
```

### Continuous Watch Mode
```bash
npm run test:watch
```

### Generate Coverage Reports
```bash
npm run test:coverage
```
