import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientCart } from '../../../cart/client-cart.service';
import { FR } from '../../../copy/fr';
import { provideHttpClient } from '@angular/common/http';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { ShelfGrid } from './shelf-grid';

describe('ShelfGrid', () => {
  let fixture: ComponentFixture<ShelfGrid>;
  let cart: ClientCart;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const tiles = (): HTMLElement[] => Array.from(el().querySelectorAll('app-product-tile'));

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ShelfGrid], providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    cart = TestBed.inject(ClientCart);
    cart.clear();
    fixture = TestBed.createComponent(ShelfGrid);
    fixture.componentRef.setInput('products', TEST_ITEMS.slice(0, 3));
    fixture.detectChanges();
  });

  it('pose une pièce par référence', () => {
    expect(tiles()).toHaveLength(3);
    expect(el().querySelector('.none')).toBeNull();
  });

  /**
   * Une vitrine vide ne reste pas vide : elle dit quoi essayer. C'est le seul
   * moment où la grille écrit du texte elle-même.
   */
  it('sans référence, dit quoi essayer plutôt que de rester blanche', () => {
    fixture.componentRef.setInput('products', []);
    fixture.detectChanges();

    expect(tiles()).toHaveLength(0);
    expect(el().textContent).toContain(FR.shop.emptyTitle);
    expect(el().textContent).toContain(FR.shop.emptyHint);
  });

  /**
   * Ajouter est un geste de la VITRINE : la quantité s'affiche sur la pièce, à
   * côté du bouton qui la change. Le faire remonter à la page pour qu'elle le
   * redescende n'aurait ajouté que deux relais.
   */
  it('ajoute au panier sans passer par la page', () => {
    const first = TEST_ITEMS[0];
    // Le geste rapide de la première pièce — la pastille qui porte la quantité.
    tiles()[0]?.querySelector<HTMLButtonElement>('.quick')?.click();
    fixture.detectChanges();

    expect(cart.quantityOf(first?.sku ?? '')).toBe(1);
    // Et la pièce le montre : la pastille affiche ce qu'on vient d'y mettre.
    expect(tiles()[0]?.querySelector('.quick')?.textContent?.trim()).toBe('1');
  });

  /** La fiche, elle, est un état de l'ÉCRAN — la grille ne fait que le signaler. */
  it('signale la pièce dont on veut la fiche, sans l’ouvrir', () => {
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));

    tiles()[1]?.querySelector<HTMLButtonElement>('.photo')?.click();

    expect(opened).toEqual([TEST_ITEMS[1]?.sku]);
    // Elle ne pose aucune feuille : ce n'est pas son état.
    expect(el().querySelector('app-product-sheet')).toBeNull();
  });
});
