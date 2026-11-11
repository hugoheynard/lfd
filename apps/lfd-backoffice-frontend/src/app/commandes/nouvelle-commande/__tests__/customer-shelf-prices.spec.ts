import { HttpErrorResponse } from '@angular/common/http';
import type { CustomerShelfPriceView, CustomerShelfPricesView } from '@lfd/contracts';
import { formatCents, formatMillicents } from '@lfd/b2b-ui/order';
import { describe, expect, it } from 'vitest';

import {
  loadShelfPrices,
  SHELF_PRICES_UNAVAILABLE,
  shelfPriceIndexOf,
  shelfPricingOf,
} from '../customer-shelf-prices';

const price = (overrides: Partial<CustomerShelfPriceView> = {}): CustomerShelfPriceView => ({
  sku: 'BAG',
  unitPriceMillicents: 70_000,
  struckFromMillicents: null,
  unitPriceTtcCents: 74,
  struckFromTtcCents: null,
  lockedReason: null,
  ...overrides,
});

const table = (
  items: readonly CustomerShelfPriceView[],
  audience: CustomerShelfPricesView['audience'] = 'pro',
): CustomerShelfPricesView => ({ items, audience });

describe('la jointure de la table du client sur la liste', () => {
  it('un pro lit son prix HT, tel que le serveur le donne', () => {
    const index = shelfPriceIndexOf(table([price()]));
    expect(shelfPricingOf(index, 'BAG')).toEqual({
      kind: 'priced',
      price: formatMillicents(70_000),
      struckFrom: null,
      suffix: 'HT',
      unitPriceMillicents: 70_000,
    });
  });

  it('un particulier lit le TTC, barré au TTC', () => {
    const index = shelfPriceIndexOf(
      table([price({ struckFromMillicents: 100_000, struckFromTtcCents: 106 })], 'public'),
    );
    expect(shelfPricingOf(index, 'BAG')).toMatchObject({
      price: formatCents(74),
      struckFrom: formatCents(106),
      suffix: 'TTC',
      // La ligne du panier garde le HT en attendant l'estimation.
      unitPriceMillicents: 70_000,
    });
  });

  it('un pro voit le tarif barré au HT', () => {
    const index = shelfPriceIndexOf(
      table([price({ struckFromMillicents: 100_000, struckFromTtcCents: 106 })]),
    );
    expect(shelfPricingOf(index, 'BAG')).toMatchObject({ struckFrom: formatMillicents(100_000) });
  });

  it('un article réservé à un autre compte est verrouillé', () => {
    const index = shelfPriceIndexOf(table([price({ lockedReason: 'reserved_to_other_account' })]));
    expect(shelfPricingOf(index, 'BAG')).toEqual({ kind: 'locked' });
  });

  it('un SKU absent de la table n’est pas au rayon du client', () => {
    expect(shelfPricingOf(shelfPriceIndexOf(table([price()])), 'CRO')).toEqual({ kind: 'absent' });
  });

  it('sans table, rien n’est posé : la liste garde le prix d’étiquette', () => {
    expect(shelfPricingOf(shelfPriceIndexOf(null), 'BAG')).toBeNull();
  });
});

describe('loadShelfPrices', () => {
  it('rend la table quand elle répond', async () => {
    const view = table([price()]);
    await expect(loadShelfPrices(async () => view)).resolves.toEqual({
      prices: view,
      failure: null,
    });
  });

  it('un échec ne rejette pas : il devient le bandeau générique', async () => {
    const load = await loadShelfPrices(async () => {
      throw new HttpErrorResponse({ status: 500 });
    });
    expect(load).toEqual({ prices: null, failure: SHELF_PRICES_UNAVAILABLE });
  });

  it('un compte résilié (409) : le bandeau porte le message du serveur', async () => {
    const load = await loadShelfPrices(async () => {
      throw new HttpErrorResponse({
        status: 409,
        error: { code: 'orders.staff_entry.company_closed', message: 'Ce compte est résilié.' },
      });
    });
    expect(load.failure).toBe(`${SHELF_PRICES_UNAVAILABLE} Ce compte est résilié.`);
  });
});
