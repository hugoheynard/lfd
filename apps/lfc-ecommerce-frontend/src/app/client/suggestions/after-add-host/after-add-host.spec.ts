import { TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { answerCart, bootAfterAdd, CART_ROUTE, cartPick } from '../after-add-suggestion.fixture';
import { AfterAddHost } from './after-add-host';

describe('AfterAddHost', () => {
  it('ne charge rien, ne demande rien, tant que rien n’est entré au panier', () => {
    const { http } = bootAfterAdd([AfterAddHost]);
    const fixture = TestBed.createComponent(AfterAddHost);
    fixture.detectChanges();
    TestBed.tick();

    http.expectNone(CART_ROUTE);
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-toast')).toBeNull();
  });

  it('à la première entrée : « Ajouté ! » et la suggestion du panier, dans un toast', async () => {
    const { cart, entries, http } = bootAfterAdd([AfterAddHost]);
    const fixture = TestBed.createComponent(AfterAddHost);
    fixture.detectChanges();
    cart.add('VIE-001');
    entries.entered('VIE-001');

    await answerCart(http, [cartPick('PAI-001')]);
    fixture.detectChanges();
    await fixture.whenStable();

    const toast = (fixture.nativeElement as HTMLElement).querySelector('fold-toast');
    expect(toast?.textContent).toContain(FR.shop.addedToCart);
    expect(toast?.querySelector('app-staff-suggestion-card')?.textContent).toContain(
      FR.shop.staffAdvice,
    );
  });
});
