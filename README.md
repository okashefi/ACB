# Canadian ACB & Capital Gains Engine

Local web application that calculates Canadian adjusted cost base (ACB) and capital gains for stocks and listed options (CAD + USD) under Income Tax Act (Canada) s. 47 average cost rules. Built for Canadian-resident individuals using Interactive Brokers (and manual trade entry).

This application is an educational and tax-prep utility, not a filed return, legal advice, or official CPA counsel. Do not rely on IBKR's U.S. FIFO or T5008 figures for Canadian tax filing. Never commit Flex XML statements, API tokens, or account numbers to version control.

## Empty UI & Getting Started

Upon first launch, the application displays an **empty UI** with no default transactions loaded. To begin tracking your Canadian tax ledger, choose one of two options:
1. **Pull via IBKR Flex API**: Configure your Query ID in the **Connections** tab or `.env` and click **Sync / Backfill**.
2. **Import Statement File**: Click **Import** in the top navigation bar to upload an IBKR Flex XML or Activity CSV file.

## Import Strategies: Merge vs. Replace

When uploading a statement or syncing data:
- **Merge Additional Year (Default)**: Deduplicates and upserts trades by transaction ID. Preserves existing years, corporate action approvals, and manual entries while merging incoming accounts and securities.
- **Replace All**: Wipes the current local browser ledger and reinitializes state using the newly uploaded statement.

## IBKR Flex Limits & Backfill Walk

- **365-Day Request Limit**: IBKR Flex Web Service caps each query response to a maximum of 365 calendar days.
- **Full Backfill Walk**: The **Full Backfill** button automatically executes sequential 365-day requests across the 4 prior CRA tax years plus the current calendar year (`currentYear - 4` through `currentYear`).
- **Incremental Sync**: Subsequent syncs query only the date range from `lastSuccessDate - 3 days` to today to capture late settlements or adjustments.

## Opening ACB Requirement

Trade history pulled from IBKR reflects only trades within the query date range. If you held positions established before your earliest statement date:
- You **must add an Opening ACB entry** (via Manual Entry or Opening Position) for the date preceding your first recorded trade.
- Without an Opening ACB, dispositions of pre-existing positions will calculate incorrect cost bases.

## T5008 Reconciliation: Proceeds vs. Book Value

- **Do NOT copy IBKR T5008 Book Value (Box 20) onto CRA Schedule 3**: T5008 book value reported by brokers often uses U.S. FIFO rules, excludes Superficial Loss adjustments, or ignores foreign FX conversions.
- **Use T5008 to check Proceeds (Box 21)**: Use the app's **T5008 Reconciliation** tool in **Tax Reports** to verify that gross proceeds reported to the CRA match your ledger, while using this app's calculated ACB for filing Schedule 3.

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
| `IBKR_FLEX_TOKEN` | IBKR Flex Web Service token (server-side only). Leave empty if importing via file upload. |
| `IBKR_FLEX_QUERY_ID` | Activity Flex Query ID from IBKR Client Portal. |

### 4. Start Development Server
```bash
bun run dev
# or
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Run Test Suite & E2E Report
`bun run e2e:report` (or `npm run e2e:report`) executes `scripts/e2e-report.ts` via `tsx` to verify all test fixtures and section 47 tax math:
```bash
bun run e2e:report
# Or test with an external Flex XML statement (outside workspace):
bun run e2e:report --flex /path/to/statement.xml
```

### 6. Stop & Reset
- **Stop server**: Press `Ctrl+C` in the terminal.
- **Reset local data**: Clear browser `localStorage` key `canadian_acb_data_v1`.

## Security & Storage Architecture

- **Token Safety**: Your `IBKR_FLEX_TOKEN` is strictly stored server-side in `.env` (or requested via server proxy) and is **never** saved to `localStorage` or exposed in the client JavaScript bundle.
- **Browser-Only Storage**: `localStorage` holds your full tax ledger locally in browser storage (`canadian_acb_data_v1`). It is local device storage, not a remote cloud vault.
- **Privacy First**: Application logs do not record `accountId`s, client names, or raw Flex XML payloads.
- **Git Hygiene**: `.env`, `data/`, `*.xml`, and `*flex*` files are strictly ignored by `.gitignore`. Never push raw Flex XML statements or tokens to git repositories.

## IBKR Flex Setup Guide

1. Log in to IBKR Client Portal → **Performance & Reports → Flex Queries**.
2. Create an **Activity Flex Query** only (not Trade Confirmation).
3. Generate a token in **Flex Web Service Configuration** and copy your **Query ID**.
4. In query section configuration, open **Trades** and set detail level to **Executions** (not Orders or Closed Lots).
5. Enable required sections: **Trades**, **Cash Transactions**, **Corporate Actions**, **Transfers**, **Open Positions**, **Account Information**, and **Financial Instrument Information** (**Option EAE** if present). Exchange rates are included via `FX Rate to Base`.
6. Set Delivery Format to **XML**, Period to **Last 365 Calendar Days**, Date Format to **yyyy-MM-dd**, Include Currency Rates to **Yes**, and Include Canceled Trades to **Yes**.
7. In the app, map account tax types (Taxable vs TFSA/RRSP/FHSA) and run Backfill.

## Application Map

| Area | What the user does there |
|---|---|
| **Dashboard** | Tax year coverage, year-by-year summary cards, total taxable portfolio ACB, and pending review queue. |
| **ACB Ledger** | View running ACB per security, total ACB, unit cost, ITA rules applied, and transaction IDs. |
| **Review Queue** | Classify corporate actions (takeovers, cash boot vs dividend vs ROC, ss. 85.1/86/87). |
| **IBKR Sync** | Configure token/query ID, trigger historical backfill or 3-day sync, and review setup guide. |
| **Tax Reports** | Schedule 3 capital gains CSV, T5008 vs App discrepancy reconciliation, ACB rollforward, and superficial loss audit. |
| **Accounts** | Map accounts as taxable vs registered (TFSA/RRSP/FHSA) and tag household affiliates. |
| **Settings** | Select FX rate source (Bank of Canada vs broker), tax inclusion rate, and day-trader warning. |
| **Help & Guide** | Complete guide on Activity Flex Query setup, CRA average cost rules, and filing instructions. |

---
*Disclaimer: This software is an educational calculation tool and does not constitute professional tax, accounting, or legal advice. Consult a qualified Canadian Chartered Professional Accountant (CPA) for tax filing guidance.*
