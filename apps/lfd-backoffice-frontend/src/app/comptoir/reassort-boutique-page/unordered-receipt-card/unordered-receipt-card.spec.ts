import { TestBed } from '@angular/core/testing';
import type { UnorderedReceiptView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ResupplyReceiptsService } from '../resupply-receipts.service';
import { UnorderedReceiptCard } from './unordered-receipt-card';

/** Le réassort sans commande (lot R2) : la saisie ligne par ligne, repliée en bas. */
const RECEIPT: UnorderedReceiptView = {
  lines: [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 3 }],
  updatedAt: '2026-01-02T08:00:00.000Z',
  updatedBy: 'Lou',
};

class FakeService {
  readonly calls: string[] = [];
  receive(siteId: string, day: string, sku: string, quantity: number): Promise<void> {
    this.calls.push(`receive ${siteId} ${day} ${sku} ${String(quantity)}`);
    return Promise.resolve();
  }
}

function mount(canWrite: boolean) {
  const service = new FakeService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UnorderedReceiptCard],
    providers: [{ provide: ResupplyReceiptsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(UnorderedReceiptCard);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('day', '2026-01-02');
  fixture.componentRef.setInput('receipt', RECEIPT);
  fixture.componentRef.setInput('articles', [
    { sku: 'CRO', name: 'Croissant' },
    { sku: 'PAC', name: 'Pain au chocolat' },
  ]);
  fixture.componentRef.setInput('canWrite', canWrite);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => (changed += 1));
  fixture.detectChanges();
  return { fixture, service, root: fixture.nativeElement as HTMLElement, changed: () => changed };
}

describe('UnorderedReceiptCard', () => {
  it('se replie sous un titre qui compte ses lignes', () => {
    const { root } = mount(true);
    expect(root.querySelector('fold-disclosure')?.textContent).toContain(
      'Réassort sans commande (1)',
    );
  });

  it('ajoute un article absent de la liste, puis prévient la page', async () => {
    const { fixture, service, changed } = mount(true);
    const card = fixture.componentInstance;
    expect(card['addableOptions']().map((o) => o.value)).toEqual(['PAC']);

    card['pickedSku'].set('PAC');
    card['pickedQuantity'].set(6);
    await card['add']();

    expect(service.calls).toEqual(['receive site_v 2026-01-02 PAC 6']);
    expect(changed()).toBe(1);
    expect(card['pickedSku']()).toBeNull();
  });

  it('en lecture seule, ni saisie ni geste', () => {
    const { root } = mount(false);
    expect(root.querySelector('[data-resupply-add]')).toBeNull();
    expect(root.querySelector('fold-number-input')).toBeNull();
  });
});
