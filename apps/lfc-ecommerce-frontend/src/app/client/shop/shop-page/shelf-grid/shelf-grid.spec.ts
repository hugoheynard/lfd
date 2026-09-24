import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientCart } from '../../../cart/client-cart.service';
import { FR } from '../../../copy/fr';
import { provideHttpClient } from '@angular/common/http';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { NOEL, productContent, storefrontObject } from '../../storefront/storefront.fixture';
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

  describe('la vitrine composée', () => {
    const slots = (): HTMLElement[] =>
      Array.from(el().querySelectorAll<HTMLElement>('app-storefront-slot'));
    const fillTiles = (): HTMLElement[] =>
      Array.from(el().querySelectorAll<HTMLElement>('.board > app-product-tile'));
    const nameOf = (tile: HTMLElement): string | undefined =>
      tile.querySelector('.name')?.textContent?.trim();

    beforeEach(() => {
      fixture.componentRef.setInput('products', TEST_ITEMS);
      fixture.detectChanges();
    });

    it('sans page, le rayon d’aujourd’hui : le best-seller est celui du catalogue', () => {
      expect(el().querySelector('.board')).toBeNull();
      expect(el().classList.contains('composed')).toBe(false);
      const featured = el().querySelectorAll('app-product-tile.featured');
      expect(featured).toHaveLength(TEST_ITEMS.filter((item) => item.isFeatured).length);
    });

    /** « Une page vide EST le rayon d'aujourd'hui » — best-seller compris. */
    it('une page sans objet affichable garde le rayon d’aujourd’hui', () => {
      fixture.componentRef.setInput('page', {
        rows: 2,
        objects: [storefrontObject({ id: 'vide', contents: [productContent('RETIRE')] })],
      });
      fixture.detectChanges();

      expect(el().querySelector('.board')).toBeNull();
      expect(tiles()).toHaveLength(TEST_ITEMS.length);
    });

    it('pose l’objet et remplit le reste avec le rayon, sans best-seller du catalogue', () => {
      fixture.componentRef.setInput('page', {
        rows: 2,
        objects: [storefrontObject({ id: 'noel', column: 2 })],
      });
      fixture.detectChanges();

      expect(el().classList.contains('composed')).toBe(true);
      expect(slots()).toHaveLength(1);
      expect(el().querySelector('app-info-card')).not.toBeNull();
      expect(fillTiles()).toHaveLength(TEST_ITEMS.length);
      // Le best-seller du catalogue n'est plus qu'une carte parmi les autres.
      expect(el().querySelectorAll('.tile.featured')).toHaveLength(0);
    });

    /** Les deux places vivent dans le même DOM : le CSS choisit selon la largeur. */
    it('donne à chaque case sa place de bureau ET sa place de pile', () => {
      fixture.componentRef.setInput('page', {
        rows: 2,
        objects: [storefrontObject({ id: 'noel', column: 2 })],
      });
      fixture.detectChanges();

      const slot = slots()[0];
      expect(slot?.style.getPropertyValue('--d-col')).toBe('2');
      expect(slot?.style.getPropertyValue('--d-cols')).toBe('2');
      expect(slot?.style.getPropertyValue('--m-order')).toBe('1');
      expect(slot?.style.getPropertyValue('--m-cols')).toBe('2');
      expect(fillTiles()[0]?.style.getPropertyValue('--d-col')).toBe('1');
      expect(fillTiles()[1]?.style.getPropertyValue('--d-col')).toBe('4');
    });

    it('un article posé par un objet ne reparaît pas dans les cases du rayon', () => {
      const star = TEST_ITEMS[2];
      fixture.componentRef.setInput('page', {
        rows: 1,
        objects: [storefrontObject({ id: 'star', contents: [productContent(star?.sku ?? '')] })],
      });
      fixture.detectChanges();

      expect(fillTiles().map(nameOf)).not.toContain(star?.name);
      expect(fillTiles()).toHaveLength(TEST_ITEMS.length - 1);
      expect(slots()[0]?.querySelector('.name')?.textContent?.trim()).toBe(star?.name);
    });

    it('marque la case seule sur ses rangées, et la bande pleine largeur', () => {
      fixture.componentRef.setInput('products', []);
      fixture.componentRef.setInput('page', {
        rows: 2,
        objects: [storefrontObject({ id: 'band', shape: 'doubleBand' })],
      });
      fixture.detectChanges();

      const band = slots()[0];
      expect(band?.classList.contains('alone')).toBe(true);
      expect(band?.classList.contains('tall')).toBe(true);
      expect(band?.classList.contains('full')).toBe(true);
    });

    it('remonte le rayon qu’ouvre une annonce', () => {
      const shelves: string[] = [];
      fixture.componentInstance.shelfOpened.subscribe((key) => shelves.push(key));
      fixture.componentRef.setInput('page', { rows: 1, objects: [storefrontObject({ id: 'n' })] });
      fixture.detectChanges();

      el().querySelector<HTMLButtonElement>('app-info-card button')?.click();

      expect(shelves).toEqual([NOEL.linkShelfKey]);
    });

    it('un produit posé ajoute au panier et ouvre sa fiche comme les autres', () => {
      const opened: string[] = [];
      fixture.componentInstance.opened.subscribe((sku) => opened.push(sku));
      fixture.componentRef.setInput('page', {
        rows: 1,
        objects: [storefrontObject({ id: 'p', contents: [productContent('VIE-001')] })],
      });
      fixture.detectChanges();

      const posed = slots()[0];
      posed?.querySelector<HTMLButtonElement>('.quick')?.click();
      posed?.querySelector<HTMLButtonElement>('.photo')?.click();
      fixture.detectChanges();

      expect(cart.quantityOf('VIE-001')).toBe(1);
      expect(opened).toEqual(['VIE-001']);
    });
  });
});
