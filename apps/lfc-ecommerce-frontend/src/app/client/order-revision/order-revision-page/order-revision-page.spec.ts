import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type {
  CardComplementPaymentView,
  CustomerOrderDetailView,
  OrderRevisionQuoteView,
  AudiencePickupAddressView,
} from '@lfd/contracts';
import { ORDER_TOTAL_CHANGED } from '@lfd/contracts/shop-values';
import { By } from '@angular/platform-browser';
import { FoldNumberInputComponent } from 'fold-ng';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { LIVE_PICKUP } from '../../mes-commandes/order-view.fixture';
import { ChangeRequestCard } from '../change-request-card/change-request-card';
import { OrderDoors } from '../../shop/order-doors';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { StripeLoader } from '../../stripe-loader.service';
import { CardComplementPayment } from '../card-complement-payment/card-complement-payment';
import {
  CARD_INCREASE_JUST_PAID,
  CARD_INCREASE_PENDING,
  CARD_INCREASE_PROVIDER_UNAVAILABLE,
  OrderRevisionGateway,
  type RevisionOutcome,
  STALE_CHANGE_REQUEST,
  STALE_REVISION,
} from '../order-revision.gateway';
import { OrderRevisionPage } from './order-revision-page';

const LABO: AudiencePickupAddressView = {
  id: 'pa_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  discount: null,
  gps: null,
  opening: { proPickup: null, publicOpening: null },
};

function quoteOf(changes: OrderRevisionQuoteView['changes']): OrderRevisionQuoteView {
  return {
    revision: 3,
    lines: [
      {
        sku: 'VIE-001',
        productName: 'Croissant',
        quantity: 2,
        saleUnit: 'piece',
        unitPriceMillicents: 56_850,
        vatRate: 5.5,
        lineTotalCents: 1_137,
        priceFrozen: true,
        refusal: null,
      },
    ],
    subtotalCents: 1_137,
    discountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    voucherDiscountCents: 0,
    vatCents: 63,
    totalCents: 1_200,
    previousTotalCents: 1_200,
    differenceCents: 0,
    changes,
    discountRefusals: [],
    settlement: { kind: 'as_placed' },
  };
}

/** La commande telle que `GET /orders/:id` la rend : modifiable, en révision 3. */
const REVISABLE: CustomerOrderDetailView = {
  ...LIVE_PICKUP,
  cancellability: { cancellable: false, code: 'too_late', until: null },
  revisability: { revisable: true, until: null },
  revision: 3,
};

/** L'heure limite passée, pas encore au plan : on DEMANDE (M4). */
const TOO_LATE: CustomerOrderDetailView = {
  ...REVISABLE,
  revisability: { revisable: false, code: 'too_late', until: null },
};

/** Payée par carte : seule une hausse se fait, par un complément (plan S2). */
const CARD_PAID: CustomerOrderDetailView = {
  ...REVISABLE,
  revisability: { revisable: true, until: null, cardIncreaseOnly: true },
};

const COMPLEMENT: CardComplementPaymentView = {
  proposalId: 'prop_1',
  complementCents: 600,
  clientSecret: 'pi_1_secret',
  publishableKey: 'pk_test',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
};

/** Un devis de hausse carte : 12 € → 18 €, 6 € à payer. */
const INCREASE: OrderRevisionQuoteView = {
  ...quoteOf(['lines']),
  totalCents: 1_800,
  differenceCents: 600,
  settlement: { kind: 'card_complement', complementCents: 600 },
};

interface Doubles {
  readonly order?: CustomerOrderDetailView | null;
  readonly quote?: (payload: {
    lines: readonly { quantity: number }[];
  }) => RevisionOutcome<OrderRevisionQuoteView>;
  readonly revise?: RevisionOutcome<{
    id: string;
    revision: number;
    totalCents: number;
    previousTotalCents: number;
  }>;
  readonly requestChange?: RevisionOutcome<{ id: string }>;
  readonly changeQuote?: RevisionOutcome<OrderRevisionQuoteView>;
  readonly proposeCardIncrease?: RevisionOutcome<CardComplementPaymentView>;
  readonly complement?: CardComplementPaymentView | null;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 350));

async function mount(doubles: Doubles = {}) {
  const gateway = {
    order: vi.fn(() => Promise.resolve(doubles.order === undefined ? REVISABLE : doubles.order)),
    requestChange: vi.fn(() =>
      Promise.resolve(doubles.requestChange ?? { kind: 'ok' as const, value: { id: 'cr_1' } }),
    ),
    changeQuote: vi.fn(() =>
      Promise.resolve(doubles.changeQuote ?? { kind: 'ok' as const, value: quoteOf(['lines']) }),
    ),
    quote: vi.fn((_id: string, payload: { lines: readonly { quantity: number }[] }) =>
      Promise.resolve(doubles.quote?.(payload) ?? { kind: 'ok' as const, value: quoteOf([]) }),
    ),
    proposeCardIncrease: vi.fn(() =>
      Promise.resolve(doubles.proposeCardIncrease ?? { kind: 'ok' as const, value: COMPLEMENT }),
    ),
    complement: vi.fn(() => Promise.resolve(doubles.complement ?? null)),
    abandonComplement: vi.fn(() => Promise.resolve({ kind: 'ok' as const, value: null })),
    revise: vi.fn(() =>
      Promise.resolve(
        doubles.revise ?? {
          kind: 'ok' as const,
          value: { id: 'ord_9', revision: 4, totalCents: 1_800, previousTotalCents: 1_200 },
        },
      ),
    ),
  };
  const success = vi.fn();
  const info = vi.fn();
  TestBed.configureTestingModule({
    imports: [OrderRevisionPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'ord_9' })) } },
      { provide: OrderRevisionGateway, useValue: gateway },
      {
        provide: ServicePoints,
        useValue: { hydrate: () => Promise.resolve(), pickups: signal([LABO]) },
      },
      {
        provide: ShopCatalogue,
        useValue: {
          hydrate: () => Promise.resolve(),
          items: signal([{ sku: 'PAIN-1', name: 'Baguette' }]),
        },
      },
      { provide: OrderDoors, useValue: { askChoice: vi.fn(), askTime: vi.fn() } },
      { provide: NotifyService, useValue: { success, info } },
      {
        provide: StripeLoader,
        useValue: {
          load: () =>
            Promise.resolve({
              elements: () => ({ create: () => ({ mount: () => undefined }) }),
              confirmPayment: () => Promise.resolve({ paymentIntent: { status: 'succeeded' } }),
            }),
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture: ComponentFixture<OrderRevisionPage> = TestBed.createComponent(OrderRevisionPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await settle();
  fixture.detectChanges();
  return { fixture, gateway, navigate, success, info, el: fixture.nativeElement as HTMLElement };
}

describe('OrderRevisionPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('part de la commande, la chiffre, et ne laisse rien valider tant que rien ne change', async () => {
    const { el, gateway } = await mount();
    expect(gateway.quote).toHaveBeenCalledWith(
      'ord_9',
      expect.objectContaining({
        pickupAddressId: 'pa_labo',
        lines: [{ sku: 'VIE-001', quantity: 2 }],
      }),
    );
    expect(el.querySelectorAll('[data-line]')).toHaveLength(1);
    expect(el.querySelector('[data-unchanged]')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
  });

  it('valide avec la révision du devis, puis rouvre la commande', async () => {
    const { fixture, el, gateway, navigate, success } = await mount({
      quote: (payload) => ({
        kind: 'ok',
        value: quoteOf(payload.lines[0]?.quantity === 3 ? ['lines'] : []),
      }),
    });
    const input = fixture.debugElement.query(By.directive(FoldNumberInputComponent));
    (input.componentInstance as FoldNumberInputComponent).value.set(3);
    await settle();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();
    expect(gateway.revise).toHaveBeenCalledWith(
      'ord_9',
      expect.objectContaining({
        expectedRevision: 3,
        expectedTotalCents: 1_200,
        lines: [{ sku: 'VIE-001', quantity: 3 }],
      }),
    );
    expect(success).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/mes-commandes', 'ord_9']);
  });

  it('dit à côté de la ligne le prix qui changerait, et bloque la validation', async () => {
    const base = quoteOf(['lines']);
    const line = base.lines[0];
    if (line === undefined) {
      throw new Error('fixture sans ligne');
    }
    const refused: OrderRevisionQuoteView = {
      ...base,
      lines: [
        {
          ...line,
          refusal: {
            kind: 'price_changed',
            frozen: { unitPriceMillicents: 85_300, vatRate: 5.5, unitPriceTtcCents: 90 },
            current: { unitPriceMillicents: 113_740, vatRate: 5.5, unitPriceTtcCents: 120 },
          },
        },
      ],
      discountRefusals: [
        {
          kind: 'below_threshold',
          label: { fr: 'Six achetés', en: 'Six bought', it: 'Sei comprati' },
          minQuantity: 6,
          sku: 'VIE-001',
          quantity: 2,
        },
      ],
    };
    const { el } = await mount({ quote: () => ({ kind: 'ok', value: refused }) });
    const said = [...el.querySelectorAll('[data-line] [data-line-refusal]')].map(
      (node) => node.textContent ?? '',
    );
    expect(said[0]).toContain('0,90 € → 1,20 €');
    expect(said[1]).toContain('Six achetés (dès 6)');
    expect(el.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
  });

  it('dit la commande modifiée ailleurs et propose de recharger', async () => {
    const { fixture, el } = await mount({
      quote: () => ({ kind: 'ok', value: quoteOf(['lines']) }),
      revise: {
        kind: 'refused',
        refusal: {
          code: STALE_REVISION,
          message: 'La commande a été modifiée ailleurs entre-temps.',
        },
      },
    });
    el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-submit-refused]')?.textContent).toContain('modifiée ailleurs');
    expect(el.querySelector('[data-reload]')).not.toBeNull();
  });

  it('envoie le total du devis affiché ; refusé, relit le devis, dit le nouveau total et laisse revalider', async () => {
    let calls = 0;
    const { fixture, el, gateway } = await mount({
      quote: () => {
        calls += 1;
        // Le devis affiché au clic dit 12 € ;
        // celui relu après le refus dit 13,50 €.
        return {
          kind: 'ok',
          value: { ...quoteOf(['lines']), totalCents: calls <= 1 ? 1_200 : 1_350 },
        };
      },
      revise: {
        kind: 'refused',
        refusal: { code: ORDER_TOTAL_CHANGED, message: 'Le total a changé.' },
      },
    });
    el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();
    expect(gateway.revise).toHaveBeenCalledWith(
      'ord_9',
      expect.objectContaining({ expectedTotalCents: 1_200 }),
    );
    await settle();
    fixture.detectChanges();
    expect(gateway.quote).toHaveBeenCalledTimes(2);
    const said = el.querySelector('[data-total-changed]')?.textContent ?? '';
    expect(said).toContain('12,00');
    expect(said).toContain('13,50');
    expect(el.querySelector('[data-submit-refused]')).toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(false);
    el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    await fixture.whenStable();
    expect(gateway.revise).toHaveBeenLastCalledWith(
      'ord_9',
      expect.objectContaining({ expectedTotalCents: 1_350 }),
    );
  });

  it('dit le refus du devis par la phrase du serveur', async () => {
    const { el } = await mount({
      quote: () => ({
        kind: 'refused',
        refusal: {
          code: 'orders.revise.card_settled',
          message:
            'Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.',
        },
      }),
    });
    expect(el.querySelector('[data-quote-refused]')?.textContent).toContain('réglée par carte');
    expect(el.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
  });

  it('l’heure limite passée : un devis INDICATIF, « Demander cette modification » une fois quelque chose changé', async () => {
    const { fixture, el, gateway, navigate, success } = await mount({ order: TOO_LATE });
    // Décision de Hugo (2026-10-23) : le client voit le nouveau total de sa demande.
    expect(gateway.quote).not.toHaveBeenCalled();
    expect(gateway.changeQuote).toHaveBeenCalledWith('ord_9', expect.objectContaining({}));
    expect(el.querySelector('[data-total]')).not.toBeNull();
    expect(el.querySelector('[data-quote-indicative]')?.textContent).toContain('sous réserve');
    expect(el.querySelector('[data-request-explained]')).not.toBeNull();
    expect(el.querySelector('[data-submit]')).toBeNull();
    const submit = () => el.querySelector<HTMLButtonElement>('[data-request-submit]');
    expect(submit()?.disabled).toBe(true);

    const input = fixture.debugElement.query(By.directive(FoldNumberInputComponent));
    (input.componentInstance as FoldNumberInputComponent).value.set(3);
    await settle();
    fixture.detectChanges();
    expect(gateway.quote).not.toHaveBeenCalled();
    submit()?.click();
    await fixture.whenStable();

    expect(gateway.requestChange).toHaveBeenCalledWith(
      'ord_9',
      expect.objectContaining({
        change: expect.objectContaining({
          expectedRevision: 3,
          lines: [{ sku: 'VIE-001', quantity: 3 }],
        }),
        message: '',
      }),
    );
    expect(success).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/mes-commandes', 'ord_9']);
  });

  it('l’heure limite passée : le refus du devis de la demande se dit par la phrase du serveur', async () => {
    const { el } = await mount({
      order: TOO_LATE,
      changeQuote: {
        kind: 'refused',
        refusal: { code: 'orders.revise.card_settled', message: 'Commande réglée par carte.' },
      },
    });
    expect(el.querySelector('[data-quote-refused]')?.textContent).toContain('réglée par carte');
    expect(el.querySelector('[data-quote-indicative]')).toBeNull();
  });

  it('une demande composée sur une commande changée depuis : la phrase, et recharger', async () => {
    const { fixture, el } = await mount({
      order: TOO_LATE,
      requestChange: {
        kind: 'refused',
        refusal: { code: STALE_CHANGE_REQUEST, message: 'La commande a été modifiée entre-temps.' },
      },
    });
    expect(fixture.debugElement.query(By.directive(ChangeRequestCard))).not.toBeNull();
    const input = fixture.debugElement.query(By.directive(FoldNumberInputComponent));
    (input.componentInstance as FoldNumberInputComponent).value.set(3);
    await settle();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-request-submit]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-request-refused]')?.textContent).toContain('entre-temps');
    expect(el.querySelector('[data-reload]')).not.toBeNull();
  });

  describe('commande payée par carte (plan S2)', () => {
    it('le devis d’une hausse annonce le complément, et « Valider » dit le montant', async () => {
      const { el } = await mount({
        order: CARD_PAID,
        quote: () => ({ kind: 'ok', value: INCREASE }),
      });
      expect(el.querySelector('[data-settlement]')?.textContent).toContain(
        '6,00 € à payer pour valider la modification',
      );
      const submit = el.querySelector<HTMLButtonElement>('[data-submit]');
      expect(submit?.disabled).toBe(false);
      expect(submit?.textContent).toContain('Valider et payer 6,00');
    });

    it.each(['decrease', 'same_total'] as const)(
      'une %s : « pas encore possible », et rien ne se valide',
      async (reason) => {
        const { el } = await mount({
          order: CARD_PAID,
          quote: () => ({
            kind: 'ok',
            value: { ...quoteOf(['lines']), settlement: { kind: 'card_not_revisable', reason } },
          }),
        });
        expect(el.querySelector('[data-settlement]')?.textContent).toContain('Pas encore possible');
        expect(el.querySelector<HTMLButtonElement>('[data-submit]')?.disabled).toBe(true);
      },
    );

    it('« Valider » demande la hausse, monte le formulaire, puis rouvre la commande appliquée', async () => {
      const { fixture, el, gateway, navigate, success } = await mount({
        order: CARD_PAID,
        quote: () => ({ kind: 'ok', value: INCREASE }),
      });
      el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(gateway.revise).not.toHaveBeenCalled();
      expect(gateway.proposeCardIncrease).toHaveBeenCalledWith(
        'ord_9',
        expect.objectContaining({ expectedRevision: 3, expectedTotalCents: 1_800 }),
      );
      const payment = fixture.debugElement.query(By.directive(CardComplementPayment));
      expect(payment).not.toBeNull();
      expect(el.querySelector('[data-line]')).toBeNull();
      (payment.componentInstance as CardComplementPayment).applied.emit();
      expect(success).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/mes-commandes', 'ord_9']);
    });

    it('au rechargement, un complément vivant reprend son formulaire', async () => {
      const { fixture, gateway } = await mount({ order: CARD_PAID, complement: COMPLEMENT });
      expect(gateway.complement).toHaveBeenCalledWith('ord_9');
      expect(fixture.debugElement.query(By.directive(CardComplementPayment))).not.toBeNull();
    });

    it('une commande qui ne se règle pas par carte ne cherche aucun complément', async () => {
      const { gateway } = await mount();
      expect(gateway.complement).not.toHaveBeenCalled();
    });

    it('abandonné : la commande se relit, telle qu’elle était', async () => {
      const { fixture, gateway, info } = await mount({ order: CARD_PAID, complement: COMPLEMENT });
      const payment = fixture.debugElement.query(By.directive(CardComplementPayment));
      (payment.componentInstance as CardComplementPayment).abandoned.emit();
      await fixture.whenStable();
      expect(info).toHaveBeenCalled();
      expect(gateway.order).toHaveBeenCalledTimes(2);
    });

    it.each([
      [CARD_INCREASE_PENDING, 'attend déjà', true],
      [CARD_INCREASE_JUST_PAID, 'vient d’être payé', true],
      [CARD_INCREASE_PROVIDER_UNAVAILABLE, 'ne répond pas', false],
    ])('le refus %s se dit dans la langue du client', async (code, said, reload) => {
      const { fixture, el } = await mount({
        order: CARD_PAID,
        quote: () => ({ kind: 'ok', value: INCREASE }),
        proposeCardIncrease: { kind: 'refused', refusal: { code, message: 'server' } },
      });
      el.querySelector<HTMLButtonElement>('[data-submit]')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.querySelector('[data-submit-refused]')?.textContent).toContain(said);
      expect(el.querySelector('[data-reload]') !== null).toBe(reload);
      expect(fixture.debugElement.query(By.directive(CardComplementPayment))).toBeNull();
    });
  });

  it('dit l’échec de lecture de la commande', async () => {
    const { el } = await mount({ order: null });
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
  });
});
