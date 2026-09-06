import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PickupSlot } from '@lfd/contracts';

import { fill } from '../../../../client/copy/client-copy.service';
import { FR } from '../../../../client/copy/fr';
import { SlotStep } from './slot-step';

/**
 * L'écriture française attendue : espace **insécable** avant le `h` et avant le
 * tiret. Écrire ces libellés avec des espaces ordinaires ferait échouer la suite
 * sur une différence invisible à l'œil.
 */
const NB = '\u00A0';
const window = (from: string, to: string): string => `${from}${NB}– ${to}`;
const hour = (h: number, minutes = ''): string =>
  minutes === '' ? `${h}${NB}h` : `${h}${NB}h${NB}${minutes}`;

/** Les deux fenêtres d'un point : les pros avant le four, le public après. */
const SLOTS: readonly PickupSlot[] = [
  { id: '05:00-06:00', start: '05:00', end: '06:00', access: 'pro' },
  { id: '06:00-06:30', start: '06:00', end: '06:30', access: 'pro' },
  { id: '07:00-08:00', start: '07:00', end: '08:00', access: 'public' },
  { id: '17:00-18:00', start: '17:00', end: '18:00', access: 'public' },
];

describe('SlotStep', () => {
  let fixture: ComponentFixture<SlotStep>;
  let emitted: (PickupSlot | null)[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slots = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.slot'));

  function boot(given: readonly PickupSlot[] = SLOTS): void {
    emitted = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SlotStep] });
    fixture = TestBed.createComponent(SlotStep);
    fixture.componentRef.setInput('mode', 'pickup');
    fixture.componentRef.setInput('place', 'Le Labo');
    fixture.componentRef.setInput('slots', given);
    fixture.componentInstance.pickedChange.subscribe((slot) => emitted.push(slot));
    fixture.detectChanges();
  }

  beforeEach(() => {
    boot();
  });

  it('rappelle où l’on va, et range les créneaux par moment de la journée', () => {
    expect(el().textContent).toContain(fill(FR.slotStep.pickupIntro, { place: 'Le Labo' }));
    expect(el().textContent).toContain(FR.slotStep.amGroup);
    expect(el().textContent).toContain(FR.slotStep.pmGroup);
    expect(slots().length).toBe(4);
  });

  /**
   * 🔴 Le volet ne fabrique plus sa grille : il la REÇOIT, déduite des heures
   * déclarées du point. Les huit heures en dur et leurs états sans source
   * (« complet », « sortie du four ») ont disparu avec elle.
   */
  it('écrit les heures telles qu’on les lit, la demie comprise', () => {
    const hours = slots().map((b) => b.querySelector('.hour')?.textContent?.trim());
    expect(hours).toEqual([
      window(hour(5), hour(6)),
      window(hour(6), hour(6, '30')),
      window(hour(7), hour(8)),
      window(hour(17), hour(18)),
    ]);
  });

  it('dit ce que le PUBLIC n’a pas, et rien d’autre', () => {
    const subs = slots().map((b) => b.querySelector('.sub')?.textContent?.trim());
    expect(subs).toEqual([
      FR.slotStep.proOnly,
      FR.slotStep.proOnly,
      FR.slotStep.free,
      FR.slotStep.free,
    ]);
  });

  it('remonte le créneau retenu, et rien de plus', () => {
    // Le volet ne décide pas : il informe. C'est le dialogue qui porte le bouton.
    slots()[0]?.click();
    expect(emitted.map((s) => s?.id)).toEqual(['05:00-06:00']);
  });

  /**
   * Aucune heure déclarée n'est pas une panne : c'est un point qui n'a pas
   * publié ses horaires. L'écran le DIT — proposer n'importe quelle heure
   * enverrait quelqu'un devant une porte close.
   */
  it('dit l’absence d’horaires plutôt que d’en proposer', () => {
    boot([]);

    expect(slots()).toHaveLength(0);
    expect(el().textContent).toContain(FR.slotStep.noneTitle);
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
