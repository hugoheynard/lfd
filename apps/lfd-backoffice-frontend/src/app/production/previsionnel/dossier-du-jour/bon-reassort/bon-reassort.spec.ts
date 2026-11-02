import { TestBed } from '@angular/core/testing';
import type { ProductionDayResupply } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BonReassort } from './bon-reassort';

/** L'aperçu du bon de réassort : au poids, « 1,25 kg » sur la ligne (lot L2b-4). */
describe('BonReassort', () => {
  function mount(resupply: ProductionDayResupply): HTMLElement {
    TestBed.configureTestingModule({ imports: [BonReassort] });
    const fixture = TestBed.createComponent(BonReassort);
    fixture.componentRef.setInput('resupply', resupply);
    fixture.componentRef.setInput('rank', 1);
    fixture.componentRef.setInput('total', 1);
    fixture.componentRef.setInput('dayLabel', 'mardi 3 novembre');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('écrit le poids en kilos sur sa ligne et le compte pour une pièce, comme le PDF', () => {
    const root = mount({
      resupplyId: 'r-1',
      siteId: 'site-v',
      siteLabel: 'Village',
      name: null,
      servedByTransfer: true,
      lines: [
        { sku: 'CRO', productName: 'Croissant', quantity: 12, saleUnit: 'piece' },
        { sku: 'SAU', productName: 'Saumon gravlax', quantity: 1250, saleUnit: 'weight' },
      ],
    });

    const quantities = [...root.querySelectorAll('.br-qty')].map((cell) => cell.textContent.trim());
    expect(quantities).toEqual(['12', '1,25 kg']);
    expect(root.querySelector('caption')?.textContent).toContain('13');
    expect(root.textContent).not.toContain('1250');
  });
});
