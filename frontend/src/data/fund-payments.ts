import { toMinor } from './portal.ts';
import type { ShareInput } from './trip-editor.ts';

/** Sheets keeps the existing transaction code for compatibility. */
export function fundTypeLabel(type: string): string { return type === '儲值' ? '收款' : type; }

export function commonFundAmount(shares: readonly ShareInput[], currency: string): string {
  if (!shares.length || shares.some(share => !share.amount)) return '';
  const first = toMinor(shares[0].amount, currency);
  return shares.every(share => toMinor(share.amount, currency) === first) ? shares[0].amount : '';
}

/** Build explicit per-member amounts; never guess or flatten unequal historical payments. */
export function equalFundShares(selected: readonly ShareInput[], amount: string, currency: string, existing?: readonly ShareInput[]): ShareInput[] {
  if (!selected.length) throw new Error('請至少選擇一位團員。');
  if (amount === '' && existing) {
    return selected.map(share => {
      const original = existing.find(item => item.memberId === share.memberId);
      if (!original) throw new Error('新增團員前，請先填寫每人金額。');
      return { ...original };
    });
  }
  if (!/^[0-9]+$/.test(amount) || toMinor(amount, currency) <= 0) throw new Error('每人金額須為大於零的整數。');
  return selected.map(share => ({ memberId: share.memberId, amount }));
}
