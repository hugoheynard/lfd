import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import type { BoardDrop, BoardRound, BoardStop } from '../rounds-board-model';
import { RoundColumn, type StopShift } from './round-column';

function stop(orderId: string, overrides: Partial<BoardStop> = {}): BoardStop {
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
    ...overrides,
  };
}

function round(overrides: Partial<BoardRound> = {}): BoardRound {
  return {
    key: 'r-1',
    roundId: 'r-1',
    vehicleId: 'v-1',
    vehicleName: 'Kangoo blanc',
    passage: 1,
    departedAt: null,
    returnedAt: null,
    frozen: false,
    vehicleRetired: false,
    driver: null,
    geometry: null,
    timing: null,
    unknownDemand: 0,
    stops: [stop('1'), stop('2')],
    ...overrides,
  };
}

function mount(value: BoardRound, canWrite = true) {
  const fixture = TestBed.createComponent(RoundColumn);
  fixture.componentRef.setInput('round', value);
  fixture.componentRef.setInput('color', 'var(--fold-color-primary)');
  fixture.componentRef.setInput('title', 'Passage 1');
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('incidentPhoto', () => Promise.resolve(new Blob()));
  fixture.detectChanges();
  const drops: BoardDrop[] = [];
  const shifts: StopShift[] = [];
  const removed: string[] = [];
  let sorted = 0;
  fixture.componentInstance.dropped.subscribe((drop) => drops.push(drop));
  fixture.componentInstance.shifted.subscribe((shift) => shifts.push(shift));
  fixture.componentInstance.removed.subscribe((id) => removed.push(id));
  fixture.componentInstance.sorted.subscribe(() => (sorted += 1));
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    drops,
    shifts,
    removed,
    sorted: () => sorted,
  };
}

/** Le dépôt tel que le glisser-déposer du CDK le remonte. */
function dropEvent(to: string, from = 'pool', currentIndex = 0) {
  return {
    item: { data: '9' },
    previousContainer: { data: from },
    container: { data: to },
    previousIndex: 0,
    currentIndex,
  };
}

describe('RoundColumn', () => {
  it('remonte un dépôt avec sa place d’origine et sa place visée', () => {
    const { fixture, drops } = mount(round());
    fixture.debugElement
      .query(By.css('[data-stops]'))
      .triggerEventHandler('cdkDropListDropped', dropEvent('r-1', 'pool', 1));
    expect(drops).toEqual([
      { orderId: '9', from: { list: 'pool', index: 0 }, to: { list: 'r-1', index: 1 } },
    ]);
  });

  it('une tournée partie refuse le dépôt sans rien remonter, et n’a ni poignée ni ↑ ↓ (I6)', () => {
    const departed = round({ frozen: true, departedAt: '2026-10-02T05:02:00.000Z' });
    const { fixture, element, drops } = mount(departed);
    fixture.debugElement
      .query(By.css('[data-stops]'))
      .triggerEventHandler('cdkDropListDropped', dropEvent('r-1'));
    expect(drops).toEqual([]);
    expect(element.querySelector('[data-up]')).toBeNull();
    expect(element.querySelector('[data-remove]')).toBeNull();
    expect(element.querySelector('[data-round-state]')?.textContent).toContain('Partie');
    expect(element.textContent).toContain('Partie : gelée, rien ne s’y déplace.');
    expect(element.querySelector('[data-position]')?.className).toContain('num-frozen');
  });

  it('« Ranger par créneau » n’apparaît que sur une fenêtre intenable', () => {
    expect(mount(round()).element.querySelector('[data-sort]')).toBeNull();
    const clashing = round({ stops: [stop('1'), stop('2', { windowClash: 'CMD-1' })] });
    const { element, sorted } = mount(clashing);
    element.querySelector<HTMLButtonElement>('[data-sort]')?.click();
    expect(sorted()).toBe(1);
  });

  it('↑ ↓ et « Retirer » : l’équivalent clavier de chaque glisser', () => {
    const { element, shifts, removed } = mount(round());
    const cards = element.querySelectorAll('[data-stop]');
    cards[0]?.querySelector<HTMLButtonElement>('[data-down] button')?.click();
    cards[1]?.querySelector<HTMLButtonElement>('[data-up] button')?.click();
    cards[1]?.querySelector<HTMLButtonElement>('[data-remove] button')?.click();
    expect(shifts).toEqual([
      { index: 0, delta: 1 },
      { index: 1, delta: -1 },
    ]);
    expect(removed).toEqual(['2']);
    // Les bords ne bougent pas.
    expect(cards[0]?.querySelector('[data-up] button')?.hasAttribute('disabled')).toBe(true);
  });

  it('un signal met « Retirer de la tournée » en avant, titre en rouge (Q11)', () => {
    const signaled = round({ stops: [stop('1', { signals: ['Commande annulée'] })] });
    const { element, removed } = mount(signaled);
    const button = element.querySelector<HTMLButtonElement>('button[data-remove]');
    expect(button?.textContent).toContain('Retirer de la tournée');
    expect(button?.className).toContain('danger');
    button?.click();
    expect(removed).toEqual(['1']);
    expect(element.querySelector('[data-card-title]')?.className).toContain('title-alert');
  });

  it('en lecture seule : ni ↑ ↓, ni retrait, ni rangement', () => {
    const clashing = round({ stops: [stop('1'), stop('2', { windowClash: 'CMD-1' })] });
    const { element } = mount(clashing, false);
    for (const selector of ['[data-up]', '[data-down]', '[data-remove]', '[data-sort]']) {
      expect(element.querySelector(selector)).toBeNull();
    }
  });

  it('vide : « Tournée vide · Glissez une commande ici. »', () => {
    const { element } = mount(round({ stops: [] }));
    const empty = element.querySelector('[data-empty-round]');
    expect(empty?.textContent).toContain('Tournée vide');
    expect(empty?.textContent).toContain('Glissez une commande ici.');
  });

  it('une tournée proposée montre son départ, son retour et sa distance', () => {
    const proposed = round({
      roundId: null,
      timing: {
        departureTime: '05:40',
        returnTime: '08:15',
        meters: 41_600,
        minutes: 155,
        overDuration: false,
      },
    });
    const { element } = mount(proposed);
    expect(element.querySelector('[data-round-timing]')?.textContent?.trim()).toBe(
      'Départ 5 h 40 · Retour 8 h 15 · 42 km',
    );
    expect(element.querySelector('[data-over-duration]')).toBeNull();
  });

  it('une tournée qui dépasse la durée max. le dit', () => {
    const over = round({
      timing: {
        departureTime: '05:40',
        returnTime: '11:30',
        meters: 600,
        minutes: 350,
        overDuration: true,
      },
    });
    const { element } = mount(over);
    const line = element.querySelector('[data-round-timing]');
    expect(line?.textContent).toContain('< 1 km');
    expect(line?.classList).toContain('over');
    expect(element.querySelector('[data-over-duration]')?.textContent).toContain(
      'Dépasse la durée max.',
    );
  });

  it('une tournée sans chronométrage ne montre ni heures ni distance', () => {
    const { element } = mount(round());
    expect(element.querySelector('[data-round-timing]')).toBeNull();
  });

  it('une tournée aux commandes sans bacs connus dit que sa place n’est pas vérifiée, et comment la vérifier', () => {
    const { element } = mount(round({ unknownDemand: 2 }));
    const mention = element.querySelector('[data-unverified-place]');
    expect(mention?.textContent).toContain('Place non vérifiée — 2 commandes sans bacs connus');
    expect(mention?.textContent).toContain('Réglez les contenances des produits');
    expect(mention?.textContent).toContain('bacs déclarés au colisage');
  });

  it('une tournée dont la place est vérifiée ne montre aucune mention', () => {
    const { element } = mount(round());
    expect(element.querySelector('[data-unverified-place]')).toBeNull();
  });
});
