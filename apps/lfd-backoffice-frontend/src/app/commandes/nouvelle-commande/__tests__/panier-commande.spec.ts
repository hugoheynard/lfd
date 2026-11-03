import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { DeliveryAvailabilityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';
import { DraftStore } from '../draft.store';
import { PanierCommande } from '../panier-commande/panier-commande';

/**
 * Le panier de droite (décision Hugo du 2026-11-03) : les réglages d'abord,
 * les lignes ensuite, et le récapitulatif en haut à droite dès qu'il y a une
 * ligne. Deux vues — réglages ou lignes — sous un même pied.
 */
const OPEN_TO_ALL: DeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  windowMode: 'slot',
  updatedAt: null,
  updatedBy: null,
};

function mount(cart: CartStore): HTMLElement {
  return mountFull(cart).host;
}

function mountFull(cart: CartStore): {
  fixture: ComponentFixture<PanierCommande>;
  host: HTMLElement;
  component: PanierCommande;
} {
  const fixture = TestBed.createComponent(PanierCommande);
  const set = fixture.componentRef.setInput.bind(fixture.componentRef);
  set('cart', cart);
  set('draft', new DraftStore());
  set('companyName', 'Le Bistrot');
  set('buyers', []);
  set('pickups', []);
  set('addresses', []);
  set('zones', []);
  set('deliveryAvailability', OPEN_TO_ALL);
  set('audience', 'b2b');
  set('settlesOnAccount', true);
  fixture.detectChanges();
  return {
    fixture,
    host: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('PanierCommande — en-tête et ordre', () => {
  it('panier vide : rien à droite du titre', () => {
    const host = mount(new CartStore());
    expect(host.querySelector('.pan-summary')).toBeNull();
  });

  it('avec des lignes : articles et sous-total HT en haut à droite', () => {
    const cart = new CartStore();
    cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 7);
    const host = mount(cart);

    const summary = host.querySelector('.pan-summary')?.textContent.replace(/\s+/g, ' ').trim();
    expect(summary).toMatch(/^7 articles · Sous-total HT 14,00\s€ HT$/u);
    expect(host.textContent).toContain('calculés à la validation');
  });

  it('ouvre sur « Paramétrer la commande »', () => {
    const { component } = mountFull(new CartStore());
    expect(component.view()).toBe('settings');
  });

  it('le pied et ses refus restent dans les deux vues', () => {
    const { fixture, host, component } = mountFull(new CartStore());
    const texts = (): string[] =>
      [...host.querySelectorAll('.pan-foot fold-callout')].map((c) => c.textContent);

    const inSettings = texts();
    component.view.set('lines');
    fixture.detectChanges();

    expect(inSettings.length).toBeGreaterThan(0);
    expect(texts().map(firstLine)).toEqual(inSettings.map(firstLine));
  });

  it('un refus sur les lignes renvoie au panier depuis les réglages', () => {
    const { fixture, host, component } = mountFull(new CartStore());
    const go = footButton(host, 'Voir le panier');

    go.click();
    fixture.detectChanges();

    expect(component.view()).toBe('lines');
  });

  it('un refus sur un réglage renvoie aux réglages depuis le panier', () => {
    const cart = new CartStore();
    cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 1);
    const { fixture, host, component } = mountFull(cart);
    component.view.set('lines');
    fixture.detectChanges();

    // Aucune date posée : le refus vit dans les réglages.
    footButton(host, 'Paramétrer la commande').click();
    fixture.detectChanges();

    expect(component.view()).toBe('settings');
    expect(host.querySelector('.pan-foot')?.textContent).not.toContain('Voir le panier');
  });
});

function firstLine(text: string): string {
  return (text.split(/Paramétrer la commande|Voir le panier/u)[0] ?? '').trim();
}

function footButton(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('.pan-foot button')].find(
    (b) => b.textContent.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`aucun bouton « ${label} » au pied`);
  }
  return found;
}
