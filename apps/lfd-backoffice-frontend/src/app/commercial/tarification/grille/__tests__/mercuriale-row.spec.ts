import { describe, expect, it } from 'vitest';
import type { NegotiationRoom, PricingItemView } from '@lfd/contracts';

import { entryMillicents, floorMillicentsOf, mercurialeRow, tally } from '../mercuriale-row';

/**
 * La marge telle que le SERVEUR la sert : le plancher **appliqué**, déjà ramené
 * en millicentimes sur l'article. L'écran la lit, il ne la refabrique pas.
 */
const room = (floorMillicents: number): NegotiationRoom => ({
  floorMillicents,
  maxDiscountMillicents: 0,
  maxDiscountBp: 0,
});

const item = (
  over: Partial<
    Pick<PricingItemView, 'sku' | 'name' | 'canonicalMillicents' | 'negotiationRoom'>
  > = {},
) => ({
  sku: 'PAI-001',
  name: 'Baguette',
  canonicalMillicents: 100,
  negotiationRoom: null,
  ...over,
});

describe('floorMillicentsOf', () => {
  it('lit la limite que le serveur a calculée', () => {
    expect(floorMillicentsOf(item({ negotiationRoom: room(70) }))).toBe(70);
  });

  it('ne rend rien sans limite posée', () => {
    expect(floorMillicentsOf(item())).toBeNull();
  });

  /**
   * Régression R23 : l'écran annonçait le MUR quand la caisse applique la PORTE.
   *
   * Il calculait `Math.round((canonique × effectiveFloor.value) / 10_000)` — la
   * formule que `resolve-floor.ts` interdit nommément —, et sur le mauvais
   * champ : `PriceFloorView.mode/value` porte le mur dur, la porte dynamique
   * vivant dans `dynamic`. Sur un article dont la porte s'ouvre, la grille
   * annonçait donc une limite PLUS HAUTE que la vraie, c'est-à-dire moins de
   * marge que le commercial n'en avait — sur l'écran où il décide de signer.
   *
   * `negotiationRoom.floorMillicents` est le plancher **appliqué**, après
   * `decideFloor` (fix 2026-09-09).
   */
  it('🔴 rend la PORTE ouverte, pas le mur dur', () => {
    // Le mur est à 90 ; la porte, ouverte, descend à 50. L'ancien calcul rendait
    // 90 — il ne regardait que le mur.
    expect(floorMillicentsOf(item({ negotiationRoom: room(50) }))).toBe(50);
  });
});

describe('mercurialeRow', () => {
  it('sans limite, le prix final est le prix saisi', () => {
    const row = mercurialeRow(item(), 80);

    expect(row).toMatchObject({
      finalMillicents: 80,
      floored: false,
      roomMillicents: null,
      impactBp: 2000,
    });
  });

  /**
   * **Le cas qui compte.** La mercuriale scelle les étages suivants, mais la
   * limite s'applique après tout : elle relève un prix négocié trop bas comme
   * n'importe quel autre. Afficher la saisie comme prix final ferait annoncer au
   * client un prix que la caisse relèverait.
   */
  it('la limite RELÈVE un prix négocié trop bas, et le dit', () => {
    const row = mercurialeRow(item({ negotiationRoom: room(70) }), 60);

    expect(row.finalMillicents).toBe(70);
    expect(row.floored).toBe(true);
    // Relevé au plancher : la marge est de zéro, pas absente.
    expect(row.roomMillicents).toBe(0);
    // L'impact se calcule sur le prix FACTURÉ, pas sur la saisie.
    expect(row.impactBp).toBe(3000);
  });

  it('la marge est la distance entre le prix final et la limite', () => {
    const row = mercurialeRow(item({ negotiationRoom: room(70) }), 85);

    expect(row.roomMillicents).toBe(15);
  });

  /** Un article que le gabarit ne tarife pas ne retombe PAS sur le catalogue. */
  it('laisse tout vide sur un article sans prix — il ne porte aucune décision', () => {
    const row = mercurialeRow(item({ negotiationRoom: room(70) }), null);

    expect(row).toMatchObject({
      mercurialeMillicents: null,
      finalMillicents: null,
      roomMillicents: null,
      impactBp: null,
      floored: false,
    });
    // La limite, elle, reste affichée : elle existe indépendamment du gabarit.
    expect(row.floorMillicents).toBe(70);
  });
});

describe('entryMillicents', () => {
  it('prend le prix du plus petit palier, pas le plus flatteur', () => {
    expect(
      entryMillicents([
        { minQuantity: 1, unitPriceMillicents: 85 },
        { minQuantity: 10_000, unitPriceMillicents: 78 },
      ]),
    ).toBe(85);
  });

  it('ne rend rien sur une grille vide', () => {
    expect(entryMillicents([])).toBeNull();
  });
});

describe('tally', () => {
  it('compte les articles tarifés, les relevés, et la moyenne des impacts', () => {
    const rows = [
      mercurialeRow(item(), 80),
      mercurialeRow(item({ sku: 'PAI-002', negotiationRoom: room(70) }), 60),
      mercurialeRow(item({ sku: 'PAI-003' }), null),
    ];

    expect(tally(rows)).toEqual({ priced: 2, floored: 1, averageImpactBp: 2500 });
  });

  it("ne rend pas de moyenne quand rien n'est tarifé", () => {
    expect(tally([mercurialeRow(item(), null)]).averageImpactBp).toBeNull();
  });
});

describe('mercurialeRow · la médiane du marché', () => {
  const market = {
    sku: 'baguette',
    medianMillicents: 120,
    lowMillicents: 100,
    highMillicents: 160,
    companyCount: 5,
  };
  const item = {
    sku: 'baguette',
    name: 'Baguette',
    canonicalMillicents: 200,
    negotiationRoom: null,
  };

  it('situe le prix saisi sous, sur, ou au-dessus de la médiane', () => {
    expect(mercurialeRow(item, 110, market).versusMarket).toBe('under');
    expect(mercurialeRow(item, 120, market).versusMarket).toBe('at');
    expect(mercurialeRow(item, 130, market).versusMarket).toBe('over');
  });

  it('porte la médiane même sur un article NON tarifé — c’est là qu’elle sert le plus', () => {
    const row = mercurialeRow(item, null, market);
    expect(row.benchmark).toBe(market);
    // Rien n'est saisi : il n'y a rien à situer.
    expect(row.versusMarket).toBeNull();
  });

  it('reste muette sans mercuriale en place ailleurs', () => {
    expect(mercurialeRow(item, 110).benchmark).toBeNull();
    expect(mercurialeRow(item, 110).versusMarket).toBeNull();
  });
});
