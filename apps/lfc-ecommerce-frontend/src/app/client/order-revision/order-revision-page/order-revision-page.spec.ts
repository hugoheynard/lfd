import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { OrderRevisionQuoteView, PickupAddressView } from '@lfd/contracts';
import { By } from '@angular/platform-browser';
import { FoldNumberInputComponent } from 'fold-ng';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { LIVE_PICKUP } from '../../mes-commandes/order-view.fixture';
import { OrderDoors } from '../../shop/order-doors';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import {
  OrderRevisionGateway,
  type RevisionOutcome,
  STALE_REVISION,
} from '../order-revision.gateway';
import { OrderRevisionPage } from './order-revision-page';

const LABO: PickupAddressView = {
  id: 'pa_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  discounts: { b2b: null, b2c: null },
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
        unitPriceMillicents: 56_850,
        vatRate: 5.5,
        lineTotalCents: 1_137,
        priceFrozen: true,
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
  };
}

interface Doubles {
  readonly order?: typeof LIVE_PICKUP | null;
  readonly quote?: (payload: {
    lines: readonly { quantity: number }[];
  }) => RevisionOutcome<OrderRevisionQuoteView>;
  readonly revise?: RevisionOutcome<{
    id: string;
    revision: number;
    totalCents: number;
    previousTotalCents: number;
  }>;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 350));

async function mount(doubles: Doubles = {}) {
  const gateway = {
    order: vi.fn(() => Promise.resolve(doubles.order === undefined ? LIVE_PICKUP : doubles.order)),
    quote: vi.fn((_id: string, payload: { lines: readonly { quantity: number }[] }) =>
      Promise.resolve(doubles.quote?.(payload) ?? { kind: 'ok' as const, value: quoteOf([]) }),
    ),
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
      { provide: NotifyService, useValue: { success } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture: ComponentFixture<OrderRevisionPage> = TestBed.createComponent(OrderRevisionPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await settle();
  fixture.detectChanges();
  return { fixture, gateway, navigate, success, el: fixture.nativeElement as HTMLElement };
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
      expect.objectContaining({ expectedRevision: 3, lines: [{ sku: 'VIE-001', quantity: 3 }] }),
    );
    expect(success).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/mes-commandes', 'ord_9']);
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

  it('dit l’échec de lecture de la commande', async () => {
    const { el } = await mount({ order: null });
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
  });
});
