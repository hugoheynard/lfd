import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ForecastTable } from './forecast-table';
import type { ForecastRayon } from '../previsionnel-matrix';
import { DAY_FOOT_ROWS, dayColumns, type ForecastHeader } from '../previsionnel-range';

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
    resupplyUnits: 0,
    closed: true,
    today: true,
    peak: false,
    state: 'closed',
    tone: 'current',
    stateLabel: 'Arrêté',
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
    resupplyUnits: 0,
    closed: false,
    today: false,
    peak: true,
    state: 'open',
    tone: null,
    stateLabel: null,
  }),
];

const RAYONS: readonly ForecastRayon[] = [
  {
    family: { id: 'fam_01J9V1', name: 'Viennoiseries', position: 1 },
    label: 'Viennoiseries',
    quantities: [100, 60],
    totalUnits: 160,
    lines: [
      {
        sku: 'VIE-001',
        productName: 'Croissant',
        saleUnit: 'piece',
        cells: [
          { quantity: 100, label: '100', pieces: 100, exceptional: false, resupply: 0 },
          { quantity: 0, label: '0', pieces: 0, exceptional: false, resupply: 0 },
        ],
        totalUnits: 100,
      },
      {
        sku: 'VIE-002',
        productName: 'Pain au chocolat',
        saleUnit: 'piece',
        cells: [
          { quantity: 0, label: '0', pieces: 0, exceptional: false, resupply: 0 },
          { quantity: 60, label: '60', pieces: 60, exceptional: false, resupply: 0 },
        ],
        totalUnits: 60,
      },
    ],
    intertitles: new Map(),
  },
];

function mount(rayons: readonly ForecastRayon[] = RAYONS): ComponentFixture<ForecastTable> {
  const fixture = TestBed.createComponent(ForecastTable);
  fixture.componentRef.setInput('columns', dayColumns(HEADERS));
  fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
  fixture.componentRef.setInput('rayons', rayons);
  fixture.detectChanges();
  return fixture;
}

describe('ForecastTable', () => {
  it('pose l’intertitre d’une sous-catégorie avant sa première ligne, dans le rayon racine', () => {
    const [rayon] = RAYONS;
    const fixture = mount(
      rayon === undefined
        ? []
        : [{ ...rayon, intertitles: new Map([['VIE-002', 'Viennoiserie fine']]) }],
    );
    const titles = [...fixture.nativeElement.querySelectorAll('[data-subcategory]')].map(
      (row: Element) => row.textContent?.trim(),
    );

    expect(titles).toEqual(['Viennoiserie fine']);
    expect(fixture.nativeElement.querySelectorAll('.pv-row--rayon')).toHaveLength(1);
  });

  it('rend une colonne de produit plus une par jour, sur CHAQUE ligne', () => {
    const fixture = mount();
    const rows = fixture.nativeElement.querySelectorAll('.pv-row');

    // tête + rayon + deux produits + trois pieds (pièces, dont réassorts, commandes — R3d)
    expect(rows).toHaveLength(7);
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

  it('dit la part des réassorts dans la case et au pied, sans la rajouter (R3d)', () => {
    const fixture = TestBed.createComponent(ForecastTable);
    fixture.componentRef.setInput(
      'columns',
      dayColumns(HEADERS.map((head, index) => ({ ...head, resupplyUnits: index === 0 ? 8 : 0 }))),
    );
    fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
    fixture.componentRef.setInput(
      'rayons',
      RAYONS.map((rayon) => ({
        ...rayon,
        lines: rayon.lines.map((line, index) => ({
          ...line,
          cells: line.cells.map((cell, column) => ({
            ...cell,
            resupply: index === 0 && column === 0 ? 8 : 0,
          })),
        })),
      })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-forecast-resupply]')?.textContent).toContain('dont 8 réassort');
    expect(el.querySelectorAll('[data-forecast-resupply]')).toHaveLength(1);
    const foot = [...el.querySelectorAll('[data-foot="resupplies"]')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(foot).toEqual(['8', '']);
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

  it('rend des colonnes-tranches : l’heure en titre, et « sorti / à sortir » avec son état écrit', () => {
    const fixture = TestBed.createComponent(ForecastTable);
    fixture.componentRef.setInput('footRows', [
      { key: 'pieces', label: 'Charge (pièces)', kind: 'total' },
    ]);
    fixture.componentRef.setInput('columns', [
      {
        key: '07:00',
        overline: null,
        title: 'avant 07:00',
        figure: '120',
        mention: 'Dépassée · 11 min',
        settled: true,
        peak: false,
        tone: 'overdue',
        foot: ['120'],
      },
    ]);
    fixture.componentRef.setInput('rayons', [
      {
        family: null,
        label: 'Hors catalogue',
        quantities: [120],
        totalUnits: 120,
        intertitles: new Map(),
        lines: [
          {
            sku: 'CRO',
            productName: 'Croissant',
            saleUnit: 'piece',
            totalUnits: 120,
            cells: [
              {
                quantity: 120,
                label: '120',
                pieces: 120,
                exceptional: false,
                resupply: 0,
                progress: { label: '80 / 120', state: 'over', stateLabel: 'Dépassée' },
              },
            ],
          },
        ],
      },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.pv-day-date')?.textContent?.trim()).toBe('avant 07:00');
    expect(el.querySelector('.pv-day-state')?.textContent?.trim()).toBe('Dépassée · 11 min');
    expect(el.querySelector('.pv-day-offset')).toBeNull();
    expect(el.querySelector('.pv-qty-value')?.textContent?.trim()).toBe('80 / 120');
    expect(el.querySelector('.pv-progress[data-state="over"]')?.textContent?.trim()).toBe(
      'Dépassée',
    );
    expect(el.querySelectorAll('[data-foot]')).toHaveLength(1);
  });

  /**
   * Régression (Hugo, 2026-11-01) : toute la colonne d'une tranche dépassée
   * était rouge, même la case d'un produit qui y était tenu. Le rouge dit
   * « dépassée ET il manque des pièces ».
   */
  it('ne rougit dans une tranche dépassée que les produits qui y manquent', () => {
    const fixture = TestBed.createComponent(ForecastTable);
    fixture.componentRef.setInput('footRows', []);
    fixture.componentRef.setInput('columns', [
      {
        key: '07:00',
        overline: null,
        title: 'avant 07:00',
        figure: '240',
        mention: 'Dépassée · 11 min',
        settled: true,
        peak: false,
        tone: 'overdue',
        foot: [],
      },
    ]);
    const cellOf = (state: 'over' | 'met', label: string) => ({
      quantity: 120,
      label: '120',
      pieces: 120,
      exceptional: false,
      resupply: 0,
      progress: { label, state, stateLabel: state === 'over' ? 'Dépassée' : 'Tenue' },
    });
    fixture.componentRef.setInput('rayons', [
      {
        family: null,
        label: 'Hors catalogue',
        quantities: [240],
        totalUnits: 240,
        intertitles: new Map(),
        lines: [
          {
            sku: 'CRO',
            productName: 'Croissant',
            saleUnit: 'piece',
            totalUnits: 120,
            cells: [cellOf('over', '0 / 120')],
          },
          {
            sku: 'PAC',
            productName: 'Pain au chocolat',
            saleUnit: 'piece',
            totalUnits: 120,
            cells: [cellOf('met', '120 / 120')],
          },
        ],
      },
    ]);
    fixture.detectChanges();
    const tones = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.pv-qty')].map(
      (node) => node.getAttribute('data-tone'),
    );

    expect(tones).toEqual(['overdue', null]);
  });

  it('porte le total des pièces et le nombre de commandes, chacun sur sa ligne', () => {
    const fixture = mount();
    const pieces = [...fixture.nativeElement.querySelectorAll('.pv-foot-total')].map(
      (cell: Element) => cell.textContent?.trim(),
    );
    const orders = [...fixture.nativeElement.querySelectorAll('[data-foot="orders"]')].map(
      (cell: Element) => cell.textContent?.trim(),
    );

    expect(pieces).toEqual(['100', '60']);
    expect(orders).toEqual(['4', '2']);
  });

  it('marque la colonne du pic, en tête comme au pied', () => {
    const fixture = mount();

    expect(fixture.nativeElement.querySelectorAll('.pv-day.is-peak')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.pv-foot-total.is-peak')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('[data-foot="orders"].is-peak')).toHaveLength(1);
  });

  it('pose l’état sur TOUTE la colonne, de la tête au pied, et le nomme en tête', () => {
    const fixture = TestBed.createComponent(ForecastTable);
    fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
    fixture.componentRef.setInput(
      'columns',
      dayColumns([
        header({ tone: 'overdue', state: 'overdue', stateLabel: 'Plan non arrêté' }),
        header({
          date: '2026-09-04',
          tone: 'closedDay',
          state: 'closedDay',
          stateLabel: 'Fournil fermé',
        }),
      ]),
    );
    fixture.componentRef.setInput('rayons', RAYONS);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    // tête + rayon + deux produits + trois pieds = sept cellules par colonne
    // (le pied « dont réassorts » porte le repère de colonne, R3d)
    expect(el.querySelectorAll('[data-tone="overdue"]')).toHaveLength(7);
    expect(el.querySelectorAll('[data-tone="closedDay"]')).toHaveLength(7);
    const labels = [...el.querySelectorAll('.pv-day-state')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Plan non arrêté', 'Fournil fermé']);
  });

  it('ne pose aucune surcouche sur une colonne sans ton', () => {
    const fixture = mount();
    expect(fixture.nativeElement.querySelectorAll('[data-tone="current"]')).toHaveLength(7);
    expect(fixture.nativeElement.querySelectorAll('[data-tone]')).toHaveLength(7);
  });

  it('sans action, aucune colonne ne porte de bouton d’entrée', () => {
    const fixture = mount();
    expect(fixture.nativeElement.querySelectorAll('.pv-day-enter')).toHaveLength(0);
  });

  /** Hugo, 2026-11-02 : entrer dans une journée depuis sa colonne, sans sélecteur de date. */
  it('le bouton sous une colonne rend la clé de CETTE colonne', () => {
    const fixture = mount();
    fixture.componentRef.setInput('columnAction', 'Par tranche');
    const entered: string[] = [];
    fixture.componentInstance.columnEntered.subscribe((key) => entered.push(key));
    fixture.detectChanges();

    const buttons = [
      ...fixture.nativeElement.querySelectorAll('.pv-day-enter'),
    ] as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Par tranche', 'Par tranche']);
    buttons[1]?.click();
    expect(entered).toEqual(['2026-09-04']);
  });
});
