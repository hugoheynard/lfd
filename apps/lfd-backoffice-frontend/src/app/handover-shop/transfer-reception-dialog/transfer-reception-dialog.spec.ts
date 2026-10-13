import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { HandoverQueueService } from '../handover-queue.service';
import type { CounterTransfer } from '../handover-transfer';
import { TransferReceptionDialog } from './transfer-reception-dialog';

/**
 * Réceptionner : motif obligatoire sur un transfert jamais parti (réception
 * manuelle), facultatif après départ ; un refus reste dans le dialogue.
 */

const BASE: CounterTransfer = {
  key: 'tr_1',
  transferId: 'tr_1',
  siteLabel: 'Val Village',
  state: 'departed',
  at: '2026-09-10T05:12:00.000Z',
  binCount: 3,
  orderCount: 2,
  anyOrderId: 'ord_1',
};

class FakeApi {
  calls: { orderId: string; reason: string | null }[] = [];
  refuse: unknown = null;

  receiveTransfer(orderId: string, reason: string | null): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push({ orderId, reason });
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<TransferReceptionDialog>;
  readonly closedWith: (boolean | undefined)[];
  readonly submit: () => HTMLButtonElement;
}

async function render(api: FakeApi, data: CounterTransfer): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [TransferReceptionDialog],
    providers: [
      { provide: HandoverQueueService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(TransferReceptionDialog);
  fixture.componentRef.setInput('data', data);
  await fixture.whenStable();
  const submit = (): HTMLButtonElement => {
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    const found = buttons.find((b) => b.textContent?.trim() === 'Réceptionner');
    if (found === undefined) {
      throw new Error('bouton Réceptionner introuvable');
    }
    return found;
  };
  return { fixture, closedWith, submit };
}

function type(fixture: ComponentFixture<TransferReceptionDialog>, text: string): void {
  const area = (fixture.nativeElement as HTMLElement).querySelector('textarea');
  if (area === null) {
    throw new Error('zone de motif introuvable');
  }
  area.value = text;
  area.dispatchEvent(new Event('input'));
}

describe('TransferReceptionDialog', () => {
  it('parti : réceptionne sans motif, et ferme sur un succès', async () => {
    const api = new FakeApi();
    const { fixture, closedWith, submit } = await render(api, BASE);
    expect(submit().disabled).toBe(false);
    submit().click();
    await fixture.whenStable();
    expect(api.calls).toEqual([{ orderId: 'ord_1', reason: null }]);
    expect(closedWith).toEqual([true]);
  });

  it('jamais parti : refuse sans motif, puis envoie le motif saisi', async () => {
    const api = new FakeApi();
    const { fixture, closedWith, submit } = await render(api, { ...BASE, state: 'planned' });
    expect(submit().disabled).toBe(true);
    type(fixture, '  apporté en voiture  ');
    await fixture.whenStable();
    expect(submit().disabled).toBe(false);
    submit().click();
    await fixture.whenStable();
    expect(api.calls).toEqual([{ orderId: 'ord_1', reason: 'apporté en voiture' }]);
    expect(closedWith).toEqual([true]);
  });

  it('un refus du serveur reste dans le dialogue', async () => {
    const api = new FakeApi();
    api.refuse = new Error('déjà reçu');
    const { fixture, closedWith, submit } = await render(api, BASE);
    submit().click();
    await fixture.whenStable();
    expect(closedWith).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-callout')).not.toBeNull();
  });
});
