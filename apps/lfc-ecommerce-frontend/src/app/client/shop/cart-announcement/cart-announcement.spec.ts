import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { ClientCart } from '../../cart/client-cart.service';
import { CartAnnouncer } from '../cart-announcer.service';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import { CartAnnouncement } from './cart-announcement';

describe('CartAnnouncement', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartAnnouncement],
      providers: [provideHttpClient()],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ClientCart).clear();
  });

  /**
   * La région est POLIE et vide au départ : une région qui naît avec son texte
   * n'est pas annoncée, et une région vide ne dit rien.
   */
  it('est une région d’état, vide tant que personne n’a rien ajouté', () => {
    const fixture = TestBed.createComponent(CartAnnouncement);
    fixture.detectChanges();
    const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');

    expect(status).not.toBeNull();
    expect(status?.textContent?.trim()).toBe('');
  });

  it('dit la quantité de l’article, puis sa sortie du panier', () => {
    const fixture = TestBed.createComponent(CartAnnouncement);
    fixture.detectChanges();
    const item = TEST_ITEMS[0];
    const sku = item?.sku ?? '';
    const cart = TestBed.inject(ClientCart);
    const announcer = TestBed.inject(CartAnnouncer);
    const said = (): string =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role="status"]')
        ?.textContent?.trim() ?? '';

    cart.add(sku);
    announcer.announce(sku);
    fixture.detectChanges();
    expect(said()).toBe(`${item?.name} : 1 au panier`);

    cart.remove(sku);
    announcer.announce(sku);
    fixture.detectChanges();
    expect(said()).toBe(`${item?.name} retiré du panier`);
  });

  /** Un article que le catalogue ne connaît pas n'a pas de nom à dire : rien ne change. */
  it('se tait sur une référence inconnue', () => {
    const announcer = TestBed.inject(CartAnnouncer);
    announcer.announce('inconnue');
    expect(announcer.message()).toBe('');
  });
});
