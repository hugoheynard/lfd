import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PackingBoard, PackingCard } from '../packing-cards';
import { NO_MATCHES, type SupervisionMatches } from '../supervision-search';
import { PackingColumn } from './packing-column';

function card(reference: string, overrides: Partial<PackingCard> = {}): PackingCard {
  return {
    reference,
    customerLabel: `Client ${reference}`,
    state: 'in_progress',
    lineCount: 9,
    packedLines: 6,
    containers: 1,
    awaited: [],
    initials: ['LT'],
    slotMinutes: 420,
    packedAt: null,
    ...overrides,
  };
}

const BOARD: PackingBoard = {
  notClosed: false,
  visible: [
    card('CMD-1'),
    card('CMD-2', { state: 'awaiting_oven', awaited: ['Éclair pistache'], packedLines: 0 }),
  ],
  overflow: 13,
  packed: [card('CMD-3', { state: 'packed', packedAt: '5 h 12' })],
  toPack: 15,
  awaitingOven: 1,
};

async function mount(board: PackingBoard, matches: SupervisionMatches = NO_MATCHES) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PackingColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('matches', matches);
  fixture.componentRef.setInput('showLinks', true);
  fixture.detectChanges();
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

describe('PackingColumn', () => {
  /** Hugo, 2026-09-28 : l'heure où la commande a été déclarée prête manquait. */
  it('donne l’heure de déclaration aux commandes colisées', async () => {
    const element = await mount(BOARD);

    expect(
      element.querySelector('[data-reference="CMD-3"] [data-packed-at]')?.textContent,
    ).toContain('Déclarée prête à 5 h 12');
  });

  it('surligne les commandes que la recherche désigne', async () => {
    const element = await mount(BOARD, { references: new Set(['CMD-3']), skus: new Set() });

    expect(element.querySelector('[data-reference="CMD-3"]')?.classList).toContain('is-match');
    expect(element.querySelector('[data-reference="CMD-1"]')?.classList).not.toContain('is-match');
  });

  it('écrit l’avancement d’un bac en cours, et qui y pose', async () => {
    const element = await mount(BOARD);
    const inProgress = element.querySelector('[data-reference="CMD-1"]');

    expect(inProgress?.textContent).toContain('6 références sur 9 posées');
    expect(inProgress?.textContent).toContain('en cours · LT');
    expect(inProgress?.textContent).toContain('CMD-1 · 9 réf. · 1 bac');
  });

  it('nomme ce qui attend le four, sans renvoi — rien à y faire', async () => {
    const element = await mount(BOARD);
    const waiting = element.querySelector('[data-reference="CMD-2"]');

    expect(waiting?.textContent).toContain('Éclair pistache');
    expect(waiting?.querySelector('a')).toBeNull();
  });

  /** Hugo, 2026-09-28 : les colisées restent visibles, en bas et en vert. */
  it('compte au-delà de dix et garde les colisées en cartes, en bas', async () => {
    const element = await mount(BOARD);
    const packed = element.querySelector('[data-packing="packed"]');

    expect(element.textContent).toContain('+ 13 commandes · triées par heure de retrait');
    expect(element.querySelector('[data-done-divider]')).not.toBeNull();
    expect(packed?.textContent).toContain('Client CMD-3');
    expect(packed?.classList).toContain('is-done');
  });

  it('dit que la journée n’est pas arrêtée', async () => {
    const element = await mount({ ...BOARD, notClosed: true });

    expect(element.querySelector('[data-not-closed]')).not.toBeNull();
    expect(element.querySelector('fold-card')).toBeNull();
  });
});
