import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { ClientCart } from '../client-cart.service';
import { FR } from '../../copy/fr';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { CartBannerCard } from './cart-banner-card';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  date: '2026-09-07',
};

describe('CartBannerCard', () => {
  let fixture: ComponentFixture<CartBannerCard>;
  let cart: ClientCart;
  let order: OrderContextStore;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string =>
    el().querySelector(selector)?.textContent?.trim() ?? '';

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartBannerCard],
      providers: [provideHttpClient()],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    cart = TestBed.inject(ClientCart);
    cart.clear();
    order = TestBed.inject(OrderContextStore);
    fixture = TestBed.createComponent(CartBannerCard);
    fixture.detectChanges();
  });

  /**
   * 🔴 Le `null` du service est un état de plein droit : on visite d'abord, on
   * choisit ensuite. La carte DEMANDE alors au lieu de rappeler.
   */
  it('demande le service tant qu’aucun n’est pris', () => {
    order.choice.set(null);
    fixture.detectChanges();

    expect(text('.ask-title')).toBe(FR.shop.pickService);
    expect(el().querySelector('.service')).toBeNull();
  });

  it('rappelle le lieu et le créneau dès qu’un service est pris', () => {
    order.choice.set(AU_LABO);
    fixture.detectChanges();

    expect(text('.where')).toBe('Le Labo · 7 h – 8 h');
    expect(text('.badge')).toBe(FR.cart.pickupGroup);
    expect(el().querySelector('.ask')).toBeNull();
  });

  it('porte le compte de pièces et le total TTC', () => {
    order.choice.set(AU_LABO);
    cart.add('VIE-001');
    cart.add('VIE-001');
    fixture.detectChanges();

    expect(text('.pieces')).toBe('2 pièces au panier');
    expect(text('.total')).not.toBe('');
  });

  /** Rien à régler tant que rien n'est pris : les gestes n'existent pas. */
  it('ne montre aucun règlement sur un panier vide', () => {
    order.choice.set(AU_LABO);
    fixture.detectChanges();

    expect(el().querySelector('.actions')).toBeNull();
  });

  it('remonte l’ouverture du tiroir, le changement de service et le règlement', () => {
    order.choice.set(AU_LABO);
    cart.add('VIE-001');
    fixture.detectChanges();
    const seen: string[] = [];
    fixture.componentInstance.opened.subscribe(() => seen.push('tiroir'));
    fixture.componentInstance.serviceRequested.subscribe(() => seen.push('service'));
    fixture.componentInstance.paid.subscribe(() => seen.push('régler'));

    el().querySelector<HTMLButtonElement>('.sum')?.click();
    el().querySelector<HTMLButtonElement>('.change')?.click();
    el().querySelector<HTMLButtonElement>('.pay')?.click();

    expect(seen).toEqual(['tiroir', 'service', 'régler']);
  });

  /**
   * ⚠️ Le règlement au compte attend la condition de règlement, qui vit sur
   * l'entreprise et n'atteint pas cet écran. Le bouton le DIT plutôt que de
   * rester grisé sans expliquer pourquoi.
   */
  it('reconnaît que le règlement au compte n’est pas branché', () => {
    order.choice.set(AU_LABO);
    cart.add('VIE-001');
    fixture.detectChanges();
    expect(el().querySelector('.soon')).toBeNull();

    el().querySelector<HTMLButtonElement>('.account')?.click();
    fixture.detectChanges();

    expect(text('.soon')).toBe(FR.cart.accountSoon);
  });
});
