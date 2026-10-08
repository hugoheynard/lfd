import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientOrders, type PlacedOrder } from '../../client-orders.service';
import { FR } from '../../copy/fr';
import { formatCents } from '../../format-money';
import { ConfirmationPage } from './confirmation-page';

/** 10,00 € HT + 0,55 € de TVA = 10,55 € TTC. */
function placed(overrides: Partial<PlacedOrder> = {}): PlacedOrder {
  return {
    id: 'ord_1',
    reference: 'CMD-0001',
    service: {
      mode: 'pickup',
      pickupAddressId: null,
      place: 'Le Labo',
      at: 'au Labo',
      address: '',
      slot: '7 h – 8 h',
      window: null,
      date: '2026-10-10',
    },
    lines: [],
    pieces: 3,
    totals: {
      lines: [],
      subtotalHtCents: 1000,
      discountCents: 0,
      discountAdjustment: null,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      deliveryVatMode: 'standard',
      vat: [{ rate: 5.5, amountCents: 55 }],
      totalCents: 1055,
    },
    settlement: 'not_required',
    ...overrides,
  };
}

/**
 * F5 (plan `bons-et-facture-concordants`) : un pro au compte ne lit que le HT ;
 * la TVA et le TTC sont sur la facture du mois. Les autres régimes ne changent pas.
 */
describe('ConfirmationPage — le récapitulatif selon le régime', () => {
  let fixture: ComponentFixture<ConfirmationPage>;

  function render(order: PlacedOrder): HTMLElement {
    const latest = signal<PlacedOrder | null>(order);
    TestBed.configureTestingModule({
      imports: [ConfirmationPage],
      providers: [
        provideRouter([]),
        { provide: ClientOrders, useValue: { latest: computed(() => latest()) } },
        { provide: AuthFacade, useValue: { isAuthenticated: () => true } },
      ],
    });
    fixture = TestBed.createComponent(ConfirmationPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const paid = (el: HTMLElement): string =>
    el.querySelector('.row.paid')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

  it('au compte : le total HT et la mention, sans ligne de TVA', () => {
    const el = render(placed({ onAccount: true }));

    expect(paid(el)).toContain(FR.done.onAccountPretax);
    expect(paid(el)).toContain(formatCents(1000));
    expect(el.querySelector('.pretax-note')?.textContent?.trim()).toBe(FR.cart.pretaxNote);
    expect(el.querySelectorAll('.row.vat')).toHaveLength(0);
    expect(el.textContent).not.toContain(formatCents(1055));
  });

  it('une commande d’avant F5, sans le drapeau, garde son TTC', () => {
    const el = render(placed());

    expect(paid(el)).toContain(formatCents(1055));
    expect(el.querySelectorAll('.row.vat')).toHaveLength(1);
    expect(el.querySelector('.pretax-note')).toBeNull();
  });

  it.each(['paid', 'due'] as const)('%s : TVA et total TTC inchangés', (settlement) => {
    const el = render(placed({ settlement, onAccount: false }));

    expect(paid(el)).toContain(formatCents(1055));
    expect(el.querySelectorAll('.row.vat')).toHaveLength(1);
    expect(el.querySelector('.pretax-note')).toBeNull();
  });
});
