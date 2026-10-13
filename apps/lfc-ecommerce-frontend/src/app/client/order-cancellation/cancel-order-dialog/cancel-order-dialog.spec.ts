import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import type { CancelOutcome, CancelReason } from '../cancellation-wording';
import { OrderCancellationGateway } from '../order-cancellation.gateway';
import { CancelOrderDialog } from './cancel-order-dialog';

const FR = orderCancelCopy('fr');

interface Mounted {
  readonly fixture: ComponentFixture<CancelOrderDialog>;
  readonly sent: [string, CancelReason][];
  readonly closed: unknown[];
  readonly toasts: string[];
}

async function mount(outcome: CancelOutcome): Promise<Mounted> {
  const sent: [string, CancelReason][] = [];
  const closed: unknown[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CancelOrderDialog],
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
      {
        provide: OrderCancellationGateway,
        useValue: {
          cancel: (orderId: string, reason: CancelReason) => {
            sent.push([orderId, reason]);
            return Promise.resolve(outcome);
          },
        },
      },
      { provide: NotifyService, useValue: { success: (m: string) => toasts.push(m) } },
    ],
  });
  const fixture = TestBed.createComponent(CancelOrderDialog);
  fixture.componentRef.setInput('data', {
    orderId: 'o-1',
    reference: 'LFC-0042',
    state: {
      cancellable: true,
      until: null,
      money: { kind: 'nothing_charged' },
      voucherReturned: false,
    },
  });
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, sent, closed, toasts };
}

async function clickConfirm(fixture: ComponentFixture<CancelOrderDialog>): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>('[data-confirm]')
    ?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CancelOrderDialog', () => {
  it('n’écrit rien à l’ouverture : seul le clic annule', async () => {
    const { sent } = await mount({ kind: 'done' });
    expect(sent).toEqual([]);
  });

  it('annonce et ferme sur `true` quand la commande est annulée', async () => {
    const { fixture, sent, closed, toasts } = await mount({ kind: 'done' });
    await clickConfirm(fixture);
    expect(sent).toEqual([['o-1', {}]]);
    expect(toasts).toEqual([FR.done]);
    expect(closed).toEqual([true]);
  });

  it('garde un 409 dans le dialogue, dit d’après son code', async () => {
    const { fixture, closed } = await mount({
      kind: 'refused',
      errorCode: 'orders.customer_cancel.in_preparation',
      message: 'phrase du serveur',
    });
    await clickConfirm(fixture);
    const refusal = (fixture.nativeElement as HTMLElement).querySelector('[data-refusal]');
    expect(refusal?.textContent).toContain(FR.refusals.in_preparation);
    expect(closed).toEqual([]);
  });
});
