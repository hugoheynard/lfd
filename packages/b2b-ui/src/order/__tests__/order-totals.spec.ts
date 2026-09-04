import type { LateFeeAdjustment, OrderView } from '@lfd/contracts';

import { formatLateFeeTerms } from '../order-format';
import { orderTotalRows } from '../order-pricing';

/**
 * Une commande complète, **sans cast** : le récapitulatif se lit sur tous les
 * champs de la vue, et un `as OrderView` laisserait passer une ligne qui ne
 * compilerait plus le jour où la vue en gagne un.
 */
function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'ord_1',
    orderNumber: 'ORD-1',
    status: 'placed',
    paymentStatus: 'paid',
    requestedDeliveryDate: null,
    fulfillmentMethod: 'pickup',
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: null,
    fulfillment: {
      window: { value: null, source: 'default' },
      contact: { value: null, source: 'default' },
      signatureRequired: { value: false, source: 'default' },
    },
    note: '',
    subtotalCents: 10_000,
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    vatCents: 550,
    totalCents: 10_550,
    currency: 'EUR',
    fromSubscriptionId: null,
    origin: 'customer',
    placedByStaffId: null,
    recurringDeltas: null,
    placedAt: '2026-09-04T09:00:00.000Z',
    lines: [],
    handoverToken: null,
    handedOverAt: null,
    ...overrides,
  };
}

/**
 * L'espace d'`Intl` avant le « € » est **insécable** (U+00A0), pas une espace
 * ordinaire. Écrite en clair, l'assertion passerait pour juste en étant fausse,
 * et le diff des deux chaînes serait identique à l'œil.
 */
const EUR = '\u00a0€';

const keys = (view: OrderView): string[] => orderTotalRows(view).map((row) => row.key);
const row = (view: OrderView, key: string) => orderTotalRows(view).find((r) => r.key === key);

describe('le récapitulatif des montants', () => {
  it('ne montre ni remise, ni livraison, ni surtaxe quand il n’y en a pas', () => {
    // Une ligne « Surtaxe 0,00 € » ferait chercher un retard qui n'a pas eu lieu.
    expect(keys(order())).toEqual(['subtotal', 'vat', 'total']);
  });

  it('place la surtaxe APRÈS la remise et la livraison', () => {
    // L'ordre se lit comme la formule du total : `max(0, sous-total − remise) +
    // livraison + surtaxe + TVA`. Remontée d'un cran, la surtaxe se lirait
    // comme remisée — et on ne fait pas de geste commercial sur un retard.
    const view = order({
      discountCents: 1_000,
      discountAdjustment: { mode: 'percent', bp: 1000 },
      deliveryFeeCents: 500,
      lateFeeCents: 1_500,
      lateFeeAdjustment: { adjustment: { mode: 'percent', bp: 1500 }, vatRatePercent: 20 },
    });

    expect(keys(view)).toEqual(['subtotal', 'discount', 'delivery', 'late-fee', 'vat', 'total']);
  });

  it('dit le montant de la surtaxe, son ajustement et son taux', () => {
    const view = order({
      lateFeeCents: 1_500,
      lateFeeAdjustment: { adjustment: { mode: 'amount', cents: 1_500 }, vatRatePercent: 5.5 },
    });

    expect(row(view, 'late-fee')).toMatchObject({
      label: 'Surtaxe de retard HT',
      value: `15,00${EUR}`,
      hint: `15,00${EUR} · TVA 5,5 %`,
    });
  });

  it('affiche le montant même si la trace figée manque', () => {
    // L'agrégat l'interdit — `ensureLateFeeMatches` refuse une surtaxe sans son
    // ajustement. L'affichage ne s'appuie pas dessus pour autant : si une
    // reprise de données produit le cas, la ligne perd son second niveau, elle
    // ne disparaît pas. Un récapitulatif amputé ne s'additionne plus.
    const view = order({ lateFeeCents: 1_500, lateFeeAdjustment: null });

    expect(row(view, 'late-fee')).toMatchObject({ value: `15,00${EUR}` });
    expect(row(view, 'late-fee')?.hint).toBeUndefined();
  });
});

describe('formatLateFeeTerms', () => {
  it('rend le taux en POURCENTAGE, pas en fraction', () => {
    // Régression possible : `formatVatRate` prend une fraction (`0.2`) et la
    // surtaxe fige un pourcentage (`20`). Le confondre écrirait « 0,2 % » sur
    // une facture, ce qui se lit comme un montant plausible.
    const frozen: LateFeeAdjustment = {
      adjustment: { mode: 'percent', bp: 1000 },
      vatRatePercent: 20,
    };

    expect(formatLateFeeTerms(frozen)).toBe('10 % · TVA 20 %');
  });
});
