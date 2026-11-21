import { TestBed } from '@angular/core/testing';
import type { AdminOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { adminOrder } from '../__tests__/admin-order-fixture';
import { OrderMasthead } from './order-masthead';

function render(order: AdminOrderView = adminOrder()): HTMLElement {
  const fixture = TestBed.createComponent(OrderMasthead);
  fixture.componentRef.setInput('order', order);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Le texte sans aucun blanc : l'écart entre deux morceaux est le `gap` du conteneur, pas une espace. */
const bare = (text: string | null | undefined): string => (text ?? '').replace(/\s+/gu, '');
const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/gu, ' ').trim();

describe('OrderMasthead — l’en-tête staff d’une commande', () => {
  it('se lit dans l’ordre : identité et montant, puis acheminement', () => {
    const lines = [...render().querySelectorAll('[data-om-line]')].map((el) =>
      el.getAttribute('data-om-line'),
    );
    expect(lines).toEqual(['identity', 'fulfillment']);
  });

  it('ligne 1 : « ORD-9 / Boulangerie Martin », Pro, statut, règlement, puis le montant', () => {
    const top = render().querySelector('[data-om-line="identity"]');
    expect(bare(top?.querySelector('h1')?.textContent)).toBe('ORD-9/BoulangerieMartin');
    const badges = [...(top?.querySelectorAll('[data-om-badges] fold-badge') ?? [])].map((badge) =>
      squash(badge.textContent),
    );
    expect(badges).toEqual(['Pro', 'Prête', 'Au compte — à facturer']);
    // Le montant ferme la ligne : après le titre et les badges.
    expect(top?.lastElementChild?.matches('[data-om-end]')).toBe(true);
    expect(top?.lastElementChild?.firstElementChild?.hasAttribute('data-om-total')).toBe(true);
  });

  it('ne porte plus le contact : il a sa carte dans « Détail »', () => {
    expect(render().querySelector('app-order-placed-by')).toBeNull();
  });

  it('le montant et son « HT » vivent dans le même bloc, sur la même ligne', () => {
    const total = render().querySelector('[data-om-total]');
    expect(bare(total?.textContent)).toBe('197,34€HT');
    expect(total?.querySelector('.om-total-basis')?.textContent).toBe('HT');
  });

  it('un particulier réglé par carte lit son TTC', () => {
    const total = render(adminOrder({ settlement: 'paid', clientele: 'public' })).querySelector(
      '[data-om-total]',
    );
    expect(bare(total?.textContent)).toBe('208,19€TTC');
  });

  it('ligne 2 : le mode et son point de retrait, puis le jour', () => {
    expect(squash(render().querySelector('[data-om-line="fulfillment"]')?.textContent)).toBe(
      'Retrait · La Folie Bakery, le 24 novembre 2026',
    );
  });

  it('ne répète pas les dates de passation', () => {
    expect(render().textContent).not.toContain('Passée le');
  });

  it('ne dit le numéro qu’une fois', () => {
    expect(squash(render().textContent).match(/ORD-9/gu)).toHaveLength(1);
  });

  it('range « Panier récurrent » avec les badges de la ligne 1', () => {
    const el = render(adminOrder({ fromSubscriptionId: 'sub_1' }));
    expect(el.querySelector('[data-om-line="identity"] [data-om-recurring]')).not.toBeNull();
    expect(el.querySelectorAll('[data-om-badges] fold-badge')).toHaveLength(4);
  });
});
