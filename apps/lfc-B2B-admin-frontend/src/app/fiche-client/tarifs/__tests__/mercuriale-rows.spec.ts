import type {
  CompanyPricingCategoryView,
  PosedMercurialeView,
  PricingItemView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { gapBp, mercurialeRows } from '../mercuriale-rows';

/**
 * **La jointure entre ce qu'on a accordé et ce que ça vaut au catalogue.**
 *
 * La mercuriale ne porte QUE le prix accordé ; le tarif est joint depuis le
 * tableau des prix. C'est cette jointure qui peut mentir — sur un article que
 * le catalogue ne pousse plus, ou sur le signe de l'écart.
 */

function item(sku: string, canonicalMillicents: number): PricingItemView {
  return {
    sku,
    name: sku,
    canonicalMillicents,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: canonicalMillicents,
    elasticity: null,
    negotiationRoom: null,
  };
}

const CATEGORIES: readonly CompanyPricingCategoryView[] = [
  { id: 'viennoiserie', name: 'Viennoiseries', items: [item('VIE-012', 213_270)] },
];

function mercuriale(lines: PosedMercurialeView['lines']): PosedMercurialeView {
  return {
    label: 'Mercuriale Club Med',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-12-31T00:00:00.000Z',
    status: 'active',
    ruleCount: lines.length,
    skuCount: lines.length,
    createdBy: 'staff|marie',
    lines,
  };
}

describe('l’écart au tarif', () => {
  it('est SIGNÉ : positif quand le client paie moins cher', () => {
    expect(gapBp(213_270, 173_270)).toBe(1_876);
  });

  it('est négatif quand le prix accordé est plus HAUT que le tarif', () => {
    // Ça arrive — un supplément négocié est une altération comme une autre — et
    // l'afficher à l'envers ferait passer une hausse pour une remise.
    expect(gapBp(200_000, 220_000)).toBe(-1_000);
  });

  it('🔴 rend `null` sans tarif catalogue, jamais −100 %', () => {
    // Ce n'est pas une remise, c'est une absence.
    expect(gapBp(null, 173_270)).toBeNull();
    expect(gapBp(0, 173_270)).toBeNull();
  });
});

describe('la jointure', () => {
  it('met le tarif catalogue en regard du prix accordé', () => {
    const [row] = mercurialeRows(
      mercuriale([
        { sku: 'VIE-012', productName: 'Abricotin', unitPriceMillicents: 173_270, minQuantity: 1 },
      ]),
      CATEGORIES,
    );

    expect(row).toMatchObject({
      catalogMillicents: 213_270,
      negotiatedMillicents: 173_270,
      gapBp: 1_876,
    });
  });

  it('garde la ligne d’un article que le catalogue ne connaît plus', () => {
    // La mercuriale l'accorde toujours : la faire disparaître de l'écran
    // cacherait un tarif qui existe. L'écran dit qu'elle ne vise plus rien.
    const [row] = mercurialeRows(
      mercuriale([
        { sku: 'DISPARU', productName: 'DISPARU', unitPriceMillicents: 100_000, minQuantity: 1 },
      ]),
      CATEGORIES,
    );

    expect(row?.catalogMillicents).toBeNull();
    expect(row?.gapBp).toBeNull();
    expect(row?.negotiatedMillicents).toBe(100_000);
  });

  it('garde l’ordre du serveur — du moins cher au plus cher', () => {
    // Le retrier par nom ferait perdre ce qu'on vient chercher : ce qu'on a le
    // plus lâché.
    const rows = mercurialeRows(
      mercuriale([
        { sku: 'B', productName: 'B', unitPriceMillicents: 100_000, minQuantity: 1 },
        { sku: 'A', productName: 'A', unitPriceMillicents: 200_000, minQuantity: 1 },
      ]),
      CATEGORIES,
    );

    expect(rows.map((row) => row.sku)).toEqual(['B', 'A']);
  });
});
