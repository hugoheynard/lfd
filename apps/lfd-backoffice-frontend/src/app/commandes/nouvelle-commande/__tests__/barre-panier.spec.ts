import { TestBed } from '@angular/core/testing';
import { BarrePanier } from '../barre-panier/barre-panier';
import { CartStore } from '../cart.store';
import { DraftStore } from '../draft.store';

/**
 * La barre du panier en tiroir dit ce qu'elle ouvre et le compte d'articles ;
 * un montant seulement quand le serveur l'a estimé (Hugo, 2026-11-21).
 */
describe('BarrePanier', () => {
  it('sans estimation : « Paramétrer le panier (n articles) », et aucun montant', () => {
    const cart = new CartStore();
    cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 3);
    const fixture = TestBed.createComponent(BarrePanier);
    fixture.componentRef.setInput('cart', cart);
    fixture.componentRef.setInput('draft', new DraftStore());
    fixture.componentRef.setInput('pickups', []);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent.replace(/\s+/g, ' ')).toContain('Paramétrer le panier (3 articles)');
    expect(host.querySelector('.bar-total')).toBeNull();
    expect(host.textContent).not.toContain('Prix à confirmer');
  });
});
