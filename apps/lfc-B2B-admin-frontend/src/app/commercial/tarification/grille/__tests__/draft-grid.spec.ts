import { describe, expect, it } from 'vitest';

import {
  entryOf,
  toLines,
  tiersOf,
  volumeOf,
  withTiers,
  withVolume,
  without,
  type DraftGrid,
} from '../draft-grid';

/** Sans volume prévu : ces cas-là portent sur les paliers, pas sur le plan. */
const lines = (value: DraftGrid) => toLines(value, new Map());

const grid = (entries: [string, { minQuantity: string; unitPrice: string }[]][]): DraftGrid =>
  new Map(entries);

describe('withTiers / without', () => {
  it('rend une NOUVELLE carte — le signal doit pouvoir se comparer', () => {
    const before = grid([]);
    const after = withTiers(before, 'PAI-001', [{ minQuantity: '1', unitPrice: '0,80' }]);

    expect(after).not.toBe(before);
    expect(before.size).toBe(0);
    expect(tiersOf(after, 'PAI-001')).toHaveLength(1);
  });

  it('retire un article sans toucher les autres', () => {
    const before = grid([
      ['PAI-001', [{ minQuantity: '1', unitPrice: '0,80' }]],
      ['PAI-002', [{ minQuantity: '1', unitPrice: '0,90' }]],
    ]);

    expect([...without(before, 'PAI-001').keys()]).toEqual(['PAI-002']);
  });
});

describe('entryOf', () => {
  it('rend le prix du premier palier, en centimes', () => {
    expect(entryOf(grid([['PAI-001', [{ minQuantity: '1', unitPrice: '0,80' }]]]), 'PAI-001')).toBe(
      80,
    );
  });

  it('ne rend rien sur un article non tarifé, ni sur une saisie illisible', () => {
    expect(entryOf(grid([]), 'PAI-001')).toBeNull();
    expect(
      entryOf(grid([['PAI-001', [{ minQuantity: '1', unitPrice: '' }]]]), 'PAI-001'),
    ).toBeNull();
  });
});

describe('toLines', () => {
  it('convertit une grille lisible', () => {
    expect(
      lines(
        grid([
          [
            'PAI-001',
            [
              { minQuantity: '1', unitPrice: '0,85' },
              { minQuantity: '10000', unitPrice: '0,78' },
            ],
          ],
        ]),
      ),
    ).toEqual([
      {
        sku: 'PAI-001',
        plannedVolume: null,
        tiers: [
          { minQuantity: 1, unitPriceCents: 85 },
          { minQuantity: 10_000, unitPriceCents: 78 },
        ],
      },
    ]);
  });

  /** Un palier vide est un ajout qu'on n'a pas rempli : il s'oublie sans bloquer. */
  it('oublie un palier entièrement vide', () => {
    expect(
      lines(
        grid([
          [
            'PAI-001',
            [
              { minQuantity: '1', unitPrice: '0,85' },
              { minQuantity: '', unitPrice: '' },
            ],
          ],
        ]),
      ),
    ).toEqual([
      { sku: 'PAI-001', plannedVolume: null, tiers: [{ minQuantity: 1, unitPriceCents: 85 }] },
    ]);
  });

  /**
   * **Le refus qui compte.** Un palier à moitié rempli est une faute de frappe,
   * pas un renoncement : zéro est un prix réel ici, donc le compléter d'office
   * poserait chez un client un prix que personne n'a voulu.
   */
  it('fait tomber la LIGNE si un palier est à moitié rempli, sans bloquer les autres', () => {
    expect(
      lines(
        grid([
          ['PAI-001', [{ minQuantity: '1', unitPrice: '' }]],
          ['PAI-002', [{ minQuantity: '1', unitPrice: '0,80' }]],
        ]),
      ),
    ).toEqual([
      { sku: 'PAI-002', plannedVolume: null, tiers: [{ minQuantity: 1, unitPriceCents: 80 }] },
    ]);
  });

  it('refuse un seuil nul — un palier part d’au moins une pièce', () => {
    expect(lines(grid([['PAI-001', [{ minQuantity: '0', unitPrice: '0,80' }]]]))).toEqual([]);
  });
});

describe('withVolume / volumeOf', () => {
  it('retient un volume lisible', () => {
    const volumes = withVolume(new Map(), 'baguette', '10 000');
    expect(volumeOf(volumes, 'baguette')).toBe(10_000);
  });

  it("vide RETIRE l'article du plan, il ne le met pas à zéro", () => {
    const posed = withVolume(new Map(), 'baguette', '500');
    const cleared = withVolume(posed, 'baguette', '');
    // Les deux se ressemblent dans un total ; seule l'absence est honnête.
    expect(cleared.has('baguette')).toBe(false);
    expect(volumeOf(cleared, 'baguette')).toBe(0);
  });

  it('refuse zéro et le négatif comme une absence', () => {
    expect(withVolume(new Map(), 'a', '0').has('a')).toBe(false);
    expect(withVolume(new Map(), 'a', '-3').has('a')).toBe(false);
  });

  it('rend une NOUVELLE carte', () => {
    const before = new Map<string, number>();
    expect(withVolume(before, 'a', '5')).not.toBe(before);
  });
});

describe('toLines · le volume prévu', () => {
  it('voyage avec la grille', () => {
    const value = grid([['PAI-001', [{ minQuantity: '1', unitPrice: '0,80' }]]]);
    const [line] = toLines(value, new Map([['PAI-001', 10_000]]));
    expect(line?.plannedVolume).toBe(10_000);
  });

  it("vaut null quand l'article n'est pas au plan — et pas zéro", () => {
    const value = grid([['PAI-001', [{ minQuantity: '1', unitPrice: '0,80' }]]]);
    expect(toLines(value, new Map())[0]?.plannedVolume).toBeNull();
  });
});
