import { describe, expect, it } from 'vitest';
import { ITEMS } from '../production/items.js';
import { generateNpcBuyOffers } from '../sales/market.js';

describe('市場覆蓋', () => {
  it('每一個可販售的物品都有買家（否則做得出來卻賣不掉）', () => {
    const offered = new Set(generateNpcBuyOffers(0).map((o) => o.itemId));
    const missing = Object.values(ITEMS)
      .filter((item) => item.sellable && !offered.has(item.id))
      .map((item) => item.id);
    expect(missing, `沒有買家的可販售物品：${missing.join('、')}`).toHaveLength(0);
  });
});
