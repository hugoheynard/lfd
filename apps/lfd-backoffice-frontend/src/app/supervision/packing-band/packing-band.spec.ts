import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PackingBoard, PackingCard } from '../packing-cards';
import { PackingBand } from './packing-band';

function card(
  reference: string,
  pickupLabel: string | null,
  method: 'pickup' | 'delivery' = 'pickup',
): PackingCard {
  return {
    reference,
    orderId: null,
    customerLabel: reference,
    clientele: null,
    siteId: null,
    pickupLabel,
    method,
    destination: pickupLabel ?? 'Livraison',
    state: 'to_pack',
    lineCount: 1,
    packedLines: 0,
    containers: 0,
    awaited: [],
    initials: [],
    slotMinutes: null,
    packedAt: null,
    sheetOrderId: reference,
    deliveryNotePrint: null,
    abandoned: [],
    shelf: false,
  };
}

const BOARD: PackingBoard = {
  notClosed: false,
  upcoming: [],
  visible: [card('A', 'Mairie'), card('B', null, 'delivery')],
  overflow: 0,
  packed: [card('C', 'Mairie')],
  toPack: 2,
  awaitingOven: 0,
  withdrawn: [],
};

async function mount() {
  const fixture = TestBed.createComponent(PackingBand);
  fixture.componentRef.setInput('board', BOARD);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('PackingBand', () => {
  it('pose le repère et le filtre d’acheminement, rien de coché par défaut', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Par heure de remise');
    // Sans libellé au-dessus (Hugo, 2026-11-01) : le filtre se dit par son invite.
    expect(element.textContent).not.toContain('Acheminement');
    expect(element.textContent).toContain('Tous les acheminements');
    expect(fixture.componentInstance.routes()).toEqual([]);
    expect(element.querySelector('.filter')?.classList).not.toContain('is-active');
  });

  it('marque le filtre actif dès qu’un acheminement est coché', async () => {
    const fixture = await mount();
    fixture.componentInstance.routes.set(['Retrait Mairie', 'Livraison']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.filter')?.classList).toContain(
      'is-active',
    );
  });
});
