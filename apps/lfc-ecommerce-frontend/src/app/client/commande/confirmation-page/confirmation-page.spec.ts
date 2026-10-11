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

/**
 * Hugo, 2026-10-11 : un visiteur n'a pas d'espace — « Mes commandes » ne lui
 * mène nulle part. On lui dit où est son QR, et on l'invite à créer un compte
 * qui reprend sa fiche invité.
 */
describe('ConfirmationPage — un visiteur sans compte', () => {
  function render(
    authenticated: boolean,
    order: PlacedOrder = placed(),
  ): {
    el: HTMLElement;
    signUps: unknown[][];
  } {
    const signUps: unknown[][] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConfirmationPage],
      providers: [
        provideRouter([]),
        { provide: ClientOrders, useValue: { latest: computed(() => order) } },
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: () => authenticated,
            continueWithEmailCode: (...args: unknown[]) => signUps.push(args),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmationPage);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, signUps };
  }

  it('ne lui parle pas de « Mes commandes », mais du courriel et d’un compte', () => {
    const { el } = render(false);

    expect(el.textContent).not.toContain(FR.done.keptLine);
    expect(el.textContent).toContain(FR.done.guestMailTitle);
    expect(el.querySelector('.join')?.textContent).toContain(FR.done.joinTitle);
  });

  it('crée le compte en reprenant la fiche invité', () => {
    localStorage.setItem(
      'lfc.guest.identity',
      JSON.stringify({
        firstName: 'Jean',
        email: 'jean@exemple.fr',
        emailAgain: 'jean@exemple.fr',
        phone: '0612345678',
      }),
    );
    const { el, signUps } = render(false);

    el.querySelector<HTMLButtonElement>('.join button')?.click();

    expect(signUps).toEqual([
      [
        '/mes-commandes',
        'jean@exemple.fr',
        { firstName: 'Jean', email: 'jean@exemple.fr', phone: '0612345678' },
      ],
    ]);
    localStorage.clear();
  });

  it('lui dit combien de points cette commande aurait rapportés avec un compte', () => {
    const { el } = render(false, placed({ loyaltyPointsWithAccount: 1240 }));

    const join = el.querySelector('.join')?.textContent ?? '';
    expect(join).toMatch(/Avec un compte, cette commande vous aurait rapporté 1\s?240 points\./u);
    expect(join).not.toContain(FR.done.joinLine);
  });

  it('garde l’invitation générale quand le nombre manque ou vaut zéro', () => {
    expect(render(false).el.querySelector('.join')?.textContent).toContain(FR.done.joinLine);
    expect(
      render(false, placed({ loyaltyPointsWithAccount: 0 })).el.querySelector('.join')?.textContent,
    ).toContain(FR.done.joinLine);
  });

  it('garde « Mes commandes » pour qui est connecté, sans invitation', () => {
    const { el } = render(true);

    expect(el.textContent).toContain(FR.done.keptLine);
    expect(el.querySelector('.join')).toBeNull();
  });
});
