import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ALL_POINTS, type PackingBoard, type PackingCard } from '../packing-cards';
import { PackingBand } from './packing-band';

function card(reference: string, destination: string): PackingCard {
  return {
    reference,
    orderId: null,
    customerLabel: reference,
    method: 'pickup',
    destination,
    state: 'to_pack',
    lineCount: 1,
    packedLines: 0,
    containers: 0,
    awaited: [],
    initials: [],
    slotMinutes: null,
    packedAt: null,
  };
}

const BOARD: PackingBoard = {
  notClosed: false,
  upcoming: [],
  visible: [card('A', 'Mairie'), card('B', 'Boutique')],
  overflow: 0,
  packed: [card('C', 'Mairie')],
  toPack: 2,
  awaitingOven: 0,
};

async function mount() {
  const fixture = TestBed.createComponent(PackingBand);
  fixture.componentRef.setInput('board', BOARD);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('PackingBand', () => {
  it('pose le repère et le filtre, sur « Tous les points » par défaut', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Par heure de remise');
    expect(element.textContent).toContain('Tous les points');
    expect(fixture.componentInstance.point()).toBe(ALL_POINTS);
    expect(element.querySelector('.filter')?.classList).not.toContain('is-active');
  });

  it('marque le filtre actif dès qu’un point est retenu', async () => {
    const fixture = await mount();
    fixture.componentInstance.point.set('Mairie');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.filter')?.classList).toContain('is-active');
    expect(element.textContent).toContain('Mairie');
  });
});
