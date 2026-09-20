import { TestBed } from '@angular/core/testing';
import type { PickupAddressView } from '@lfd/contracts';

import { PickupPointCard } from './pickup-point-card';

const VILLAGE: PickupAddressView = {
  id: 'pick_village',
  label: 'Le Village',
  ligne1: 'Place de l’Église',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  isDefault: false,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { proPickup: null, publicOpening: null },
};

describe('PickupPointCard', () => {
  const mount = (tag = ''): ReturnType<typeof TestBed.createComponent<PickupPointCard>> => {
    const fixture = TestBed.createComponent(PickupPointCard);
    fixture.componentRef.setInput('point', VILLAGE);
    fixture.componentRef.setInput('tag', tag);
    fixture.componentRef.setInput('offer', { label: 'Prix boutique', hasOffer: false });
    fixture.detectChanges();
    return fixture;
  };

  it('dit le lieu, sa ville et ce qu’il promet, et remonte le geste', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    let chosen = 0;
    fixture.componentInstance.chosen.subscribe(() => (chosen += 1));

    expect(el.querySelector('.name')?.textContent).toBe('Le Village');
    expect(el.querySelector('.where')?.textContent).toBe('Val d’Isère');
    expect(el.querySelector('.offer')?.textContent).toBe('Prix boutique');
    expect(el.querySelector('.offer.deal')).toBeNull();
    expect(el.querySelector('.tag')).toBeNull();

    el.querySelector('button')?.click();
    expect(chosen).toBe(1);
  });

  it('porte l’étiquette de l’habitude quand on la lui donne', () => {
    const el = mount('votre habitude').nativeElement as HTMLElement;
    expect(el.querySelector('.tag')?.textContent).toBe('votre habitude');
  });
});
