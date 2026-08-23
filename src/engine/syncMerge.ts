import { Account, SecurityMaster, Transaction, OpenPosition } from '../types/tax';

/**
 * Deduplicates and merges account lists by account ID.
 */
export function mergeAccounts(existing: Account[], incoming: Account[]): Account[] {
  const map = new Map<string, Account>(existing.map((a) => [a.id, a]));
  incoming.forEach((a) => map.set(a.id, a));
  return Array.from(map.values());
}

/**
 * Deduplicates and merges security master lists by security ID.
 */
export function mergeSecurities(existing: SecurityMaster[], incoming: SecurityMaster[]): SecurityMaster[] {
  const map = new Map<string, SecurityMaster>(existing.map((s) => [s.id, s]));
  incoming.forEach((s) => map.set(s.id, s));
  return Array.from(map.values());
}

/**
 * Upserts transactions by trade/transaction ID.
 * Cancellations void the original transaction.
 * Preserves user corporate action approval state if incoming is pending review.
 */
export function upsertTransactions(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const map = new Map<string, Transaction>(existing.map((t) => [t.id, t]));
  incoming.forEach((t) => {
    if (t.isCancelled) {
      map.delete(t.id);
      return;
    }
    const prev = map.get(t.id);
    if (prev && prev.status === 'approved' && prev.corporateAction && t.status === 'needs_review') {
      t.status = 'approved';
      t.corporateAction = prev.corporateAction;
    }
    map.set(t.id, t);
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Deduplicates open position snapshots by composite accountId_securityId key.
 */
export function mergeOpenPositions(existing: OpenPosition[], incoming: OpenPosition[]): OpenPosition[] {
  const map = new Map<string, OpenPosition>(existing.map((p) => [`${p.accountId}_${p.securityId}`, p]));
  incoming.forEach((p) => map.set(`${p.accountId}_${p.securityId}`, p));
  return Array.from(map.values());
}
