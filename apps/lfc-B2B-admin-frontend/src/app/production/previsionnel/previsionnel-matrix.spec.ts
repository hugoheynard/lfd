import type { CatalogItemView, ProductionForecastView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { forecastRayons, totalOfRayons } from './previsionnel-matrix';

const DAYS = ['2026-09-03', '2026-09-04', '2026-09-05'];

function view(
  lines: readonly { sku: string; productName: string; quantities: readonly number[] }[],
  peakDate: string | null = null,
): ProductionForecastView {
  return {
    days: DAYS.map((date) => ({ date, totalUnits: 0, orderCount: 0, closed: false })),
    lines: lines.map((line) => ({
      ...line,
      totalUnits: line.quantities.reduce((sum, quantity) => sum + quantity, 0),
    })),
    peakDate,
    totalUnits: 0,
  };
}

function item(sku: string, category: CatalogItemView['category']): CatalogItemView {
  return { sku, name: sku, unitPriceMillicents: 0, vatRate: 5.5, category };
}

describe('forecastRayons', () => {
  it("range les rayons dans l'ordre de la vitrine, pas par poids", () => {
    const rayons = forecastRayons(
      view([
        { sku: 'CHO-1', productName: 'Tablette', quantities: [900, 0, 0] },
        { sku: 'VIE-1', productName: 'Croissant', quantities: [10, 0, 0] },
      ]),
      [item('CHO-1', 'chocolat'), item('VIE-1', 'viennoiserie')],
    );
    expect(rayons.map((rayon) => rayon.label)).toEqual(['Viennoiseries', 'Chocolat & confiserie']);
  });

  it("trie les produits d'un rayon par quantité décroissante, puis par nom", () => {
    const rayons = forecastRayons(
      view([
        { sku: 'VIE-1', productName: 'Croissant', quantities: [10, 0, 0] },
        { sku: 'VIE-2', productName: 'Pain au chocolat', quantities: [40, 0, 0] },
        { sku: 'VIE-3', productName: 'Chausson', quantities: [40, 0, 0] },
      ]),
      [item('VIE-1', 'viennoiserie'), item('VIE-2', 'viennoiserie'), item('VIE-3', 'viennoiserie')],
    );
    expect(rayons[0]?.lines.map((line) => line.productName)).toEqual([
      'Chausson',
      'Pain au chocolat',
      'Croissant',
    ]);
  });

  it('somme le rayon colonne par colonne, et pas seulement en total', () => {
    const rayons = forecastRayons(
      view([
        { sku: 'VIE-1', productName: 'Croissant', quantities: [10, 5, 0] },
        { sku: 'VIE-2', productName: 'Pain au chocolat', quantities: [2, 0, 7] },
      ]),
      [item('VIE-1', 'viennoiserie'), item('VIE-2', 'viennoiserie')],
    );
    expect(rayons[0]?.quantities).toEqual([12, 5, 7]);
    expect(rayons[0]?.totalUnits).toBe(24);
    expect(totalOfRayons(rayons)).toBe(24);
  });

  /**
   * Un SKU que le catalogue ne connaît plus ne disparaît pas : il tomberait
   * sinon des totaux du fournil sans que rien le dise.
   */
  it('range hors catalogue un SKU que le catalogue ne connaît plus, en FIN de liste', () => {
    const rayons = forecastRayons(
      view([
        { sku: 'VIE-1', productName: 'Croissant', quantities: [10, 0, 0] },
        { sku: 'XXX-9', productName: 'Produit retiré', quantities: [3, 0, 0] },
      ]),
      [item('VIE-1', 'viennoiserie')],
    );
    expect(rayons.map((rayon) => rayon.label)).toEqual(['Viennoiseries', 'Hors catalogue']);
    expect(rayons[1]?.category).toBeNull();
    expect(totalOfRayons(rayons)).toBe(13);
  });

  it('donne à chaque ligne autant de cases que de jours, quoi que dise la ligne', () => {
    const rayons = forecastRayons(
      view([{ sku: 'VIE-1', productName: 'Croissant', quantities: [10, 0, 0] }]),
      [item('VIE-1', 'viennoiserie')],
    );
    expect(rayons[0]?.lines[0]?.cells).toHaveLength(DAYS.length);
  });

  it('pastille une quantité bien au-delà de la moyenne du produit', () => {
    const rayons = forecastRayons(
      view([{ sku: 'VIE-1', productName: 'Croissant', quantities: [10, 10, 400] }]),
      [item('VIE-1', 'viennoiserie')],
    );
    expect(rayons[0]?.lines[0]?.cells.map((cell) => cell.exceptional)).toEqual([
      false,
      false,
      true,
    ]);
  });

  /**
   * La moyenne se prend sur les jours ACTIFS : un produit livré le seul samedi
   * serait sinon « exceptionnel » chaque semaine, et la pastille deviendrait du
   * bruit qu'on cesse de lire.
   */
  /**
   * Trouvé en REGARDANT la grille : sur la colonne du pic, presque chaque
   * produit dépasse deux fois sa moyenne — c'est la définition d'un pic. La
   * mention s'y répétait ligne après ligne, à côté d'une colonne déjà teintée
   * et déjà nommée « pic », et cessait donc d'être un signal.
   */
  it('ne pastille rien sur la colonne du pic, qui est déjà annoncée', () => {
    const rayons = forecastRayons(
      view([{ sku: 'VIE-1', productName: 'Croissant', quantities: [10, 10, 400] }], DAYS[2]),
      [item('VIE-1', 'viennoiserie')],
    );
    expect(rayons[0]?.lines[0]?.cells.every((cell) => !cell.exceptional)).toBe(true);
  });

  it("ne pastille pas un produit qui ne sort qu'un jour", () => {
    const rayons = forecastRayons(
      view([{ sku: 'VIE-1', productName: 'Croissant', quantities: [0, 0, 400] }]),
      [item('VIE-1', 'viennoiserie')],
    );
    expect(rayons[0]?.lines[0]?.cells.every((cell) => !cell.exceptional)).toBe(true);
  });

  it('rend une liste vide plutôt que des rayons vides quand rien ne sort', () => {
    expect(forecastRayons(view([]), [])).toEqual([]);
    expect(totalOfRayons([])).toBe(0);
  });
});
