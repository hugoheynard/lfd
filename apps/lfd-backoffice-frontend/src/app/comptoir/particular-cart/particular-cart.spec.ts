import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NO_PICKUP_DISCOUNTS, type PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CartStore } from '../../commandes/nouvelle-commande/cart.store';
import { ParticularOfferDraft } from '../particular-offer-draft';
import { OFFERED_MENTION, ParticularCart, SHOP_TILL_MENTION } from './particular-cart';

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

describe('ParticularCart — offrir la commande (O7c)', () => {
  function offering(): { fixture: ComponentFixture<ParticularCart>; offer: ParticularOfferDraft } {
    const fixture = mount();
    const offer = new ParticularOfferDraft();
    fixture.componentRef.setInput('offer', offer);
    fixture.detectChanges();
    return { fixture, offer };
  }

  it('sans offre (pas le droit), pas de choix « Offrir cette commande »', () => {
    expect(el(mount()).querySelector('[data-offering]')).toBeNull();
  });

  it('coché, ouvre le motif, le mode d’acheminement, et change la mention', () => {
    const { fixture } = offering();
    expect(el(fixture).querySelector('[data-offer]')).toBeNull();

    fixture.componentInstance['onOffering'](true);
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-offer]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-offer-method]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-shop-till-mention]')?.textContent).toContain(
      OFFERED_MENTION,
    );
  });

  it('en livraison : l’adresse dictée remplace le point de retrait', () => {
    const { fixture } = offering();
    fixture.componentInstance['onOffering'](true);
    fixture.componentInstance['onMethod']('delivery');
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-particular-delivery-fields')).not.toBeNull();
    expect(el(fixture).querySelector('[data-pickup]')).toBeNull();
    expect(el(fixture).textContent).toContain('Adresse de livraison à compléter');
  });

  it('montre la valeur offerte que le devis rend', () => {
    const { fixture, offer } = offering();
    offer.offering.set(true);
    fixture.componentRef.setInput('estimate', {
      amounts: {
        vatMethod: 'line_ht',
        lines: [],
        subtotalCents: 200,
        discountCents: 0,
        discountTtcCents: null,
        discounts: [],
        deliveryFeeCents: 0,
        deliveryFeeTtcCents: null,
        lateFeeCents: 0,
        lateFeeVatRatePercent: null,
        vatCents: 0,
        vatShares: [],
        pretaxCents: 0,
        totalCents: 0,
        offeredTotalCents: 211,
      },
      cutoff: null,
      refusal: null,
      warnings: [],
    });
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('Valeur offerte');
    expect(el(fixture).textContent).toContain('2,11');
  });
});
