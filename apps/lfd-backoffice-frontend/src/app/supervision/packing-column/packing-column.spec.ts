import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PackingBoard, PackingCard } from '../packing-cards';
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
  packed: [card('CMD-3', { state: 'packed' })],
  toPack: 15,
  awaitingOven: 1,
};

async function mount(board: PackingBoard) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PackingColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('showLinks', true);
  fixture.detectChanges();
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

describe('PackingColumn', () => {
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

  it('compte au-delà de dix et replie les colisées', async () => {
    const element = await mount(BOARD);

    expect(element.textContent).toContain('+ 13 commandes · triées par heure de retrait');
    expect(element.querySelector('[data-folded]')?.textContent).toContain('Client CMD-3');
  });

  it('dit que la journée n’est pas arrêtée', async () => {
    const element = await mount({ ...BOARD, notClosed: true });

    expect(element.querySelector('[data-not-closed]')).not.toBeNull();
    expect(element.querySelector('fold-card')).toBeNull();
  });
});
