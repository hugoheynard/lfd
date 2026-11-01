import { TestBed } from '@angular/core/testing';
import type { PromotionDecimalsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PromotionDecimalsCallout } from './promotion-decimals-callout';

async function render(decimals: PromotionDecimalsView | null) {
  const fixture = TestBed.createComponent(PromotionDecimalsCallout);
  fixture.componentRef.setInput('decimals', decimals);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PromotionDecimalsCallout', () => {
  it('avertit quand un net passe sous le centime, avec son exemple', async () => {
    const root = await render({
      count: 1,
      examples: [
        { sku: 'CRO-1', name: 'Croissant', priceMillicents: 93_000, netMillicents: 81_840 },
      ],
    });
    const text = root.querySelector('[data-decimals]')?.textContent ?? '';
    expect(text).toContain('Sur 1 article visé, le prix net aura plus de 2 décimales');
    expect(text).toContain('0,8184');
    expect(text).toContain('montant fixe');
    expect(root.querySelector('[data-decimals-basis]')?.textContent).toContain('prix pro de base');
  });

  it('ne dit rien quand aucun article n’est concerné', async () => {
    const root = await render({ count: 0, examples: [] });
    expect(root.querySelector('[data-decimals]')).toBeNull();
  });

  it('ne dit rien sans lecture', async () => {
    const root = await render(null);
    expect(root.querySelector('[data-decimals]')).toBeNull();
  });
});
