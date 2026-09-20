import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoldProductCardComponent } from './fold-product-card';
import type { FoldProduct, FoldProductOrder } from './fold-product.model';

const PRODUCT: FoldProduct = {
  id: 'ethiopie',
  name: 'Éthiopie Sidamo',
  price: '8,50 €',
  priceValue: 8.5,
  action: { label: 'Ajouter', icon: 'plus' },
};

/** A product sold by pack of 10 (colisage / PCB). */
const PACKED: FoldProduct = { ...PRODUCT, id: 'croissant', step: 10, minQty: 10 };

describe('FoldProductCardComponent', () => {
  let fixture: ComponentFixture<FoldProductCardComponent>;
  let cmp: FoldProductCardComponent;

  function make(product: FoldProduct): void {
    fixture = TestBed.createComponent(FoldProductCardComponent);
    cmp = fixture.componentInstance;
    fixture.componentRef.setInput('product', product);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FoldProductCardComponent],
      providers: [provideRouter([])],
    });
    make(PRODUCT);
  });

  it('derives the placeholder initial from the name (uppercased)', () => {
    expect(cmp.initial()).toBe('É');
  });

  it('defaults the quantity to 1 for a free-unit product', () => {
    expect(cmp.step()).toBe(1);
    expect(cmp.minQty()).toBe(1);
    expect(cmp.quantity()).toBe(1);
  });

  it('defaults the quantity to the pack size for a PCB product', () => {
    make(PACKED);
    expect(cmp.step()).toBe(10);
    expect(cmp.minQty()).toBe(10);
    expect(cmp.quantity()).toBe(10);
  });

  it('toggles between unit and pack ordering, snapping the quantity', () => {
    make(PACKED);
    // A packed product defaults to by-pack: step = pack size, qty = one pack.
    expect(cmp.hasPack()).toBe(true);
    expect(cmp.byPack()).toBe(true);
    expect(cmp.step()).toBe(10);
    expect(cmp.quantity()).toBe(10);

    // Switch to "à l'unité": step 1, quantity snaps to 1.
    cmp.byPack.set(false);
    expect(cmp.step()).toBe(1);
    expect(cmp.minQty()).toBe(1);
    expect(cmp.quantity()).toBe(1);

    // Back to pack: step 10, quantity snaps to one pack.
    cmp.byPack.set(true);
    expect(cmp.step()).toBe(10);
    expect(cmp.quantity()).toBe(10);
  });

  it('exposes no pack toggle for a free-unit product', () => {
    expect(cmp.hasPack()).toBe(false);
    expect(cmp.byPack()).toBe(false);
    expect(cmp.step()).toBe(1);
  });

  it('labels the add button with the chosen quantity', () => {
    make(PACKED);
    expect(cmp.addText()).toBe('Ajouter 10');
    cmp.quantity.set(30);
    expect(cmp.addText()).toBe('Ajouter 30');
  });

  it('emits the product AND the chosen quantity on action', () => {
    make(PACKED);
    const orders: FoldProductOrder[] = [];
    cmp.action.subscribe((o) => orders.push(o));
    cmp.quantity.set(20);
    cmp.onAction();
    expect(orders).toEqual([{ product: PACKED, quantity: 20 }]);
  });

  it('shows a live line subtotal only when a formatter is provided', () => {
    // No formatter → no subtotal.
    expect(cmp.lineSubtotal()).toBeNull();
    // With a formatter → priceValue × qty, formatted by the parent.
    fixture.componentRef.setInput('priceFormat', (v: number) => `${v.toFixed(2)} €`);
    cmp.quantity.set(3);
    expect(cmp.lineSubtotal()).toBe('25.50 €'); // 8.50 × 3
  });

  it('emits the product when the favourite heart is toggled', () => {
    const ids: string[] = [];
    cmp.favoriteToggle.subscribe((p) => ids.push(p.id));
    cmp.onFavorite();
    expect(ids).toEqual(['ethiopie']);
  });
});
