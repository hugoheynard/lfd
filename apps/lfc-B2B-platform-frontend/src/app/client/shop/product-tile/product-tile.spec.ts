import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { TEST_ITEMS } from '../shop-catalogue.fixture';
import { ProductTile } from './product-tile';

describe('ProductTile', () => {
  let fixture: ComponentFixture<ProductTile>;

  const priceText = (): string =>
    (fixture.nativeElement as HTMLElement).querySelector('.price')?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductTile] });
    fixture = TestBed.createComponent(ProductTile);
    // 1,40 € HT à 5,5 % — le premier article de la vitrine de test.
    fixture.componentRef.setInput('product', TEST_ITEMS[0]);
    fixture.detectChanges();
  });

  /**
   * 🔴 **Le prix du rayon est hors taxe, et il le DIT.**
   *
   * Un prix alimentaire affiché sans mention se lit TTC en France. La vignette
   * a longtemps montré du TTC converti dans le front ; elle montre désormais le
   * hors taxe que le référentiel sert, et la mention est ce qui empêche le même
   * nombre de vouloir dire deux choses.
   */
  it('affiche le prix HORS TAXE, mention comprise', () => {
    expect(priceText()).toBe('1,40 € HT');
  });

  /** Le TTC (1,48 €) ne s'affiche plus ici : ce n'est pas l'unité du rayon. */
  it('n’affiche pas le prix toutes taxes comprises', () => {
    expect(priceText()).not.toContain('1,48');
  });

  it('porte la mention dans la langue affichée', () => {
    expect(priceText().endsWith(FR.shop.priceHt.replace('{price} ', ''))).toBe(true);
  });
});
