import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NO_PICKUP_DISCOUNTS, type PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CartStore } from '../../commandes/nouvelle-commande/cart.store';
import { ParticularCart, SHOP_TILL_MENTION } from './particular-cart';

const POINT: PickupAddressView = {
  id: 'p1',
  label: 'Boutique',
  ligne1: '1 rue',
  ligne2: '',
  codePostal: '73000',
  ville: 'Chambéry',
  pays: 'FR',
  discounts: NO_PICKUP_DISCOUNTS,
  opening: { publicOpening: { start: '08:00', end: '10:00' }, proPickup: null },
};

function mount(withLine = true): ComponentFixture<ParticularCart> {
  TestBed.resetTestingModule();
  const cart = new CartStore();
  if (withLine) {
    cart.add({ sku: 'S1', name: 'Baguette', unitPriceMillicents: 100_000 }, 2);
  }
  const fixture = TestBed.createComponent(ParticularCart);
  fixture.componentRef.setInput('cart', cart);
  fixture.componentRef.setInput('pickups', [POINT]);
  fixture.componentInstance.pickupId.set('p1');
  fixture.componentInstance.requestedDate.set('2026-12-01');
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<ParticularCart>) => f.nativeElement as HTMLElement;

describe('ParticularCart — le panier du particulier', () => {
  it('dit la caisse de la boutique, et ne propose aucun champ de règlement', () => {
    const fixture = mount();
    expect(el(fixture).querySelector('[data-shop-till-mention]')?.textContent).toContain(
      SHOP_TILL_MENTION,
    );
    expect(el(fixture).textContent).not.toContain('Règlement');
  });

  it('retient la validation tant que le créneau n’est pas choisi', () => {
    const fixture = mount();
    expect(el(fixture).textContent).toContain('Créneau de retrait à choisir.');
    expect(el(fixture).querySelector('[data-validate]')).toBeNull();
  });

  it('remet le créneau à choisir quand le point change', () => {
    const fixture = mount();
    fixture.componentInstance.window.set({ start: '08:00', end: '09:00' });
    fixture.componentInstance['onPickup']('p1');
    expect(fixture.componentInstance.window()).toBeNull();
  });

  it('valide après confirmation, une fois le devis à jour', () => {
    const fixture = mount();
    fixture.componentInstance.window.set({ start: '08:00', end: '09:00' });
    fixture.componentRef.setInput('estimateReady', true);
    let placed = 0;
    fixture.componentInstance.place.subscribe(() => (placed += 1));
    fixture.detectChanges();

    el(fixture).querySelector<HTMLButtonElement>('[data-validate]')?.click();
    fixture.detectChanges();
    el(fixture).querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    expect(placed).toBe(1);
  });
});
