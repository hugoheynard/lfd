import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PublicPickupSlot } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientLocale } from '../../client-locale.service';
import { PublicSlots } from '../public-slots.gateway';
import { SlotPickerDialog, type SlotPickerData } from './slot-picker-dialog';

/**
 * **Le sélecteur d'heure public.**
 *
 * Trois choses s'y jouent qu'aucun typecheck ne voit : l'écran ne doit pas dire
 * « aucun créneau » pendant qu'il lit, un créneau complet doit rester VISIBLE et
 * fermé en nommant la suivante, et le bouton doit porter l'heure retenue plutôt
 * qu'un « Continuer » qui obligerait à remonter pour vérifier.
 */

const DAY = '2026-09-17';

function slot(over: Partial<PublicPickupSlot> & { time: string }): PublicPickupSlot {
  return {
    startAt: `${DAY}T05:00:00.000Z`,
    endAt: `${DAY}T05:30:00.000Z`,
    day: DAY,
    badge: null,
    serviceCapacity: null,
    taken: 0,
    open: true,
    nextOpenTime: null,
    ...over,
  };
}

const DATA: SlotPickerData = {
  pickupAddressId: 'pick_labo',
  place: 'Le Labo',
  firstDay: DAY,
};

/** Le magasin de créneaux, rendu maître du moment où il répond. */
class FakeSlots {
  private pending: ((slots: readonly PublicPickupSlot[]) => void) | null = null;
  readonly asked: string[] = [];

  forDay(_id: string, day: string): Promise<readonly PublicPickupSlot[]> {
    this.asked.push(day);
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  /** Répond à la lecture en cours. */
  serve(slots: readonly PublicPickupSlot[]): void {
    this.pending?.(slots);
    this.pending = null;
  }
}

async function mount(
  data: SlotPickerData = DATA,
): Promise<{ fixture: ComponentFixture<SlotPickerDialog>; slots: FakeSlots; closed: unknown[] }> {
  const slots = new FakeSlots();
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    imports: [SlotPickerDialog],
    providers: [
      { provide: PublicSlots, useValue: slots },
      { provide: ClientLocale, useValue: { current: signal('fr' as const) } },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
    ],
  });
  const fixture = TestBed.createComponent(SlotPickerDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { fixture, slots, closed };
}

/**
 * Le texte à l'écran, espaces INSÉCABLES ramenées à des espaces ordinaires.
 *
 * `formatHour` colle le nombre à son `h` avec un U+00A0 — « 6 h 30 » s'écrit
 * avec deux insécables. Sans cette normalisation, une assertion échoue sur une
 * chaîne qui contient pourtant la valeur attendue, et le message de vitest
 * montre deux textes identiques.
 */
const text = (fixture: ComponentFixture<SlotPickerDialog>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\u00A0/gu, ' ');

/** Même normalisation, pour un libellé lu directement sur le composant. */
const plain = (value: string): string => value.replace(/\u00A0/gu, ' ');

describe('SlotPickerDialog — ce qu’il refuse de dire', () => {
  it('🔴 ne dit pas « aucun créneau » pendant qu’il lit', async () => {
    // La lecture n'a pas répondu : affirmer qu'il n'y a rien serait faux, et
    // c'est la pire des trois affirmations possibles.
    const { fixture } = await mount();

    expect(fixture.componentInstance['loading']()).toBe(true);
    expect(text(fixture)).not.toContain('Aucun créneau');
  });

  it('dit « aucun créneau » quand le serveur n’en rend aucun', async () => {
    const { fixture, slots } = await mount();
    slots.serve([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Aucun créneau');
  });

  it('🔴 n’ouvre aucune journée quand le serveur n’en accorde pas', async () => {
    // `firstDay: null` = aucune journée demandable. En inventer une — « demain »
    // — ferait promettre un retrait que la commande refuserait.
    const { fixture } = await mount({ ...DATA, firstDay: null });

    expect(fixture.componentInstance['days']()).toHaveLength(0);
    expect(text(fixture)).toContain('Aucune journée ouverte');
  });
});

describe('SlotPickerDialog — les créneaux', () => {
  it('montre les heures servies, et le badge du vendeur', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '06:30', badge: 'Première fournée' }), slot({ time: '07:15' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('6 h 30');
    expect(text(fixture)).toContain('Première fournée');
    expect(text(fixture)).toContain('7 h 15');
  });

  it('🔴 laisse un créneau COMPLET visible, fermé, et dit où il reste de la place', async () => {
    // Le faire disparaître serait un refus muet ; ceci est une orientation.
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '12:30', open: false, nextOpenTime: '13:15' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement | null = (fixture.nativeElement as HTMLElement).querySelector(
      'button.slot',
    );
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(text(fixture)).toContain('12 h 30');
    expect(text(fixture)).toContain('13 h 15');
  });

  it('🔴 le bouton NOMME l’heure retenue', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '06:30' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['ctaLabel']()).toBe('Choisissez une heure');

    fixture.componentInstance['pick'](slot({ time: '06:30' }));
    fixture.detectChanges();

    expect(plain(fixture.componentInstance['ctaLabel']())).toContain('6 h 30');
  });

  it('🔴 un créneau complet ne se prend pas, même appelé directement', async () => {
    // La garde est dans le composant et pas seulement dans l'attribut désactivé :
    // un gabarit qui oublierait `disabled` ne doit pas pouvoir vendre une heure
    // pleine.
    const { fixture } = await mount();

    fixture.componentInstance['pick'](slot({ time: '12:30', open: false }));

    expect(fixture.componentInstance['picked']()).toBeNull();
  });

  it('rend le créneau retenu en se fermant', async () => {
    const { fixture, slots, closed } = await mount();
    slots.serve([slot({ time: '06:30' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance['pick'](slot({ time: '06:30' }));
    fixture.componentInstance['confirm']();

    expect(closed).toHaveLength(1);
    expect((closed[0] as PublicPickupSlot).time).toBe('06:30');
  });

  it('relit en changeant de journée — les créneaux dépendent de l’heure qu’il est', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '06:30' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const next = fixture.componentInstance['days']()[1];
    fixture.componentInstance['showDay'](next?.day ?? '');
    fixture.detectChanges();

    expect(slots.asked).toHaveLength(2);
    expect(slots.asked[1]).not.toBe(slots.asked[0]);
    // Le choix de la veille ne survit pas au changement de jour.
    expect(fixture.componentInstance['picked']()).toBeNull();
  });
});

describe('SlotPickerDialog — les journées', () => {
  /**
   * 🔴 **Une semaine depuis le 2026-09-17**, contre trois journées avant : un
   * visiteur qui prépare un départ n'a pas de raison d'être borné à
   * après-demain.
   *
   * ⚠️ Le point de DÉPART ne change pas, et c'est ce que ce cas tient vraiment :
   * les sept journées partent de celle que le SERVEUR accorde, jamais d'un
   * « aujourd'hui » calculé dans le navigateur. Élargir la fenêtre n'ouvre donc
   * aucune journée que l'heure limite refuse — elle en montre davantage après.
   */
  it('offre une semaine à partir de la journée que le serveur accorde', async () => {
    const { fixture } = await mount();

    const days = fixture.componentInstance['days']();

    expect(days.map((tab) => tab.day)).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
  });
});
