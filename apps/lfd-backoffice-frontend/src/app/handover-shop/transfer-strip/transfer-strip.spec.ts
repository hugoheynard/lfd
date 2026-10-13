import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, OrderTransferView } from '@lfd/contracts';

import { TransferStrip } from './transfer-strip';

/**
 * La bande du transfert : une carte par transfert de l'onglet, rien sans
 * transfert, et « Réceptionner » seulement sur un transfert prévu ou parti,
 * pour qui a la garde du comptoir en écriture.
 */

function entry(orderId: string, transfer: OrderTransferView | null): HandoverQueueEntryView {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel: 'Val Village',
    fulfillmentMethod: 'pickup',
    window: null,
    totalUnits: 4,
    placedAt: '2026-09-10T05:00:00.000Z',
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    heldForQuality: false,
    clientele: 'pro',
    transfer,
  };
}

const DEPARTED: OrderTransferView = {
  transferId: 'tr_1',
  siteLabel: 'Val Village',
  state: 'departed',
  at: '2026-09-10T05:12:00.000Z',
  binCount: 2,
};

async function render(
  entries: readonly HandoverQueueEntryView[],
  canReceive: boolean,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [TransferStrip] });
  const fixture = TestBed.createComponent(TransferStrip);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('canReceive', canReceive);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function buttons(host: HTMLElement): string[] {
  return [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
}

describe('TransferStrip', () => {
  it('ne rend rien sur un onglet sans transfert', async () => {
    const host = await render([entry('a', null)], true);
    expect(host.querySelectorAll('fold-card')).toHaveLength(0);
  });

  it('une carte par transfert, avec Réceptionner pour qui en a le droit', async () => {
    const host = await render([entry('a', DEPARTED), entry('b', DEPARTED)], true);
    expect(host.querySelectorAll('fold-card')).toHaveLength(1);
    expect(host.textContent).toContain('2 bacs · 2 commandes');
    expect(buttons(host)).toEqual(['Réceptionner']);
  });

  it('sans droit, ou une fois reçu, aucun bouton', async () => {
    expect(buttons(await render([entry('a', DEPARTED)], false))).toEqual([]);
    TestBed.resetTestingModule();
    const received = { ...DEPARTED, state: 'received' as const };
    expect(buttons(await render([entry('a', received)], true))).toEqual([]);
  });
});
