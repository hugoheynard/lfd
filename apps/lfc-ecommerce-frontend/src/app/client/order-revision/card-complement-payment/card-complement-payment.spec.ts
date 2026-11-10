import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CardComplementPaymentView, CustomerOrderDetailView } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIVE_PICKUP } from '../../mes-commandes/order-view.fixture';
import { StripeLoader } from '../../stripe-loader.service';
import {
  CARD_INCREASE_JUST_PAID,
  CARD_INCREASE_PROVIDER_UNAVAILABLE,
  OrderRevisionGateway,
  type RevisionOutcome,
} from '../order-revision.gateway';
import {
  APPLIED_POLL_LIMIT_MS,
  APPLIED_POLL_MS,
  CardComplementPayment,
} from './card-complement-payment';

/** Ce que Stripe rend à `confirmPayment`, réduit à ce que l'écran en lit. */
type Outcome = { error: { message: string } } | { paymentIntent: { status: string } };

/** Un Stripe doublé — la seule frontière qu'on double, comme la page de règlement. */
function stripeThatAnswers(outcome: Outcome) {
  return {
    load: () =>
      Promise.resolve({
        elements: () => ({ create: () => ({ mount: () => undefined }), update: () => undefined }),
        confirmPayment: () => Promise.resolve(outcome),
      }),
  };
}

const MINUTE_MS = 60_000;

function complementOf(expiresInMs = 10 * MINUTE_MS): CardComplementPaymentView {
  return {
    proposalId: 'prop_1',
    complementCents: 1_200,
    clientSecret: 'pi_1_secret',
    publishableKey: 'pk_test',
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

const orderAt = (revision: number): CustomerOrderDetailView => ({
  ...LIVE_PICKUP,
  cancellability: { cancellable: false, code: 'too_late', until: null },
  revisability: { revisable: true, until: null, cardIncreaseOnly: true },
  revision,
});

interface Doubles {
  readonly outcome?: Outcome;
  readonly revisions?: readonly number[];
  readonly abandon?: RevisionOutcome<null>;
  readonly expiresInMs?: number;
}

async function mount(doubles: Doubles = {}) {
  const revisions = [...(doubles.revisions ?? [4])];
  const gateway = {
    order: vi.fn(() => Promise.resolve(orderAt(revisions.shift() ?? 3))),
    abandonComplement: vi.fn(() =>
      Promise.resolve(doubles.abandon ?? { kind: 'ok' as const, value: null }),
    ),
  };
  TestBed.configureTestingModule({
    imports: [CardComplementPayment],
    providers: [
      { provide: OrderRevisionGateway, useValue: gateway },
      {
        provide: StripeLoader,
        useValue: stripeThatAnswers(doubles.outcome ?? { paymentIntent: { status: 'succeeded' } }),
      },
    ],
  });
  const fixture: ComponentFixture<CardComplementPayment> =
    TestBed.createComponent(CardComplementPayment);
  fixture.componentRef.setInput('orderId', 'ord_9');
  fixture.componentRef.setInput('complement', complementOf(doubles.expiresInMs));
  fixture.componentRef.setInput('baseRevision', 3);
  const applied = vi.fn();
  const abandoned = vi.fn();
  fixture.componentInstance.applied.subscribe(applied);
  fixture.componentInstance.abandoned.subscribe(abandoned);
  fixture.detectChanges();
  await fixture.whenStable();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, gateway, applied, abandoned, el: fixture.nativeElement as HTMLElement };
}

const flush = async (fixture: ComponentFixture<CardComplementPayment>, ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  fixture.detectChanges();
};

describe('CardComplementPayment', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('annonce le complément et le délai restant, et monte le formulaire', async () => {
    const { el } = await mount();
    expect(el.querySelector('[data-complement-lead]')?.textContent).toContain('12,00');
    expect(el.querySelector('[data-remaining]')?.textContent).toMatch(/\d+:\d{2}/);
    expect(el.querySelector<HTMLButtonElement>('[data-pay]')?.disabled).toBe(false);
  });

  it('payé : relit la commande toutes les 2 s jusqu’à voir la révision monter', async () => {
    const { fixture, el, gateway, applied } = await mount({ revisions: [3, 3, 4] });
    vi.useFakeTimers();
    el.querySelector<HTMLButtonElement>('[data-pay]')?.click();
    await flush(fixture, 0);
    expect(el.querySelector('[data-confirming]')).not.toBeNull();
    await flush(fixture, APPLIED_POLL_MS * 2);
    expect(applied).not.toHaveBeenCalled();
    await flush(fixture, APPLIED_POLL_MS);
    expect(gateway.order).toHaveBeenCalledTimes(3);
    expect(applied).toHaveBeenCalledOnce();
  });

  it('au-delà de 30 s sans révision appliquée : « nous finalisons », et l’on cesse de relire', async () => {
    const { fixture, el, gateway, applied } = await mount({ revisions: [] });
    vi.useFakeTimers();
    el.querySelector<HTMLButtonElement>('[data-pay]')?.click();
    await flush(fixture, APPLIED_POLL_LIMIT_MS + APPLIED_POLL_MS);
    expect(el.querySelector('[data-finishing]')?.textContent).toContain('vous recevrez un e-mail');
    const calls = gateway.order.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(APPLIED_POLL_LIMIT_MS / APPLIED_POLL_MS);
    await flush(fixture, APPLIED_POLL_MS * 3);
    expect(gateway.order).toHaveBeenCalledTimes(calls);
    expect(applied).not.toHaveBeenCalled();
  });

  it('une carte refusée : la phrase de Stripe, et le formulaire reste', async () => {
    const { fixture, el } = await mount({ outcome: { error: { message: 'Fonds insuffisants.' } } });
    el.querySelector<HTMLButtonElement>('[data-pay]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-pay-error]')?.textContent).toContain('Fonds insuffisants');
    expect(el.querySelector<HTMLButtonElement>('[data-pay]')?.disabled).toBe(false);
  });

  it('« Annuler la modification » abandonne le complément', async () => {
    const { fixture, el, gateway, abandoned } = await mount();
    el.querySelector<HTMLButtonElement>('[data-cancel-complement]')?.click();
    await fixture.whenStable();
    expect(gateway.abandonComplement).toHaveBeenCalledWith('ord_9');
    expect(abandoned).toHaveBeenCalledOnce();
  });

  it('l’abandon arrive après le paiement : on regarde la modification s’appliquer', async () => {
    const { fixture, el, applied, abandoned } = await mount({
      abandon: { kind: 'refused', refusal: { code: CARD_INCREASE_JUST_PAID, message: 'payé' } },
    });
    vi.useFakeTimers();
    el.querySelector<HTMLButtonElement>('[data-cancel-complement]')?.click();
    await flush(fixture, APPLIED_POLL_MS);
    expect(abandoned).not.toHaveBeenCalled();
    expect(applied).toHaveBeenCalledOnce();
  });

  it('le service de paiement muet : la phrase, et rien n’est abandonné', async () => {
    const { fixture, el, abandoned } = await mount({
      abandon: {
        kind: 'refused',
        refusal: { code: CARD_INCREASE_PROVIDER_UNAVAILABLE, message: '' },
      },
    });
    el.querySelector<HTMLButtonElement>('[data-cancel-complement]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-pay-error]')?.textContent).toContain('ne répond pas');
    expect(abandoned).not.toHaveBeenCalled();
  });

  it('le délai passé ferme le formulaire', async () => {
    const { el } = await mount({ expiresInMs: -1 });
    expect(el.querySelector('[data-expired]')).not.toBeNull();
    expect(el.querySelector('[data-pay]')).toBeNull();
  });
});
