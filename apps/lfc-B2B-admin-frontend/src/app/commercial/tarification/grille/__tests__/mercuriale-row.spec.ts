import { describe, expect, it } from 'vitest';
import type { PriceFloorView, PricingItemView } from '@lfd/contracts';

import { entryCents, floorCentsOf, impactBp, mercurialeRow, tally } from '../mercuriale-row';

const floor = (over: Partial<PriceFloorView>): PriceFloorView =>
  ({
    id: 'f',
    scope: { type: 'product', id: 'PAI-001' },
    mode: 'amount',
    value: 70,
    dynamic: null,
    drift: null,
    createdBy: 'e2e',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as PriceFloorView;

const item = (
  over: Partial<Pick<PricingItemView, 'sku' | 'name' | 'canonicalCents' | 'effectiveFloor'>> = {},
) => ({
  sku: 'PAI-001',
  name: 'Baguette',
  canonicalCents: 100,
  effectiveFloor: null,
  ...over,
});

describe('floorCentsOf', () => {
  it('rend un montant tel quel, et une fraction calculée sur le canonique', () => {
    expect(floorCentsOf(floor({ mode: 'amount', value: 70 }), 100)).toBe(70);
    expect(floorCentsOf(floor({ mode: 'percent', value: 7000 }), 100)).toBe(70);
  });

  it('ne rend rien sans limite posée', () => {
    expect(floorCentsOf(null, 100)).toBeNull();
  });
});

describe('impactBp', () => {
  it('rend une baisse positive et une hausse négative', () => {
    expect(impactBp(100, 80)).toBe(2000);
    expect(impactBp(100, 110)).toBe(-1000);
  });
});

describe('mercurialeRow', () => {
  it('sans limite, le prix final est le prix saisi', () => {
    const row = mercurialeRow(item(), 80);

    expect(row).toMatchObject({ finalCents: 80, floored: false, roomCents: null, impactBp: 2000 });
  });

  /**
   * **Le cas qui compte.** La mercuriale scelle les étages suivants, mais la
   * limite s'applique après tout : elle relève un prix négocié trop bas comme
   * n'importe quel autre. Afficher la saisie comme prix final ferait annoncer au
   * client un prix que la caisse relèverait.
   */
  it('la limite RELÈVE un prix négocié trop bas, et le dit', () => {
    const row = mercurialeRow(item({ effectiveFloor: floor({ value: 70 }) }), 60);

    expect(row.finalCents).toBe(70);
    expect(row.floored).toBe(true);
    // Relevé au plancher : la marge est de zéro, pas absente.
    expect(row.roomCents).toBe(0);
    // L'impact se calcule sur le prix FACTURÉ, pas sur la saisie.
    expect(row.impactBp).toBe(3000);
  });

  it('la marge est la distance entre le prix final et la limite', () => {
    const row = mercurialeRow(item({ effectiveFloor: floor({ value: 70 }) }), 85);

    expect(row.roomCents).toBe(15);
  });

  /** Un article que le gabarit ne tarife pas ne retombe PAS sur le catalogue. */
  it('laisse tout vide sur un article sans prix — il ne porte aucune décision', () => {
    const row = mercurialeRow(item({ effectiveFloor: floor({}) }), null);

    expect(row).toMatchObject({
      mercurialeCents: null,
      finalCents: null,
      roomCents: null,
      impactBp: null,
      floored: false,
    });
    // La limite, elle, reste affichée : elle existe indépendamment du gabarit.
    expect(row.floorCents).toBe(70);
  });
});

describe('entryCents', () => {
  it('prend le prix du plus petit palier, pas le plus flatteur', () => {
    expect(
      entryCents([
        { minQuantity: 1, unitPriceCents: 85 },
        { minQuantity: 10_000, unitPriceCents: 78 },
      ]),
    ).toBe(85);
  });

  it('ne rend rien sur une grille vide', () => {
    expect(entryCents([])).toBeNull();
  });
});

describe('tally', () => {
  it('compte les articles tarifés, les relevés, et la moyenne des impacts', () => {
    const rows = [
      mercurialeRow(item(), 80),
      mercurialeRow(item({ sku: 'PAI-002', effectiveFloor: floor({ value: 70 }) }), 60),
      mercurialeRow(item({ sku: 'PAI-003' }), null),
    ];

    expect(tally(rows)).toEqual({ priced: 2, floored: 1, averageImpactBp: 2500 });
  });

  it("ne rend pas de moyenne quand rien n'est tarifé", () => {
    expect(tally([mercurialeRow(item(), null)]).averageImpactBp).toBeNull();
  });
});
