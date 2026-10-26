import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { MAP_TILES } from '../map-tiles.config';
import { RoundColumn } from '../round-column/round-column';
import type { Board, BoardDrop, BoardRound, BoardStop } from '../rounds-board-model';
import { POOL_KEY } from '../rounds-board-model';
import { FoldButtonIconComponent } from 'fold-ng';
import { type BoardFocus, roundChoiceLabel } from '../rounds-board-view';
import { POOL_INLINE_SIZE, RoundsBoard } from './rounds-board';

function stop(orderId: string): BoardStop {
  return {
    orderId,
    stopId: `s-${orderId}`,
    reference: `CMD-${orderId}`,
    sheet: null,
    window: null,
    windowClash: null,
    signals: [],
    broughtBackAt: null,
    proposed: false,
    windowMissed: false,
    placementLate: false,
    defaultDemand: null,
    outOfZone: false,
  };
}

function round(key: string, vehicleId: string, overrides: Partial<BoardRound> = {}): BoardRound {
  return {
    key,
    roundId: key,
    vehicleId,
    vehicleName: vehicleId === 'v-1' ? 'Kangoo blanc' : 'Trafic frigo',
    passage: 1,
    departedAt: null,
    returnedAt: null,
    frozen: false,
    vehicleRetired: false,
    driver: null,
    geometry: null,
    timing: null,
    unknownDemand: 0,
    place: null,
    stops: [],
    ...overrides,
  };
}

/** Kangoo : passage 1 parti, passage 2 en préparation ; Trafic : une tournée partie. */
const BOARD: Board = {
  rounds: [
    round('r-1', 'v-1', {
      frozen: true,
      departedAt: '2026-10-02T05:02:00.000Z',
      stops: [stop('1')],
    }),
    round('r-2', 'v-2', {
      frozen: true,
      departedAt: '2026-10-02T05:10:00.000Z',
      stops: [stop('2')],
    }),
    round('r-3', 'v-1', { passage: 2 }),
  ],
  pool: [{ orderId: '4', reference: 'CMD-4', sheet: null, broughtBackAt: null, reason: null }],
};

interface Mounted {
  readonly fixture: ComponentFixture<RoundsBoard>;
  readonly element: HTMLElement;
  readonly drops: BoardDrop[];
  readonly missed: string[];
}

function mount(board: Board = BOARD): Mounted {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAP_TILES, useValue: { baseUrl: '', wholeFile: false } },
      { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
    ],
  });
  const fixture = TestBed.createComponent(RoundsBoard);
  fixture.componentRef.setInput('status', 'ready');
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('incidentPhoto', () => Promise.resolve(new Blob()));
  fixture.componentRef.setInput('departure', { label: 'Le Labo', gps: { lat: 45.4, lng: 6.9 } });
  fixture.detectChanges();
  const drops: BoardDrop[] = [];
  const missed: string[] = [];
  fixture.componentInstance.dropped.subscribe((drop) => drops.push(drop));
  fixture.componentInstance.noTarget.subscribe((name) => missed.push(name));
  return { fixture, element: fixture.nativeElement as HTMLElement, drops, missed };
}

function click(element: HTMLElement, selector: string): void {
  element.querySelector<HTMLElement>(selector)?.click();
}

/** Un dépôt CDK sur l'onglet d'un véhicule. */
function tabDrop(fixture: ComponentFixture<RoundsBoard>, vehicleId: string, orderId = '4'): void {
  fixture.debugElement
    .query(By.css(`[data-tab="${vehicleId}"]`))
    .triggerEventHandler('cdkDropListDropped', {
      item: { data: orderId },
      previousContainer: { data: POOL_KEY },
      container: { data: `tab:${vehicleId}` },
      previousIndex: 0,
      currentIndex: 0,
    });
  fixture.detectChanges();
}

describe('RoundsBoard', () => {
  it('« Toutes » par défaut : tous les véhicules, en-têtes compris, la carte sur toutes', () => {
    const { element } = mount();
    expect(element.querySelectorAll('[data-vehicle-group]')).toHaveLength(2);
    expect(element.querySelector('[data-passages]')?.textContent).toContain('2 passages');
    // « Toutes » n'a plus de carte : elle est dans « Par véhicule » (2026-10-26).
    expect(element.querySelector('[data-map-panel]')).toBeNull();
    expect(element.querySelector('[data-tab="all"]')?.textContent).toContain('3 tournées');
  });

  it('un onglet véhicule ouvre « Par véhicule » : ses tournées, la carte sur « Ce véhicule », sans onglets', () => {
    const { fixture, element } = mount();
    click(element, '[data-tab="v-1"]');
    fixture.detectChanges();

    const columns = fixture.debugElement.queryAll(By.directive(RoundColumn));
    // Deux passages : le premier seul, le sélecteur choisit l'autre.
    expect(columns.map((column) => (column.componentInstance as RoundColumn).round().key)).toEqual([
      'r-1',
    ]);
    // L'onglet dit déjà le véhicule : pas d'en-tête de bloc.
    expect(element.querySelector('[data-passages]')).toBeNull();
    expect(element.querySelector('[data-map-title]')?.textContent).toContain('Kangoo blanc');
    expect(fixture.componentInstance['scope']()).toBe('vehicle');
    expect(element.querySelector('[data-round-title]')?.textContent).toContain('Passage 1');
    // Les onglets restent en « Toutes » seulement : ici, ce sont les flèches.
    expect(element.querySelector('[role="tablist"]')).toBeNull();
    expect(element.querySelector('[data-vehicle-stepper]')).not.toBeNull();
  });

  it('les onglets par véhicule sont là en « Toutes »', () => {
    const { element } = mount();
    expect(element.querySelector('[role="tablist"]')).not.toBeNull();
    expect(element.querySelector('[data-tab="v-1"]')).not.toBeNull();
  });

  it('« Passage » : seulement à deux passages ou plus ; il choisit la tournée, et revient à 1 au véhicule suivant', () => {
    const { fixture, element } = mount();
    const focuses: BoardFocus[] = [];
    fixture.componentInstance.focusChange.subscribe((focus) => focuses.push(focus));
    fixture.componentRef.setInput('focus', {
      view: 'vehicule',
      vehicleId: 'v-1',
      passage: 1,
      map: false,
    });
    fixture.detectChanges();
    const shown = (): string[] =>
      fixture.debugElement
        .queryAll(By.directive(RoundColumn))
        .map((column) => (column.componentInstance as RoundColumn).round().key);

    expect(element.querySelector('[data-passage]')).not.toBeNull();
    fixture.debugElement.query(By.css('[data-passage]')).triggerEventHandler('valueChange', '2');
    fixture.detectChanges();
    expect(focuses).toEqual([{ view: 'vehicule', vehicleId: 'v-1', passage: 2, map: false }]);
    expect(shown()).toEqual(['r-3']);
    expect(fixture.componentInstance['mains']().map((round) => round.key)).toEqual(['r-3']);

    fixture.debugElement.query(By.css('[data-vehicle-next]')).triggerEventHandler('clicked');
    fixture.detectChanges();
    expect(focuses.at(-1)).toEqual({ view: 'vehicule', vehicleId: 'v-2', passage: 1, map: false });
    // Un seul passage : pas de sélecteur.
    expect(element.querySelector('[data-passage]')).toBeNull();
    expect(shown()).toEqual(['r-2']);
  });

  it('dépôt sur un onglet : en fin du dernier passage en préparation, puis l’onglet s’ouvre', () => {
    const { fixture, element, drops } = mount();
    tabDrop(fixture, 'v-1');
    expect(drops).toEqual([
      { orderId: '4', from: { list: POOL_KEY, index: 0 }, to: { list: 'r-3', index: 0 } },
    ]);
    expect(element.querySelector('[data-map-title]')?.textContent).toContain('Kangoo blanc');
  });

  it('dépôt sur un onglet sans tournée en préparation : rien ne part, la page le dit', () => {
    const { fixture, drops, missed } = mount();
    tabDrop(fixture, 'v-2');
    expect(drops).toEqual([]);
    expect(missed).toEqual(['Trafic frigo']);
  });

  it('« Mettre dans » : un sélecteur des tournées ouvertes, qui envoie en fin de tournée', () => {
    const { fixture, drops } = mount();
    fixture.componentRef.setInput('colors', new Map([['v-1', '#123456']]));
    fixture.detectChanges();
    const listbox = fixture.debugElement.query(By.css('[data-order] [data-assign]'));
    const options = [
      ...(listbox.nativeElement as HTMLElement).querySelectorAll('[data-assign-option]'),
    ];
    // Kangoo part deux fois : « · P2 ». Le carré à la couleur de la tournée, avant le nom.
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Kangoo blanc · P2']);
    expect(
      options[0]
        ?.querySelector<HTMLElement>('[data-assign-swatch]')
        ?.style.getPropertyValue('--vehicle-color'),
    ).toBe('#123456');
    listbox.triggerEventHandler('selectionChange', 'r-3');
    expect(drops).toEqual([
      { orderId: '4', from: { list: POOL_KEY, index: 0 }, to: { list: 'r-3', index: 0 } },
    ]);
  });

  it('le nom d’une tournée : le véhicule seul, « · P1 » quand il part plusieurs fois', () => {
    const rounds = BOARD.rounds;
    expect(roundChoiceLabel(rounds[1]!, rounds)).toBe('Trafic frigo');
    expect(roundChoiceLabel(rounds[0]!, rounds)).toBe('Kangoo blanc · P1');
    expect(roundChoiceLabel(rounds[2]!, rounds)).toBe('Kangoo blanc · P2');
  });

  it('« Par véhicule » : un véhicule, ses tournées et la carte ; la bascule remonte à la page', () => {
    const { fixture, element } = mount();
    const focuses: BoardFocus[] = [];
    fixture.componentInstance.focusChange.subscribe((focus) => focuses.push(focus));

    fixture.debugElement
      .query(By.css('[data-board-view]'))
      .triggerEventHandler('valueChange', 'vehicule');
    fixture.detectChanges();

    expect(focuses).toEqual([{ view: 'vehicule', vehicleId: null, passage: 1, map: false }]);
    expect(element.querySelector('[data-board]')?.classList).not.toContain('all-view');
    expect(element.querySelector('[data-map-panel]')).not.toBeNull();
    expect(element.querySelector('[data-vehicle-name]')?.textContent).toContain('Kangoo blanc');
    expect(element.querySelector('[data-vehicle-count]')?.textContent?.trim()).toBe('1 / 2');
    expect(element.querySelectorAll('[data-vehicle-group]')).toHaveLength(1);
    // Ni liste ni note sous la carte (Hugo, 2026-10-26).
    expect(element.querySelector('[data-map-rows]')).toBeNull();
    expect(element.querySelector('[data-map-note]')).toBeNull();

    fixture.debugElement
      .query(By.css('[data-board-view]'))
      .triggerEventHandler('valueChange', 'toutes');
    fixture.detectChanges();
    expect(focuses.at(-1)).toEqual({ view: 'toutes', vehicleId: null, passage: 1, map: false });
    expect(element.querySelector('[data-map-panel]')).toBeNull();
    expect(element.querySelector('[data-vehicle-stepper]')).toBeNull();
  });

  it('les flèches passent d’un véhicule à l’autre, et s’éteignent au premier et au dernier', () => {
    const { fixture, element } = mount();
    const focuses: BoardFocus[] = [];
    fixture.componentInstance.focusChange.subscribe((focus) => focuses.push(focus));
    fixture.componentRef.setInput('focus', {
      view: 'vehicule',
      vehicleId: 'v-1',
      passage: 1,
      map: false,
    });
    fixture.detectChanges();
    const arrow = (which: 'prev' | 'next'): FoldButtonIconComponent =>
      fixture.debugElement.query(By.css(`[data-vehicle-${which}]`))
        .componentInstance as FoldButtonIconComponent;

    expect(arrow('prev').disabled()).toBe(true);
    expect(arrow('next').disabled()).toBe(false);

    fixture.debugElement.query(By.css('[data-vehicle-next]')).triggerEventHandler('clicked');
    fixture.detectChanges();
    expect(focuses).toEqual([{ view: 'vehicule', vehicleId: 'v-2', passage: 1, map: false }]);
    expect(element.querySelector('[data-vehicle-name]')?.textContent).toContain('Trafic frigo');
    expect(element.querySelector('[data-vehicle-count]')?.textContent?.trim()).toBe('2 / 2');
    expect(arrow('next').disabled()).toBe(true);
    expect(arrow('prev').disabled()).toBe(false);

    fixture.debugElement.query(By.css('[data-vehicle-prev]')).triggerEventHandler('clicked');
    fixture.detectChanges();
    expect(focuses.at(-1)).toEqual({ view: 'vehicule', vehicleId: 'v-1', passage: 1, map: false });
  });

  it('un véhicule inconnu du jour retombe sur le premier', () => {
    const { fixture, element } = mount();
    fixture.componentRef.setInput('focus', {
      view: 'vehicule',
      vehicleId: 'v-disparu',
      passage: 1,
      map: false,
    });
    fixture.detectChanges();
    expect(element.querySelector('[data-vehicle-name]')?.textContent).toContain('Kangoo blanc');
  });

  it('« Toutes » sur la carte : une colonne de tous les arrêts, la carte en grand ; puis retour aux colonnes', () => {
    const { fixture, element } = mount();
    const focuses: BoardFocus[] = [];
    fixture.componentInstance.focusChange.subscribe((focus) => focuses.push(focus));
    expect(element.querySelector('[data-map-switch]')?.textContent).toContain('Afficher la carte');

    click(element, '[data-map-switch]');
    fixture.detectChanges();
    expect(focuses).toEqual([{ view: 'toutes', vehicleId: null, passage: 1, map: true }]);
    expect(element.querySelector('[data-board]')?.classList).not.toContain('all-view');
    expect(element.querySelector('[data-map-panel]')).not.toBeNull();
    expect(element.querySelector('[data-vehicle-group]')).toBeNull();
    const rows = [...element.querySelectorAll('[data-stop-row]')].map((row) => row.textContent);
    // Les arrêts de TOUTES les tournées, marqués par véhicule.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Kangoo');
    expect(rows[1]).toContain('Trafic');
    expect(element.querySelector('[data-map-switch]')?.textContent).toContain(
      'Afficher les tournées',
    );

    click(element, '[data-map-switch]');
    fixture.detectChanges();
    expect(focuses.at(-1)).toEqual({ view: 'toutes', vehicleId: null, passage: 1, map: false });
    expect(element.querySelector('[data-map-panel]')).toBeNull();
    expect(element.querySelector('[data-vehicle-group]')).not.toBeNull();
  });

  it('« À répartir » garde la même largeur dans toutes les vues', () => {
    const { fixture, element } = mount();
    const board = element.querySelector<HTMLElement>('[data-board]');
    const width = (): string | undefined => board?.style.getPropertyValue('--pool-inline-size');
    const widths = [width()];
    fixture.componentRef.setInput('focus', {
      view: 'vehicule',
      vehicleId: 'v-2',
      passage: 1,
      map: false,
    });
    fixture.detectChanges();
    widths.push(width());
    fixture.componentRef.setInput('focus', {
      view: 'toutes',
      vehicleId: null,
      passage: 1,
      map: true,
    });
    fixture.detectChanges();
    widths.push(width());
    expect(widths).toEqual([POOL_INLINE_SIZE, POOL_INLINE_SIZE, POOL_INLINE_SIZE]);
  });

  it('lâcher une commande à répartir sur « À répartir » ne fait rien', () => {
    const { fixture, drops } = mount();
    fixture.debugElement
      .query(By.css('[data-unassigned]'))
      .triggerEventHandler('cdkDropListDropped', {
        item: { data: '4' },
        previousContainer: { data: POOL_KEY },
        container: { data: POOL_KEY },
        previousIndex: 0,
        currentIndex: 0,
      });
    expect(drops).toEqual([]);
  });

  it('sans droit d’écriture : ni poignée, ni « Mettre dans »', () => {
    const { fixture, element } = mount();
    fixture.componentRef.setInput('canWrite', false);
    fixture.detectChanges();
    expect(element.querySelector('[data-assign]')).toBeNull();
    expect(element.querySelector('[data-order]')?.textContent).not.toContain('⋮⋮');
    // La carte et les onglets restent.
    expect(element.querySelector('[data-tab="v-1"]')).not.toBeNull();
    expect(element.querySelector('[data-board-view]')).not.toBeNull();
  });

  it('vide : « Tout est réparti »', () => {
    const { element } = mount({ ...BOARD, pool: [] });
    expect(element.querySelector('[data-pool-empty]')?.textContent).toContain('Tout est réparti');
  });
});
