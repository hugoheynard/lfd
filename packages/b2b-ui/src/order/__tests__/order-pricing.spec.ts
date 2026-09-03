import type { OrderLineView } from '@lfd/contracts';

import { entryPriceOf, priceStepLabels, wasFloored } from '../order-pricing';

/**
 * **La trace figée, relue.**
 *
 * Ce que ces cas ferment : une ligne SANS trace ne doit rien inventer. Les
 * commandes passées avant le gel de la trace en portent zéro, et une lecture qui
 * comblerait le vide afficherait une remise que personne n'a accordée — sur une
 * facture déjà payée.
 */

function line(over: Partial<OrderLineView> = {}): OrderLineView {
  return {
    sku: 'VIE-001',
    productName: 'Croissant',
    unitPriceMillicents: 180,
    vatRate: 5.5,
    quantity: 12,
    lineTotalCents: 2160,
    pricing: null,
    ...over,
  };
}

describe('la trace du prix, sur une ligne de commande', () => {
  it('ne barre rien quand la ligne ne porte aucune trace', () => {
    expect(entryPriceOf(line())).toBeNull();
    expect(priceStepLabels(line())).toEqual([]);
    expect(wasFloored(line())).toBe(false);
  });

  /** Aucune règle n'a joué : le prix affiché EST le tarif d'entrée. */
  it("ne barre rien quand le tarif d'entrée est le prix facturé", () => {
    const same = line({
      unitPriceMillicents: 200,
      pricing: { basePriceMillicents: 200, steps: [], floored: false, floorDecision: null },
    });

    expect(entryPriceOf(same)).toBeNull();
  });

  it("rend le tarif d'entrée dès qu'une règle l'a fait bouger", () => {
    const discounted = line({
      unitPriceMillicents: 180,
      pricing: {
        basePriceMillicents: 200,
        steps: [
          {
            stage: 'promotion',
            ruleId: 'r1',
            label: 'Promo de rentrée',
            scope: { type: 'global', id: null },
            resultMillicents: 180,
            supersedes: [],
          },
        ],
        floored: false,
        floorDecision: null,
      },
    });

    expect(entryPriceOf(discounted)).toBe(200);
    expect(priceStepLabels(discounted)).toEqual(['Promo de rentrée']);
  });

  /** Les étages sortent DANS L'ORDRE où ils ont produit leur effet. */
  it('garde la suite des étages telle que la résolution les a empilés', () => {
    const composed = line({
      unitPriceMillicents: 144,
      pricing: {
        basePriceMillicents: 200,
        steps: [
          {
            stage: 'promotion',
            ruleId: 'r1',
            label: 'Promo',
            scope: { type: 'global', id: null },
            resultMillicents: 160,
            supersedes: [],
          },
          {
            stage: 'geste',
            ruleId: 'r2',
            label: 'Geste',
            scope: { type: 'global', id: null },
            resultMillicents: 144,
            supersedes: [],
          },
        ],
        floored: false,
        floorDecision: null,
      },
    });

    expect(priceStepLabels(composed)).toEqual(['Promo', 'Geste']);
  });

  /** Un prix relevé est une règle qui n'a PAS produit son effet : ça se dit. */
  it('signale un prix relevé par une limite', () => {
    const floored = line({
      pricing: { basePriceMillicents: 200, steps: [], floored: true, floorDecision: null },
    });

    expect(wasFloored(floored)).toBe(true);
  });
});
