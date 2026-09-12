import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ForecastTable } from './forecast-table';
import type { ForecastRayon } from '../previsionnel-matrix';
import type { ForecastHeader } from '../previsionnel-range';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **un zéro est une cellule VIDE**, pas un « 0 » — une grille de zéros se lit
 *   comme une grille pleine, et c'est le rendu qui en décide ;
 * - **le repli d'un rayon retire ses lignes du DOM**, et le dit ;
 * - 🔴 **toutes les lignes portent le même gabarit de colonnes.** Une colonne
 *   décalée ment sur chacun de ses chiffres, et rien d'autre qu'un rendu ne
 *   peut le voir.
 */

function header(over: Partial<ForecastHeader> = {}): ForecastHeader {
  return {
    date: '2026-09-03',
    weekday: 'jeu.',
    dayMonth: '3 sept.',
    offset: 'aujourd’hui',
    totalUnits: 100,
    orderCount: 4,
    closed: true,
    today: true,
    peak: false,
    ...over,
  };
}

const HEADERS: readonly ForecastHeader[] = [
  header(),
  header({
    date: '2026-09-04',
    offset: 'J+1',
    totalUnits: 60,
    orderCount: 2,
    closed: false,
    today: false,
    peak: true,
  }),
];

const RAYONS: readonly ForecastRayon[] = [
  {
    category: 'viennoiserie',
    label: 'Viennoiseries',
    quantities: [100, 60],
    totalUnits: 160,
    lines: [
      {
        sku: 'VIE-001',
        productName: 'Croissant',
        cells: [
          { quantity: 100, exceptional: false },
          { quantity: 0, exceptional: false },
        ],
        totalUnits: 100,
      },
      {
        sku: 'VIE-002',
        productName: 'Pain au chocolat',
        cells: [
          { quantity: 0, exceptional: false },
          { quantity: 60, exceptional: false },
        ],
        totalUnits: 60,
      },
    ],
  },
];

function mount(): ComponentFixture<ForecastTable> {
  const fixture = TestBed.createComponent(ForecastTable);
  fixture.componentRef.setInput('headers', HEADERS);
  fixture.componentRef.setInput('rayons', RAYONS);
  fixture.detectChanges();
  return fixture;
}

describe('ForecastTable', () => {
  it('rend une colonne de produit plus une par jour, sur CHAQUE ligne', () => {
    const fixture = mount();
    const rows = fixture.nativeElement.querySelectorAll('.pv-row');

    // tête + rayon + deux produits + deux pieds
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.querySelectorAll('.pv-cell')).toHaveLength(HEADERS.length + 1);
    }
  });

  it('laisse la cellule VIDE plutôt que d’écrire un zéro', () => {
    const fixture = mount();
    const cells = [...fixture.nativeElement.querySelectorAll('.pv-qty')].map((cell: Element) =>
      cell.textContent?.trim(),
    );

    expect(cells).toEqual(['100', '', '', '60']);
  });

  it('replie un rayon, et le dit', () => {
    const fixture = mount();
    const rayon: HTMLButtonElement = fixture.nativeElement.querySelector('.pv-row--rayon');

    expect(fixture.nativeElement.querySelectorAll('.pv-row--line')).toHaveLength(2);
    expect(rayon.getAttribute('aria-expanded')).toBe('true');

    rayon.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.pv-row--line')).toHaveLength(0);
    expect(rayon.getAttribute('aria-expanded')).toBe('false');
    expect(rayon.textContent).toContain('replié');
  });

  it('porte le total des pièces et le nombre de commandes, chacun sur sa ligne', () => {
    const fixture = mount();
    const pieces = [...fixture.nativeElement.querySelectorAll('.pv-foot-total')].map(
      (cell: Element) => cell.textContent?.trim(),
    );
    const orders = [...fixture.nativeElement.querySelectorAll('.pv-foot-orders')].map(
      (cell: Element) => cell.textContent?.trim(),
    );

    expect(pieces).toEqual(['100', '60']);
    expect(orders).toEqual(['4', '2']);
  });

  it('marque la colonne du pic, en tête comme au pied', () => {
    const fixture = mount();

    expect(fixture.nativeElement.querySelectorAll('.pv-day.is-peak')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.pv-foot-total.is-peak')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.pv-foot-orders.is-peak')).toHaveLength(1);
  });
});
