import type { Transaction, Expense, Due } from './portal.ts';

/** A hypothetical attendee's cost for every spending item, in currency minor units.
 * Each expense is divided by its participants and rounded up before summing.
 * Non-spending transactions are excluded.
 */
export function fullParticipationFundCost(transactions: Transaction[]): number | null {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.type !== '支出') continue;
    const participants = new Set(transaction.shares.map(share => share.memberId)).size;
    if (!participants) return null;
    total += Math.ceil(-transaction.amount / participants);
  }
  return total;
}

/** Display estimate only; preserves actual per-member dues and receipt calculations. */
export function perPersonPretripCost(
  expense: Pick<Expense, 'id' | 'amount'>,
  dues: Pick<Due, 'expenseId' | 'memberId'>[],
): number | null {
  const participants = new Set(dues.filter(due => due.expenseId === expense.id).map(due => due.memberId)).size;
  return participants ? Math.ceil(expense.amount / participants) : null;
}
