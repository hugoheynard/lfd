import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { type CartLine } from '../cart-total';
import { TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { CartProductLine } from './cart-product-line';

describe('CartProductLine', () => {
  let fixture: ComponentFixture<CartProductLine>;

  const field = (): HTMLInputElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'fold-number-input input',
    );

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

    expect(field()?.value).toBe('1');
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

  /**
   * 🔴 Le champ EMPILÉ de fold, pas le rail du rayon : au panier on corrige une
   * quantité, on n'en ajoute pas une. Douze croissants ne se retirent pas en
   * douze appuis, et le champ se tape.
   */
  it('règle sa quantité par un champ, pas par un rail', () => {
    render(2);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('fold-number-input')).not.toBeNull();
    expect(el.querySelector('app-quantity-rail')).toBeNull();
  });

  /** C'est la LIGNE qu'on nomme : le produit se lit avant la quantité. */
  it('porte le nom du produit comme nom accessible', () => {
    render(1);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe('Croissant au beurre');
  });

  /**
   * 🔴 La corbeille retire la LIGNE, pas une pièce — et c'est le seul chemin
   * vers zéro, puisque le champ s'arrête à un.
   */
  it('distingue la corbeille du réglage de quantité', () => {
    render(12);
    let dropped = 0;
    let quantities = 0;
    fixture.componentInstance.dropped.subscribe(() => (dropped += 1));
    fixture.componentInstance.quantityChange.subscribe(() => (quantities += 1));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.drop')?.click();

    expect(dropped).toBe(1);
    expect(quantities).toBe(0);
  });
});
