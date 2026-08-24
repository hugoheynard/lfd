import { describe, expect, it } from 'vitest';
import type { PriceProjectionPointView } from '@lfd/contracts';

import { MAX_POINTS, projectionLevels, scenarioOf, volumeOf } from '../commitment-bench';

/** Une grille de prix : 200 c en dessous de 500 cumulés, 160 c au-dessus. */
const point = (cumulativeQuantity: number): PriceProjectionPointView => ({
  cumulativeQuantity,
  canonicalCents: 200,
  unitPriceCents: cumulativeQuantity >= 500 ? 160 : 200,
  steps: [],
  floored: false,
});

const grid = (levels: readonly number[]) => levels.map(point);

describe('volumeOf', () => {
  it('prend la promesse à son pourcentage', () => {
    expect(volumeOf(6000, 10_000)).toBe(6000);
    expect(volumeOf(6000, 7000)).toBe(4200);
    expect(volumeOf(6000, 13_000)).toBe(7800);
  });
});

describe('projectionLevels', () => {
  it('couvre les trois scénarios en un seul appel, triés et dédoublonnés', () => {
    const levels = projectionLevels(1000, 2);

    // manque 700 → 350, 700 ; promesse 1000 → 500, 1000 ; excédent 1300 → 650, 1300.
    expect(levels).toEqual([350, 500, 650, 700, 1000, 1300]);
  });

  it('ne dépasse jamais la borne du contrat', () => {
    expect(projectionLevels(10_000, 12).length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('écarte les niveaux nuls — un cumul de zéro ne se sonde pas', () => {
    expect(projectionLevels(1, 4)).not.toContain(0);
  });
});

describe('scenarioOf', () => {
  /**
   * **Le cas qui porte toute la décision.** Livré en deux fois, le cumul passe
   * le palier à la SECONDE échéance : la première est au tarif d'entrée, la
   * seconde au palier. Un prix fixe aurait donné le tarif bas dès la première.
   */
  it('facture chaque échéance au cumul qu’elle atteint', () => {
    const scenario = scenarioOf(1000, 10_000, 2, grid([500, 1000]));

    expect(scenario?.installments).toEqual([
      {
        index: 1,
        quantity: 500,
        cumulativeQuantity: 500,
        unitPriceCents: 160,
        lineTotalCents: 80_000,
      },
      {
        index: 2,
        quantity: 500,
        cumulativeQuantity: 1000,
        unitPriceCents: 160,
        lineTotalCents: 80_000,
      },
    ]);
  });

  it("laisse la première échéance au tarif d'entrée quand elle n'atteint pas le palier", () => {
    const scenario = scenarioOf(600, 10_000, 2, grid([300, 600]));

    expect(scenario?.installments[0]?.unitPriceCents).toBe(200);
    expect(scenario?.installments[1]?.unitPriceCents).toBe(160);
    // 300 × 2,00 € + 300 × 1,60 € = 1 080 €.
    expect(scenario?.totalCents).toBe(108_000);
  });

  /**
   * **Le prix moyen est le seul nombre comparable entre scénarios**, puisque les
   * volumes diffèrent. Ici : sous-performance = moyenne plus haute, ce qui EST
   * le mécanisme de sortie du barème sur cumul.
   */
  it('rend une moyenne plus haute quand la promesse n’est pas tenue', () => {
    const tenue = scenarioOf(1000, 10_000, 2, grid([500, 1000]));
    const manquee = scenarioOf(1000, 7000, 2, grid([350, 700]));

    expect(tenue?.averageUnitCents).toBe(160);
    // 350 × 2,00 € puis 350 × 1,60 € → moyenne 1,80 €.
    expect(manquee?.averageUnitCents).toBe(180);
  });

  it('le dernier cumul vaut EXACTEMENT le volume, sans reste d’arrondi', () => {
    const scenario = scenarioOf(1000, 10_000, 3, grid([333, 667, 1000]));

    expect(scenario?.installments.at(-1)?.cumulativeQuantity).toBe(1000);
    expect(scenario?.totalQuantity).toBe(1000);
    expect(scenario?.installments.reduce((sum, line) => sum + line.quantity, 0)).toBe(1000);
  });

  /** Un scénario incomplet ne s'affiche pas : un total partiel se lirait comme un total. */
  it('rend null si un niveau manque dans la réponse', () => {
    expect(scenarioOf(1000, 10_000, 2, grid([500]))).toBeNull();
  });
});
