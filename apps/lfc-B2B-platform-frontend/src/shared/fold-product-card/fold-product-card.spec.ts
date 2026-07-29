import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoldProductCardComponent } from './fold-product-card';
import type { FoldProduct } from './fold-product.model';

const PRODUCT: FoldProduct = {
  id: 'ethiopie',
  name: 'Éthiopie Sidamo',
  price: '8,50 €',
  action: { label: 'Ajouter', icon: 'plus' },
};

describe('FoldProductCardComponent', () => {
  let fixture: ComponentFixture<FoldProductCardComponent>;
  let cmp: FoldProductCardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FoldProductCardComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(FoldProductCardComponent);
    cmp = fixture.componentInstance;
    fixture.componentRef.setInput('product', PRODUCT);
  });

  it('derives the placeholder initial from the name (uppercased)', () => {
    expect(cmp.initial()).toBe('É');
  });

  it('emits the product when its action is activated', () => {
    const ids: string[] = [];
    cmp.action.subscribe((p) => ids.push(p.id));
    cmp.onAction();
    expect(ids).toEqual(['ethiopie']);
  });

  it('emits the product when the favourite heart is toggled', () => {
    const ids: string[] = [];
    cmp.favoriteToggle.subscribe((p) => ids.push(p.id));
    cmp.onFavorite();
    expect(ids).toEqual(['ethiopie']);
  });
});
