import { describe, expect, it } from 'vitest';

import type { LogisticsCategory } from '../shared/logistics-colors/logistics-category';
import { inRoutes, routeOptions } from './route-filter';

interface Order {
  readonly ref: string;
  readonly mode: string;
}
const ORDERS: readonly Order[] = [
  { ref: 'A', mode: 'Retrait Adroit' },
  { ref: 'B', mode: 'Livraison' },
  { ref: 'C', mode: 'Retrait Village' },
  { ref: 'D', mode: 'Retrait Adroit' },
];
const modeOf = (o: Order): LogisticsCategory => ({ key: o.mode, label: o.mode, color: null });
const refs = (orders: readonly Order[]) => orders.map((o) => o.ref);

describe('le filtre d’acheminement', () => {
  it('une option par acheminement, alphabétique, avec son compte', () => {
    expect(routeOptions(ORDERS, modeOf).map((o) => [o.label, o.count])).toEqual([
      ['Livraison', 1],
      ['Retrait Adroit', 2],
      ['Retrait Village', 1],
    ]);
  });

  it('rien de coché = tout', () => {
    expect(refs(inRoutes(ORDERS, [], modeOf))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('par un retrait', () => {
    expect(refs(inRoutes(ORDERS, ['Retrait Adroit'], modeOf))).toEqual(['A', 'D']);
  });

  it('par la livraison seule', () => {
    expect(refs(inRoutes(ORDERS, ['Livraison'], modeOf))).toEqual(['B']);
  });

  it('par deux points', () => {
    expect(refs(inRoutes(ORDERS, ['Retrait Adroit', 'Retrait Village'], modeOf))).toEqual([
      'A',
      'C',
      'D',
    ]);
  });
});
