import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderCancellability } from '@lfd/contracts/shop-values';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import { OrderCancellationGateway } from '../order-cancellation.gateway';
import { OrderCancelSection } from './order-cancel-section';

const FR = orderCancelCopy('fr');

interface Mounted {
  readonly fixture: ComponentFixture<OrderCancelSection>;
  readonly opened: unknown[];
  readonly el: HTMLElement;
}

async function mount(
  cancellability: OrderCancellability | null,
  closeWith: boolean | undefined = undefined,
): Promise<Mounted> {
  const opened: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderCancelSection],
    providers: [
      {
        provide: OrderCancellationGateway,
        useValue: { cancellability: () => Promise.resolve(cancellability) },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, options: unknown) => {
            opened.push([component, options]);
            return { closed: Promise.resolve(closeWith) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderCancelSection);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.componentRef.setInput('reference', 'LFC-0042');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, opened, el: fixture.nativeElement as HTMLElement };
}

describe('OrderCancelSection', () => {
  // `dialogSide()` lit la largeur au clic : au bureau, ici.
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })));
  afterEach(() => vi.unstubAllGlobals());

  it('montre le bouton et l’échéance quand la commande s’annule', async () => {
    const { el } = await mount({
      cancellable: true,
      until: '2026-10-14T07:00:00.000Z',
      money: { kind: 'nothing_charged' },
      voucherReturned: false,
    });
    expect(el.querySelector('[data-cancel]')?.textContent?.trim()).toBe(FR.action);
    expect(el.querySelector('[data-until]')?.textContent).toContain('14/10');
  });

  it('ouvre la confirmation au clic, et dit « annulée » quand elle ferme sur un succès', async () => {
    const { fixture, opened, el } = await mount(
      { cancellable: true, until: null, money: { kind: 'account' }, voucherReturned: false },
      true,
    );
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    el.querySelector<HTMLButtonElement>('[data-cancel]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(opened.length).toBe(1);
    expect(cancelled).toBe(1);
    expect(el.querySelector('[data-done]')?.textContent).toContain(FR.done);
    expect(el.querySelector('[data-cancel]')).toBeNull();
  });

  it('cache le bouton et dit pourquoi, avec la boutique, pour une commande en préparation', async () => {
    const { el } = await mount({ cancellable: false, code: 'in_preparation', until: null });
    expect(el.querySelector('[data-cancel]')).toBeNull();
    expect(el.querySelector('[data-refusal]')?.textContent).toContain(FR.refusals.in_preparation);
    expect(el.querySelector('[data-contact]')).not.toBeNull();
  });

  it('dit jusqu’à quand c’était possible, pour « trop tard »', async () => {
    const { el } = await mount({
      cancellable: false,
      code: 'too_late',
      until: '2026-10-14T07:00:00.000Z',
    });
    expect(el.querySelector('[data-refusal]')?.textContent).toContain('14/10');
  });

  it('se tait sur une commande déjà annulée : l’état le dit déjà', async () => {
    const { el } = await mount({ cancellable: false, code: 'already_cancelled', until: null });
    expect(el.querySelector('[data-cancel]')).toBeNull();
    expect(el.querySelector('[data-refusal]')).toBeNull();
  });

  it('dit l’échec de lecture sans cacher le tiroir, et propose de relire', async () => {
    const { el } = await mount(null);
    expect(el.querySelector('[data-failed]')?.textContent).toContain(FR.loadFailed);
  });
});
