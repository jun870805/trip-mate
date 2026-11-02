import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mapSearchUrl, hasMapLink } from './maps.ts';
it('builds escaped Google Maps search links and refuses ambiguous places', () => {
  assert.equal(mapSearchUrl('由布院車站', '日本'), 'https://www.google.com/maps/search/?api=1&query=%E7%94%B1%E5%B8%83%E9%99%A2%E8%BB%8A%E7%AB%99%2C%20%E6%97%A5%E6%9C%AC');
  for (const name of ['', '午餐', '晚餐', '逛街', '購物', '交通']) assert.throws(() => mapSearchUrl(name, '日本'));
  assert.ok(hasMapLink({ 說明: '[地圖](https://www.google.com/maps/search/?api=1&query=x)' }));
  assert.ok(!hasMapLink({ 說明: '[bad](https://evil.example/maps)' }));
});
