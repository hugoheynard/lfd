import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { GuestOrderCancellationView } from '@lfd/contracts/shop-values';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import type { CancelOutcome, CancelReason, GuestLink } from '../cancellation-wording';
import { type GuestViewResult, OrderCancellationGateway } from '../order-cancellation.gateway';
import { GuestCancelPage } from './guest-cancel-page';

const FR = orderCancelCopy('fr');

const VIEW: GuestOrderCancellationView = {
  orderNumber: 'LFC-0042',
  firstName: 'Léa',
  requestedFor: '2026-10-20',
  fulfillment: { method: 'pickup', pickupLabel: 'Le Village' },
  lines: [{ name: 'Croissant', quantity: 6, saleUnit: 'piece' }],
  totalCents: 780,
  status: 'placed',
  cancellability: {
    cancellable: true,
    until: null,
    money: { kind: 'refund', amountCents: 780 },
    voucherReturned: false,
  },
};

interface Mounted {
  readonly fixture: ComponentFixture<GuestCancelPage>;
  readonly el: HTMLElement;
  readonly viewed: GuestLink[];
  readonly confirmed: [GuestLink, CancelReason][];
}

async function mount(
  fragment: string | null,
  views: GuestViewResult[],
  outcome: CancelOutcome = { kind: 'done' },
): Promise<Mounted> {
  const viewed: GuestLink[] = [];
  const confirmed: [GuestLink, CancelReason][] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [GuestCancelPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
      { provide: AuthFacade, useValue: { isAuthenticated: signal(false) } },
      { provide: FoldPanelHostService, useValue: { open: () => ({ closed: Promise.resolve() }) } },
      {
        provide: OrderCancellationGateway,
        useValue: {
          guestView: (link: GuestLink) => {
            viewed.push(link);
            const next = views.length > 1 ? views.shift() : views[0];
            return Promise.resolve(next ?? { kind: 'failed' });
          },
          guestConfirm: (link: GuestLink, reason: CancelReason) => {
            confirmed.push([link, reason]);
            return Promise.resolve(outcome);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(GuestCancelPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, viewed, confirmed };
}

describe('GuestCancelPage', () => {
  it('lit le FRAGMENT et l’envoie dans le corps — sans rien annuler au chargement', async () => {
    const { el, viewed, confirmed } = await mount('01JORDER.jeton-secret', [
      { kind: 'ready', view: VIEW },
    ]);
    expect(viewed).toEqual([{ orderId: '01JORDER', token: 'jeton-secret' }]);
    expect(confirmed).toEqual([]);
    expect(el.textContent).toContain('LFC-0042');
    expect(el.textContent).toContain('Croissant');
    expect(el.querySelector('[data-money]')?.textContent).toContain('7,80');
  });

  /** P5 (`vente-au-poids.md`) : « × 1250 » se lisait en pièces. */
  it('dit une ligne au poids en grammes ou en kilos', async () => {
    const weighed = {
      ...VIEW,
      lines: [{ name: 'Gravlax', quantity: 1_250, saleUnit: 'weight' as const }],
    };
    const { el } = await mount('01JORDER.jeton', [{ kind: 'ready', view: weighed }]);
    expect(el.textContent).toContain('× 1,25 kg');
  });

  it('dit « lien introuvable » sur un 404, sans rien de la commande', async () => {
    const { el } = await mount('01JORDER.faux', [{ kind: 'not_found' }]);
    expect(el.querySelector('[data-not-found]')).not.toBeNull();
    expect(el.textContent).toContain(FR.linkNotFoundTitle);
    expect(el.textContent).not.toContain('LFC-0042');
  });

  it('ne demande rien au serveur sans fragment lisible', async () => {
    const { el, viewed } = await mount(null, [{ kind: 'ready', view: VIEW }]);
    expect(viewed).toEqual([]);
    expect(el.querySelector('[data-not-found]')).not.toBeNull();
  });

  it('dit pourquoi une commande ne s’annule plus, et propose la boutique', async () => {
    const { el } = await mount('01JORDER.jeton', [
      {
        kind: 'ready',
        view: { ...VIEW, cancellability: { cancellable: false, code: 'fulfilled', until: null } },
      },
    ]);
    expect(el.querySelector('[data-confirm]')).toBeNull();
    expect(el.querySelector('[data-reason]')?.textContent).toContain(FR.refusals.fulfilled);
  });

  it('annule au clic, puis relit et dit « annulée »', async () => {
    const after: GuestOrderCancellationView = {
      ...VIEW,
      status: 'cancelled',
      cancellability: { cancellable: false, code: 'already_cancelled', until: null },
    };
    const { fixture, el, viewed, confirmed } = await mount('01JORDER.jeton', [
      { kind: 'ready', view: VIEW },
      { kind: 'ready', view: after },
    ]);
    el.querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirmed).toEqual([[{ orderId: '01JORDER', token: 'jeton' }, {}]]);
    expect(viewed.length).toBe(2);
    expect(el.querySelector('[data-done]')?.textContent).toContain(FR.done);
    expect(el.querySelector('[data-reason]')).toBeNull();
  });

  it('affiche un 409 dans la confirmation, et la laisse ouverte', async () => {
    const { fixture, el } = await mount('01JORDER.jeton', [{ kind: 'ready', view: VIEW }], {
      kind: 'refused',
      errorCode: 'orders.customer_cancel.in_preparation',
      message: '',
    });
    el.querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-refusal]')?.textContent).toContain(FR.refusals.in_preparation);
    expect(el.querySelector('[data-confirm]')).not.toBeNull();
  });
});
