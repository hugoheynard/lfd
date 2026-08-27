import { ComponentFixture, TestBed } from '@angular/core/testing';

import { fill } from '../../../client/copy/client-copy.service';
import { FR } from '../../../client/copy/fr';
import type { OrderSlot } from '../../../client/mock-station';
import { SlotStep } from './slot-step';

describe('SlotStep', () => {
  let fixture: ComponentFixture<SlotStep>;
  let emitted: (OrderSlot | null)[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slots = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.slot'));

  beforeEach(() => {
    emitted = [];
    TestBed.configureTestingModule({ imports: [SlotStep] });
    fixture = TestBed.createComponent(SlotStep);
    fixture.componentRef.setInput('mode', 'pickup');
    fixture.componentRef.setInput('place', 'Le Labo');
    fixture.componentInstance.pickedChange.subscribe((slot) => emitted.push(slot));
    fixture.detectChanges();
  });

  it('rappelle où l’on va, et range les créneaux en deux fournées', () => {
    expect(el().textContent).toContain(fill(FR.slotStep.pickupIntro, { place: 'Le Labo' }));
    expect(el().textContent).toContain(FR.slotStep.amGroup);
    expect(el().textContent).toContain(FR.slotStep.pmGroup);
    expect(slots().length).toBe(8);
  });

  it('le complet reste AFFICHÉ, et refuse le doigt', () => {
    // Un trou dans la grille se lirait comme un bug ; un « complet » se lit
    // comme une boulangerie qui a du succès.
    const full = slots().filter((b) => b.disabled);
    expect(full.length).toBe(2);
    expect(full[0]?.textContent).toContain(FR.slotStep.full);
  });

  it('remonte le créneau retenu, et rien de plus', () => {
    // Le volet ne décide pas : il informe. C'est le dialogue qui porte le bouton.
    slots()[0]?.click();
    expect(emitted.map((s) => s?.label)).toEqual(['7 h – 8 h']);
  });

  it('la livraison pose la même question, autrement', () => {
    fixture.componentRef.setInput('mode', 'delivery');
    fixture.componentRef.setInput('place', '12 rue du Coin Ferrand');
    fixture.detectChanges();

    expect(el().textContent).toContain(
      fill(FR.slotStep.deliveryIntro, { place: '12 rue du Coin Ferrand' }),
    );
  });
});
