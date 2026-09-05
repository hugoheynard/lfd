import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { type CartLine } from '../cart-total';
import { TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { CartProductLine } from './cart-product-line';

describe('CartProductLine', () => {
  let fixture: ComponentFixture<CartProductLine>;

  const text = (selector: string): string =>
    (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '';

  function render(quantity: number): void {
    // 1,40 € HT à 5,5 % — le premier article de la vitrine de test.
    const line: CartLine = { product: TEST_ITEMS[0]!, quantity };
    fixture = TestBed.createComponent(CartProductLine);
    fixture.componentRef.setInput('line', line);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartProductLine] });
  });

  it('porte la quantité, le nom et le prix unitaire hors taxe', () => {
    render(1);

    expect(text('.qty')).toBe('1');
    expect(text('.name')).toBe('Croissant au beurre');
    expect(text('.unit')).toBe('1,40 € HT');
  });

  /**
   * 🔴 **L'arrondi a lieu au total de ligne, jamais à l'unité multipliée.**
   * Trois pièces à 1,40 € HT font 4,20 € — ici la multiplication tombe juste,
   * mais c'est la fonction qui décide, pas le gabarit.
   */
  it('multiplie par la quantité pour le total de ligne', () => {
    render(3);

    expect(text('.unit')).toBe('1,40 € HT');
    expect(text('.sum')).toBe('4,20 €');
  });
});
