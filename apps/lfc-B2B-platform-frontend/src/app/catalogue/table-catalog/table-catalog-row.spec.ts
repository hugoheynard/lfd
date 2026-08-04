import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import type { FoldProduct, FoldProductOrder } from '../../../shared';
import { TableCatalogRow } from './table-catalog-row';

const PACKED: FoldProduct = {
  id: 'croissant',
  name: 'Croissant',
  reference: 'VIE-001',
  price: '2,00 €',
  priceValue: 2,
  step: 10,
  minQty: 10,
  packLabel: 'par 10',
};

@Component({
  standalone: true,
  imports: [TableCatalogRow],
  template: `<table>
    <tbody>
      <tr appTableCatalogRow [product]="product()" (add)="last = $event"></tr>
    </tbody>
  </table>`,
})
class Host {
  readonly product = signal<FoldProduct>(PACKED);
  last?: FoldProductOrder;
}

describe('TableCatalogRow', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const row = fixture.debugElement.query(By.directive(TableCatalogRow))
      .componentInstance as TableCatalogRow;
    return { fixture, row };
  }

  it('defaults the quantity to the pack step and shows the pack label', () => {
    const { row } = render();
    expect(row.step()).toBe(10);
    expect(row.quantity()).toBe(10);
    expect(row.conditioning()).toBe('par 10');
  });

  it('labels a free-unit product "À l\'unité"', () => {
    const { fixture, row } = render();
    fixture.componentInstance.product.set({ id: 'x', name: 'X', price: '1 €' });
    fixture.detectChanges();
    expect(row.step()).toBe(1);
    expect(row.conditioning()).toBe("À l'unité");
  });

  it('emits { product, quantity } on add', () => {
    const { fixture, row } = render();
    row.quantity.set(30);
    row.emitAdd();
    expect(fixture.componentInstance.last).toEqual({ product: PACKED, quantity: 30 });
  });
});
