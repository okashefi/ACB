import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Decimal from 'decimal.js';
import { runAllTestFixtures, TestFixtureResult } from '../src/engine/testFixtures';
import { parseIbkrFlexXml, ParsedFlexStatement } from '../src/parsers/ibkrFlexXmlParser';
import { runAcbEngine, reconcilePositions } from '../src/engine/acbEngine';
import { d, toMoney } from '../src/engine/decimal';
import { Transaction, Account, SecurityMaster, OpenPosition } from '../src/types/tax';

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(): { flexPath?: string; outPath?: string } {
  const args = process.argv.slice(2);
  let flexPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--flex' && i + 1 < args.length) {
      flexPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outPath = args[i + 1];
      i++;
    }
  }

  return { flexPath, outPath };
}

function sanitizeText(text: string, acctMap: Map<string, string>): string {
  if (!text) return text;
  let res = text;
  acctMap.forEach((anonId, rawId) => {
    if (rawId && rawId.length > 2) {
      res = res.replaceAll(rawId, anonId);
    }
  });
  // Replace standard IBKR account number patterns (e.g., U1234567, DU123456)
  res = res.replace(/\b[A-Z]{1,2}\d{5,8}\b/g, 'ACCT_REDACTED');
  return res;
}

function main() {
  const { flexPath, outPath } = parseArgs();
  const today = new Date().toISOString().split('T')[0];
  const commit = getGitCommit();

  const lines: string[] = [];
  lines.push('# ACB E2E report');
  lines.push(`Date: ${today}`);
  lines.push(`Commit: ${commit}`);
  lines.push('');

  // 1. Fixtures
  const fixtures = runAllTestFixtures();
  const passedCount = fixtures.filter((f) => f.passed).length;
  const failedFixtures = fixtures.filter((f) => !f.passed);

  lines.push('## Fixtures');
  lines.push(`- Passed: ${passedCount} / ${fixtures.length}`);
  if (failedFixtures.length > 0) {
    lines.push('- Failed:');
    failedFixtures.forEach((f) => {
      lines.push(`  - ${f.id} — ${f.name}`);
      lines.push(`    expected: ${f.expectedResult}`);
      lines.push(`    actual: ${f.actualResult}`);
    });
  } else {
    lines.push('- Failed: None');
  }
  lines.push('');

  // 2. Flex Parse & Engine (if flex file passed)
  if (flexPath) {
    const absFlex = path.resolve(flexPath);
    const cwd = process.cwd();

    if (absFlex.startsWith(cwd)) {
      console.error(`Warning: Flex file '${flexPath}' is inside the repository workspace directory. Ensure it is never committed.`);
    }

    if (!fs.existsSync(absFlex)) {
      console.error(`Error: Specified Flex file '${flexPath}' not found.`);
      process.exit(1);
    }

    const xmlContent = fs.readFileSync(absFlex, 'utf-8');
    const rawParsed = parseIbkrFlexXml(xmlContent);

    // Redaction setup
    const acctMap = new Map<string, string>();
    let acctCounter = 1;
    rawParsed.accounts.forEach((acct) => {
      if (!acctMap.has(acct.accountId)) {
        acctMap.set(acct.accountId, `ACCT_${acctCounter++}`);
      }
    });

    const redactedAccounts: Account[] = rawParsed.accounts.map((acct) => ({
      ...acct,
      accountId: acctMap.get(acct.accountId) || 'ACCT_X',
      name: `Account ${acctMap.get(acct.accountId) || 'X'}`,
    }));

    const redactedTransactions: Transaction[] = rawParsed.transactions.map((tx) => ({
      ...tx,
      accountId: acctMap.get(tx.accountId) || tx.accountId,
      targetAccountId: tx.targetAccountId ? (acctMap.get(tx.targetAccountId) || 'ACCT_DEST') : undefined,
      sourceAccountId: tx.sourceAccountId ? (acctMap.get(tx.sourceAccountId) || 'ACCT_SRC') : undefined,
      reviewNotes: tx.reviewNotes ? sanitizeText(tx.reviewNotes, acctMap) : undefined,
    }));

    const redactedOpenPositions: OpenPosition[] = rawParsed.openPositions.map((pos) => ({
      ...pos,
      accountId: acctMap.get(pos.accountId) || 'ACCT_X',
    }));

    // Account counts
    const registeredTypes = ['tfsa', 'rrsp', 'rrif', 'fhsa', 'resp', 'rdsp', 'lira', 'other_registered'];
    let taxableAcctCount = 0;
    let registeredAcctCount = 0;
    let unknownAcctCount = 0;

    redactedAccounts.forEach((a) => {
      if (a.accountType === 'taxable') taxableAcctCount++;
      else if (registeredTypes.includes(a.accountType)) registeredAcctCount++;
      else unknownAcctCount++;
    });

    // Row counts
    const tradesCount = redactedTransactions.filter((t) =>
      (['BUY', 'SELL', 'BUY_TO_COVER', 'SELL_SHORT', 'BUY_TO_OPEN_OPT', 'SELL_TO_CLOSE_OPT', 'SELL_TO_OPEN_OPT', 'BUY_TO_CLOSE_OPT'] as string[]).includes(t.transactionType)
    ).length;

    const cashCount = redactedTransactions.filter((t) =>
      (['DIVIDEND_CASH', 'DIVIDEND_REINVESTED', 'WITHHOLDING_TAX', 'INTEREST_PAID', 'INTEREST_RECEIVED', 'RETURN_OF_CAPITAL', 'PAYMENT_IN_LIEU'] as string[]).includes(
        t.transactionType
      )
    ).length;

    const caCount = redactedTransactions.filter((t) =>
      (['STOCK_SPLIT', 'STOCK_CONSOLIDATION', 'STOCK_DIVIDEND', 'MERGER_ALL_CASH', 'MERGER_SHARE_EXCHANGE', 'MERGER_MIXED', 'SPINOFF', 'RIGHTS_ISSUE', 'WORTHLESS_SECURITIES_S50'] as string[]).includes(
        t.transactionType
      )
    ).length;

    const transfersCount = redactedTransactions.filter((t) =>
      (['TRANSFER_IN', 'TRANSFER_OUT'] as string[]).includes(t.transactionType)
    ).length;

    const optionExCount = redactedTransactions.filter((t) =>
      (['EXERCISE_LONG_CALL', 'ASSIGNED_SHORT_CALL', 'EXERCISE_LONG_PUT', 'ASSIGNED_SHORT_PUT', 'OPT_EXPIRY_LONG', 'OPT_EXPIRY_SHORT'] as string[]).includes(
        t.transactionType
      )
    ).length;

    const openPosCount = redactedOpenPositions.length;

    // Sections
    const presentSections: string[] = [];
    const missingSections: string[] = [];

    if (rawParsed.hasTradesSection) presentSections.push('Trades'); else missingSections.push('Trades');
    if (rawParsed.hasCashTransactionsSection) presentSections.push('CashTransactions'); else missingSections.push('CashTransactions');
    if (rawParsed.hasCorporateActionsSection) presentSections.push('CorporateActions'); else missingSections.push('CorporateActions');
    if (rawParsed.hasTransfersSection) presentSections.push('Transfers'); else missingSections.push('Transfers');
    if (rawParsed.hasOptionExercisesSection) presentSections.push('OptionExercises'); else missingSections.push('OptionExercises');
    if (rawParsed.hasOpenPositionsSection) presentSections.push('OpenPositions'); else missingSections.push('OpenPositions');

    const sanitizedErrors = rawParsed.errors.slice(0, 5).map((e) => sanitizeText(e, acctMap));

    lines.push('## Flex parse');
    lines.push(`- File: ${path.basename(flexPath)}`);
    lines.push(`- Rows: trades=${tradesCount} cash=${cashCount} CA=${caCount} transfers=${transfersCount} optionEx=${optionExCount} openPos=${openPosCount}`);
    lines.push(`- Sections present: ${presentSections.join(', ') || 'None'}`);
    lines.push(`- Sections missing: ${missingSections.join(', ') || 'None'}`);
    lines.push(`- Accounts: taxable=${taxableAcctCount} registered=${registeredAcctCount} unknown=${unknownAcctCount}`);
    lines.push(`- Parse errors: ${rawParsed.errors.length}${sanitizedErrors.length > 0 ? ' (' + sanitizedErrors.join('; ') + ')' : ''}`);
    lines.push('');

    // Engine summary
    const engineOutput = runAcbEngine(redactedTransactions, redactedAccounts, rawParsed.securities);

    const activeBalances = Array.from(engineOutput.securityBalances.values()).filter((b) =>
      d(b.quantity).isPositive()
    );

    activeBalances.sort((a, b) => d(b.totalAcbCad).minus(d(a.totalAcbCad)).toNumber());

    lines.push('## Engine');
    lines.push(`- Taxable pools: ${activeBalances.length}`);
    lines.push('- Top positions (qty / ACB CAD / ACB per unit):');

    const topList = activeBalances.slice(0, 25);
    topList.forEach((bal) => {
      const qtyStr = bal.quantity;
      const acbStr = `$${bal.totalAcbCad}`;
      const perUnitStr = `$${bal.acbPerUnitCad || toMoney(d(bal.totalAcbCad).dividedBy(d(bal.quantity)))}`;
      lines.push(`  - ${bal.symbol.padEnd(8)} ${qtyStr.padStart(8)}  ${acbStr.padStart(12)}  ${perUnitStr.padStart(10)}/unit`);
    });
    if (activeBalances.length > 25) {
      lines.push(`  - ... +${activeBalances.length - 25} more`);
    }

    // Realized
    const years = engineOutput.realizedGainsLosses
      .map((r) => Number(r.taxYear))
      .filter((y) => !isNaN(y) && y > 0);
    const latestYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
    const rglLatest = engineOutput.realizedGainsLosses.filter((r) => Number(r.taxYear) === latestYear);
    const netGainsCad = rglLatest.reduce((acc, r) => acc.plus(d(r.recognizedGainLossCad)), d(0));

    lines.push(`- Realized (year ${latestYear}): count=${rglLatest.length} net=$${toMoney(netGainsCad)}`);

    // Superficial
    const deniedCount = engineOutput.superficialLosses.filter((sl) => d(sl.deniedLossCad).isPositive()).length;
    const permanentCount = engineOutput.superficialLosses.filter((sl) => sl.isPermanentlyDeniedInRegistered).length;
    lines.push(`- Superficial: denied=${deniedCount} permanent=${permanentCount}`);

    // Review Queue
    const reviewList = redactedTransactions.filter((t) => t.status === 'needs_review');
    const unknownTransfers = reviewList.filter((t) => t.transactionType === 'TRANSFER_IN' || t.transactionType === 'TRANSFER_OUT').length;
    const mixedMergers = reviewList.filter(
      (t) => t.transactionType === 'MERGER_MIXED' || (t.reviewNotes || '').toLowerCase().includes('merger')
    ).length;
    const otherReview = reviewList.length - unknownTransfers - mixedMergers;

    lines.push(`- Review queue: ${reviewList.length} (unknown_transfer=${unknownTransfers}, mixed_merger=${mixedMergers}, other=${otherReview})`);

    // Reconcile
    const breaks = reconcilePositions(engineOutput.securityBalances, redactedOpenPositions);
    lines.push(`- Reconcile breaks: ${breaks.length}`);
    breaks.forEach((brk) => {
      lines.push(`  - ${brk.symbol.padEnd(8)} calc=${brk.calculatedQuantity} broker=${brk.brokerReportedQuantity} diff=${brk.quantityDiscrepancy}`);
    });
    lines.push('');

    // Notes
    const unpostedCa = reviewList.filter((t) =>
      (['MERGER_MIXED', 'MERGER_SHARE_EXCHANGE', 'MERGER_ALL_CASH', 'STOCK_SPLIT', 'SPINOFF', 'RETURN_OF_CAPITAL'] as string[]).includes(t.transactionType)
    );
    lines.push('## Notes');
    lines.push(`- Needs review CAs unposted: ${unpostedCa.length}`);
    lines.push(`- Skipped/Errors: ${sanitizedErrors.length > 0 ? sanitizedErrors.join(', ') : 'None'}`);
  }

  const reportText = lines.join('\n') + '\n';

  if (outPath) {
    const absOut = path.resolve(outPath);
    const cwd = process.cwd();
    if (absOut.startsWith(cwd)) {
      console.error(`Error: Output file path '${outPath}' cannot be inside the git repository. Writing report to stdout instead.`);
      process.stdout.write(reportText);
    } else {
      fs.writeFileSync(absOut, reportText, 'utf-8');
      console.error(`Report written to ${absOut}`);
    }
  } else {
    process.stdout.write(reportText);
  }
}

main();
