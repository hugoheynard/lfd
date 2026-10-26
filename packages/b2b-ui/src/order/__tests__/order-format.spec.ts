import { orderStatusLabel, orderStatusVariant } from '../order-format';

describe('orderStatusLabel — plan E7 reliquat', () => {
  it('dit « En partie retirée », en attente : un reste n’est pas encore parti', () => {
    expect(orderStatusLabel('partially_handed_over')).toBe('En partie retirée');
    expect(orderStatusVariant('partially_handed_over')).toBe('warning');
  });
});
