import type { Row } from '../../data/portal.ts';
import { noteLinks, itinerarySubtitle } from '../../data/itinerary.ts';

export function hasMapLink(row: Row): boolean {
  return noteLinks(itinerarySubtitle(row)).some(part => part.kind === 'map');
}
export function mapSearchUrl(name: string, location: string): string {
  const value = name.trim();
  if (value.length < 2 || /^(?:早[餐飯]|午[餐飯]|晚[餐飯]|三餐|用餐|餐廳|咖啡廳|逛街|購物|交通|自由活動|飯店|住宿|早餐時間|休息)$/u.test(value))
    throw new Error('地點名稱不明確，請先指定實際景點或店家。');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([value, location.trim()].filter(Boolean).join(', '))}`;
}
