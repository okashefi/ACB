# Canadian ACB & Capital Gains Engine

Local web application that calculates Canadian adjusted cost base (ACB) and capital gains for stocks and listed options (CAD + USD) under Income Tax Act (Canada) s. 47 average cost rules. Built for Canadian-resident individuals using Interactive Brokers (and manual trade entry).

This application is an educational and tax-prep utility, not a filed return, legal advice, or official CPA counsel. Do not rely on IBKR's U.S. FIFO or T5008 figures for Canadian tax filing. Never commit Flex XML statements, API tokens, or account numbers to version control.

## Local Setup

### 1. Prerequisites
- Node.js (v20+ LTS recommended) or Bun runtime
- Git

### 2. Install Dependencies
```bash
bun install
# or
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Optional. Powers the in-app AI tax assistant for corporate action explanations. |
| `APP_URL` | Local server base URL (default: `http://localhost:3000`). |
| `IBKR_FLEX_TOKEN` | IBKR Flex Web Service token (server-side only). Leave empty for sandbox/file import. |
| `IBKR_FLEX_QUERY_ID` | Activity Flex Query ID from IBKR Client Portal. |

### 4. Start Development Server
```bash
bun run dev
# or
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Run Test Suite & E2E Report
```bash
bun run e2e:report
# Or test with an external Flex XML statement (outside workspace):
bun run e2e:report --flex /path/to/statement.xml
```

### 6. Stop & Reset
- **Stop server**: Press `Ctrl+C` in the terminal.
- **Reset local data**: Clear browser `localStorage` key `canadian_acb_data_v1` or click Reset in Settings.

### Security
- `.env`, `data/`, `*.xml`, and `*flex*` files are ignored by `.gitignore`.
- Your `IBKR_FLEX_TOKEN` resides strictly on the server in `.env` and is never exposed to browser client code.
- Default IBKR token expiration is 6 hours; set it to 1 year in IBKR Client Portal to prevent sync breaks.
- Never push raw Flex statements or credentials to git repositories.

## IBKR Setup

Refer to the in-app **Connections** tab for full interactive instructions:
1. Log in to IBKR Client Portal → **Performance & Reports → Flex Queries**.
2. Create an **Activity Flex Query** only (not Trade Confirmation).
3. Generate a token in **Flex Web Service Configuration** and save your saved **Query ID**.
4. In query section configuration, open **Trades** and set detail level to **Executions** (not Orders or Closed Lots).
5. Enable required sections: **Trades**, **Cash Transactions**, **Corporate Actions**, **Transfers**, **Open Positions**, **Account Information**, and **Financial Instrument Information** (**Option EAE** if present). Exchange rates are included via `FX Rate to Base`.
6. Set Delivery Format to **XML**, Period to **Last 365 Calendar Days**, Date Format to **yyyy-MM-dd**, Include Currency Rates to **Yes**, and Include Canceled Trades to **Yes**.
7. In the app, map account tax types (Taxable vs TFSA/RRSP/FHSA) and run Backfill.

## Application Map

The application is structured into functional tabs for managing tax calculations:

| Area | What the user does there |
|---|---|
| **Dashboard** | Year-to-date realized P&L, last sync status, pending review queue, and token health. |
| **Connections / IBKR** | Configure token/query ID, trigger historical backfill or 3-day sync, or upload XML files. |
| **Review Queue** | Classify corporate actions (takeovers, cash boot vs dividend vs ROC, ss. 85.1/86/87). |
| **Ledger** | View running ACB per security, total ACB, unit cost, ITA rules applied, and transaction IDs. |
| **Reports** | Export Schedule 3 CSV, gain/loss rollforward, superficial loss audit, and dividend/ROC logs. |
| **Accounts** | Map accounts as taxable vs registered (TFSA/RRSP/FHSA) and tag household affiliates. |
| **Settings** | Select FX rate source (Bank of Canada vs broker), tax inclusion rate, and day-trader warning. |
| **Manual Entry** | Enter opening ACB, manual trades, corporate action wizard, option exercise, and tax overrides. |
| **Test Suite** | Run internal tax engine test fixtures (must maintain 22/22 pass rate). |

### Engine Core
- Calculates one shared taxable ACB pool per identical security across all non-registered accounts (ITA s. 47).
- Registered accounts (TFSA, RRSP, FHSA) are tracked separately and never enter the taxable ACB pool.
- All transactions convert to CAD on trade date; currency fluctuations are embedded inside the capital gain.
- Identifies superficial losses (30 days before/after); repurchases in registered accounts result in permanent loss denial.
- IBKR `fifoPnlRealized` values are parsed for comparison only and do not drive Canadian tax totals.

## Project Layout

- `src/engine/` — Core Canadian ACB engine (`acbEngine.ts`), Decimal math (`decimal.ts`), and test fixtures (`testFixtures.ts`).
- `src/parsers/` — IBKR Flex Web Service XML parser (`ibkrFlexXmlParser.ts`).
- `src/services/` — IBKR Flex Web Service API client and Bank of Canada FX fetching.
- `src/components/` — React UI components for Dashboard, Ledger, Connections, Reports, etc.
- `server.ts` — Express proxy server for IBKR Flex Web Service, Bank of Canada FX, and Gemini AI.
- `scripts/` — CLI utilities (`e2e-report.ts` for fixture verification and external statement audit).

## Troubleshooting

| Issue | Root Cause & Resolution |
|---|---|
| **Blank page or port conflict** | Port 3000 is occupied. Stop running Node processes or restart dev server. |
| **IBKR Error 1012 / 1015** | Token expired or Query ID invalid. Generate a new token in IBKR Client Portal. |
| **"Executions not found"** | In IBKR Flex Query, open Trades section and set detail level dropdown to **Executions**. |
| **Date parse errors** | Set General Configuration **Date Format** to `yyyy-MM-dd` in IBKR Flex Query settings. |
| **Quantity discrepancy after sync** | Unreviewed corporate actions pending in Review Queue. Confirm treatments to post. |
| **Fixtures failing** | Run `bun run e2e:report`. Fix any tax engine regression before filing. |

---
*Disclaimer: This software is an educational calculation tool and does not constitute professional tax, accounting, or legal advice. Consult a qualified Canadian Chartered Professional Accountant (CPA) for tax filing guidance.*
