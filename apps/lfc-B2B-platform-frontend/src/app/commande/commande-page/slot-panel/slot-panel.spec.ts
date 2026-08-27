import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { fill } from '../../../client/copy/client-copy.service';
import { FR } from '../../../client/copy/fr';
import type { OrderSlot } from '../../../client/mock-station';
import { SlotPanel } from './slot-panel';

describe('SlotPanel', () => {
  let fixture: ComponentFixture<SlotPanel>;
  let closedWith: OrderSlot | undefined;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slots = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.slot'));
  const cta = (): HTMLButtonElement => {
    const found = el().querySelector('.cta');
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error('Pas de bouton de confirmation.');
    }
    return found;
  };

  beforeEach(() => {
    closedWith = undefined;
    TestBed.configureTestingModule({
      imports: [SlotPanel],
      providers: [
        {
          provide: FoldPanelRef,
          useValue: new FoldPanelRef<OrderSlot>(1, (result) => {
            closedWith = result;
          }),
        },
      ],
    });
    fixture = TestBed.createComponent(SlotPanel);
    fixture.componentRef.setInput('data', { mode: 'pickup', place: 'Le Labo' });
    fixture.detectChanges();
  });

  it('rappelle où l’on va, et range les créneaux en deux fournées', () => {
    expect(el().textContent).toContain(fill(FR.slotPanel.pickupIntro, { place: 'Le Labo' }));
    expect(el().textContent).toContain(FR.slotPanel.amGroup);
    expect(el().textContent).toContain(FR.slotPanel.pmGroup);
    expect(slots().length).toBe(8);
  });

  it('le complet reste AFFICHÉ, et refuse le doigt', () => {
    // Un trou dans la grille se lirait comme un bug ; un « complet » se lit
    // comme une boulangerie qui a du succès.
    const full = slots().filter((b) => b.disabled);
    expect(full.length).toBe(2);
    expect(full[0]?.textContent).toContain(FR.slotPanel.full);
  });

  it('sans créneau, rien à confirmer — et le bouton le dit', () => {
    expect(cta().disabled).toBe(true);
    expect(cta().textContent).toContain(FR.slotPanel.ctaIdle);
  });

  it('le créneau retenu remonte à qui a ouvert le panneau', () => {
    slots()[0]?.click();
    fixture.detectChanges();

    expect(cta().textContent).toContain(fill(FR.slotPanel.cta, { slot: '7 h – 8 h' }));

    cta().click();
    expect(closedWith?.label).toBe('7 h – 8 h');
  });

  it('la livraison pose la même question, autrement', () => {
    fixture.componentRef.setInput('data', { mode: 'delivery', place: '12 rue du Coin Ferrand' });
    fixture.detectChanges();

    expect(el().textContent).toContain(FR.slotPanel.deliveryTitle);
  });
});
