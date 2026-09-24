import { provideHttpClient } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientCart } from '../../../cart/client-cart.service';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { StorefrontActions } from '../storefront-actions';
import { NOEL, productContent } from '../storefront.fixture';
import { StorefrontProduct } from './storefront-product';

describe('StorefrontProduct', () => {
  let fixture: ComponentFixture<StorefrontProduct>;
  let actions: StorefrontActions;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function render(content: unknown, shape = 'tile', tone = 'dark'): void {
    fixture = TestBed.createComponent(StorefrontProduct);
    fixture.componentRef.setInput('content', content);
    fixture.componentRef.setInput('shape', shape);
    fixture.componentRef.setInput('mediaFit', 'cover');
    fixture.componentRef.setInput('mediaSide', 'right');
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StorefrontProduct],
      providers: [provideHttpClient(), StorefrontActions],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ClientCart).clear();
    actions = TestBed.inject(StorefrontActions);
  });

  it('résout le SKU dans le catalogue et rend la vignette à la forme de sa case', () => {
    render(productContent('VIE-002'));

    expect(el().querySelector('.name')?.textContent?.trim()).toBe(TEST_ITEMS[1]?.name);
    const tile = el().querySelector('.tile');
    // Un produit sur une tuile est le best-seller — même si le catalogue ne le marque pas.
    expect(tile?.classList.contains('featured')).toBe(true);
    expect(tile?.classList.contains('side-right')).toBe(true);
    expect(tile?.classList.contains('tone-dark')).toBe(true);
  });

  it('remonte la fiche et l’ajout par le relais de la grille', () => {
    const opened: string[] = [];
    const added: string[] = [];
    actions.productOpened.subscribe((sku) => opened.push(sku));
    actions.productAdded.subscribe((sku) => added.push(sku));
    render(productContent('VIE-001'));

    el().querySelector<HTMLButtonElement>('.photo')?.click();
    el().querySelector<HTMLButtonElement>('.quick')?.click();

    expect(opened).toEqual(['VIE-001']);
    expect(added).toEqual(['VIE-001']);
  });

  it('un SKU que le catalogue ne sert plus ne rend rien', () => {
    render(productContent('RETIRE'));
    expect(el().querySelector('app-product-tile')).toBeNull();
  });

  it('un contenu qui n’est pas un produit ne rend rien', () => {
    render(NOEL);
    expect(el().querySelector('app-product-tile')).toBeNull();
  });
});
