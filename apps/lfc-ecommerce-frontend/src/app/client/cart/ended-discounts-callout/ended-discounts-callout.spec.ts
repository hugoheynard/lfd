import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShopQuoteEndedDiscountView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientCart } from '../client-cart.service';
import { EndedDiscountsCallout } from './ended-discounts-callout';

function render(ended: readonly ShopQuoteEndedDiscountView[]): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ClientCart, useValue: { endedDiscounts: signal(ended) } }],
  });
  const fixture = TestBed.createComponent(EndedDiscountsCallout);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EndedDiscountsCallout', () => {
  it('dit la remise qui a pris fin, et à quelle heure', () => {
    const host = render([
      { label: { fr: 'Goûter', en: 'Snack', it: 'Merenda' }, endedAt: '19:00' },
    ]);
    expect(host.querySelector('[data-ended-discount]')?.textContent?.trim()).toBe(
      'La remise « Goûter » a pris fin à 19 h.',
    );
  });

  it('se tait sans remise finie', () => {
    expect(render([]).querySelector('fold-callout')).toBeNull();
  });
});
