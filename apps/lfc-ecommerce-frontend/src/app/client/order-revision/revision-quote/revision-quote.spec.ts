import { TestBed } from '@angular/core/testing';
import type { OrderRevisionQuoteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ORDERS_FR } from '../../copy/screens/orders.copy';
import { differenceLabel, RevisionQuote } from './revision-quote';

const C = ORDERS_FR.revision;

const QUOTE: OrderRevisionQuoteView = {
  revision: 2,
  lines: [],
  subtotalCents: 1_000,
  discountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  voucherDiscountCents: 0,
  vatCents: 55,
  totalCents: 1_055,
  previousTotalCents: 635,
  differenceCents: 420,
  changes: ['lines'],
};

describe('RevisionQuote', () => {
  it('dit l’écart avec son signe, et l’absence d’écart', () => {
    expect(differenceLabel(420, C)).toMatch(/^\+ 4,20/u);
    expect(differenceLabel(-310, C)).toMatch(/^− 3,10/u);
    expect(differenceLabel(0, C)).toBe('Aucun écart');
  });

  it('montre le nouveau total et l’écart du serveur', () => {
    TestBed.configureTestingModule({ imports: [RevisionQuote] });
    const fixture = TestBed.createComponent(RevisionQuote);
    fixture.componentRef.setInput('quote', QUOTE);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-total]')?.textContent).toContain('10,55');
    expect(el.querySelector('[data-difference]')?.textContent).toContain('+ 4,20');
  });
});
