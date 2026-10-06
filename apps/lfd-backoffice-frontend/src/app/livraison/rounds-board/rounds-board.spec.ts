import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { MAP_TILES } from '../map-tiles.config';
import { RoundColumn } from '../round-column/round-column';
import type { Board, BoardDrop, BoardRound, BoardStop } from '../rounds-board-model';
import { POOL_KEY } from '../rounds-board-model';
import { RoundsBoard } from './rounds-board';

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
    expect(element.querySelector('[data-map-title]')?.textContent).toContain('Toutes les tournées');
    expect(element.querySelector('[data-tab="all"]')?.textContent).toContain('3 tournées');
  });

  it('un onglet véhicule filtre le centre et met la carte sur « Ce véhicule » ; « Toutes » la remet', () => {
    const { fixture, element } = mount();
    click(element, '[data-tab="v-1"]');
    fixture.detectChanges();

    const columns = fixture.debugElement.queryAll(By.directive(RoundColumn));
    expect(columns.map((column) => (column.componentInstance as RoundColumn).round().key)).toEqual([
      'r-1',
      'r-3',
    ]);
    // L'onglet dit déjà le véhicule : pas d'en-tête de bloc.
    expect(element.querySelector('[data-passages]')).toBeNull();
    expect(element.querySelector('[data-map-title]')?.textContent).toContain('Kangoo blanc');
    expect(fixture.componentInstance['scope']()).toBe('vehicle');
    expect(element.querySelector('[data-round-title]')?.textContent).toContain('Passage 1');

    click(element, '[data-tab="all"]');
    fixture.detectChanges();
    expect(fixture.componentInstance['scope']()).toBe('all');
    expect(element.querySelector('[data-map-title]')?.textContent).toContain('Toutes les tournées');
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

  it('« Mettre dans » : un bouton par tournée en préparation, qui envoie en fin de tournée', () => {
    const { element, drops } = mount();
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('[data-order] [data-assign]')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Kangoo · 2']);
    buttons[0]?.click();
    expect(drops).toEqual([
      { orderId: '4', from: { list: POOL_KEY, index: 0 }, to: { list: 'r-3', index: 0 } },
    ]);
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
    expect(element.querySelector('[data-map-panel]')).not.toBeNull();
  });

  it('vide : « Tout est réparti »', () => {
    const { element } = mount({ ...BOARD, pool: [] });
    expect(element.querySelector('[data-pool-empty]')?.textContent).toContain('Tout est réparti');
  });
});
