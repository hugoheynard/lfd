import type { AdminOrderEstimateAmountsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { estimateChangeMessage, estimateChangesOf } from '../estimate-changes';

const LINE = {
  sku: 'VIE-001',
  productName: 'Croissant',
  quantity: 10,
  saleUnit: 'piece' as const,
  vatRate: 5.5,
  unitPriceMillicents: 100_000,
  basePriceMillicents: null,
  lineTotalCents: 1000,
  lineTotalTtcCents: 1055,
};

const BEFORE: AdminOrderEstimateAmountsView = {
  vatMethod: 'line_ht',
  lines: [LINE],
  subtotalCents: 1000,
  discountCents: 0,
  discountTtcCents: null,
  discounts: [],
  deliveryFeeCents: 0,
  deliveryFeeTtcCents: null,
  lateFeeCents: 0,
  lateFeeVatRatePercent: null,
  vatCents: 55,
  vatShares: [],
  totalCents: 1055,
};

describe('estimateChangeMessage — l’écart de total de la saisie (plan total vu, T3)', () => {
  it('un écart nul ne dit rien', () => {
    expect(estimateChangeMessage(BEFORE, { ...BEFORE })).toBeNull();
  });

  it('nomme les deux totaux et la surtaxe apparue', () => {
    const message = estimateChangeMessage(BEFORE, {
      ...BEFORE,
      lateFeeCents: 500,
      vatCents: 82,
      totalCents: 1582,
    });
    expect(message).toMatch(/^Le total TTC est passé de 10,55\s€ à 15,82\s€ : /u);
    expect(message).toContain('après l’heure limite, un supplément de 5,00');
  });

  it('nomme la remise finie, le port et la ligne dont le prix a changé', () => {
    const before = {
      ...BEFORE,
      discounts: [
        { rank: 1, amountCents: 100, amountTtcCents: null, promotionId: 'p', label: 'Goûter' },
      ],
      discountCents: 100,
    };
    const changes = estimateChangesOf(before, {
      ...BEFORE,
      deliveryFeeCents: 900,
      lines: [{ ...LINE, lineTotalCents: 1200 }],
    });
    expect(changes).toContainEqual('la remise « Goûter » a pris fin');
    expect(changes.some((change) => change.startsWith('frais de livraison'))).toBe(true);
    expect(changes.some((change) => change.startsWith('Croissant :'))).toBe(true);
  });

  it('sans terme reconnu, dit que les prix ont été mis à jour', () => {
    expect(estimateChangeMessage(BEFORE, { ...BEFORE, totalCents: 1056 })).toContain(
      'les prix ont été mis à jour',
    );
  });
});
