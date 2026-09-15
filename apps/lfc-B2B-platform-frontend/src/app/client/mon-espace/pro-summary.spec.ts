import type { CustomerOrderView, PickupAddressView } from '@lfd/contracts';

import { discountRows, monthOutstandingCents } from './pro-summary';

const POINT = (over: Partial<PickupAddressView>): PickupAddressView => ({
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'percent', bp: 2_000 },
  opening: { proPickup: null, publicOpening: null },
  ...over,
});

/** Seuls les champs que le calcul lit comptent ; le reste est une commande plausible. */
const ORDER = (over: Partial<CustomerOrderView>): CustomerOrderView =>
  ({
    id: 'ord_1',
    orderNumber: '0001',
    status: 'confirmed',
    paymentStatus: 'not_required',
    requestedDeliveryDate: '2026-09-10',
    placedAt: '2026-09-09T15:00:00.000Z',
    totalCents: 10_000,
    ...over,
  }) as CustomerOrderView;

describe('discountRows', () => {
  /**
   * Régression : le bloc affichait « −10 % » en dur quand le back-office
   * remettait 20 %.
   */
  it('lit la remise du back-office, point par point', () => {
    const rows = discountRows(
      [
        POINT({}),
        POINT({
          id: 'pick_village',
          label: 'Le Village',
          discount: { mode: 'amount', cents: 200 },
        }),
      ],
      'Remise retrait · {place}',
    );
    expect(rows).toEqual([
      { id: 'pick_labo', label: 'Remise retrait · Le Labo', value: '−20 %' },
      {
        id: 'pick_village',
        label: 'Remise retrait · Le Village',
        value: expect.stringMatching(/^−2,00/),
      },
    ]);
  });

  it("un point sans remise n'a pas de ligne", () => {
    expect(discountRows([POINT({ discount: null })], '{place}')).toEqual([]);
  });
});

describe('monthOutstandingCents', () => {
  // Les dates ne sont comparées qu'entre elles (le jour passé en argument) :
  // aucune ne se confronte à l'horloge, elles peuvent rester absolues.
  const TODAY = '2026-09-15';

  it('additionne les commandes du mois réglées sur terme', () => {
    const orders = [ORDER({ totalCents: 10_000 }), ORDER({ id: 'ord_2', totalCents: 2_540 })];
    expect(monthOutstandingCents(orders, TODAY)).toBe(12_540);
  });

  it('ignore la carte, les annulées, les brouillons et les autres mois', () => {
    const orders = [
      ORDER({ paymentStatus: 'paid' }),
      ORDER({ paymentStatus: 'pending' }),
      ORDER({ status: 'cancelled' }),
      ORDER({ status: 'draft' }),
      ORDER({ requestedDeliveryDate: '2026-08-31' }),
      ORDER({ requestedDeliveryDate: '2026-10-01' }),
    ];
    expect(monthOutstandingCents(orders, TODAY)).toBe(0);
  });

  it('sans journée de service, retombe sur le jour de passation lu à Paris', () => {
    // 22 h 30 UTC le 31 août = 00 h 30 le 1er septembre à Paris.
    const order = ORDER({ requestedDeliveryDate: null, placedAt: '2026-08-31T22:30:00.000Z' });
    expect(monthOutstandingCents([order], TODAY)).toBe(10_000);
  });
});
