import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { instantToLocal, type PublicPickupSlot } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientLocale } from '../../client-locale.service';
import { PublicSlots } from '../public-slots.gateway';
import { CHANGE_DAY, SlotPickerDialog, type SlotPickerData } from './slot-picker-dialog';
import { ShopCopyOverrides } from '../../copy/shop-copy-overrides';

/**
 * **Le sélecteur d'heure public.**
 *
 * Trois choses s'y jouent qu'aucun typecheck ne voit : l'écran ne doit pas dire
 * « aucun créneau » pendant qu'il lit, un créneau complet doit rester VISIBLE et
 * fermé en nommant la suivante, et le bouton doit porter l'heure retenue plutôt
 * qu'un « Continuer » qui obligerait à remonter pour vérifier.
 */

/** Le jour du panneau — relatif à maintenant, jamais un jour du calendrier. */
const DAY = instantToLocal(new Date()).day;

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
  day: DAY,
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

  /**
   * 🔴 LA CARTE NE DIT QUE L'HEURE DE DÉBUT (Hugo, 2026-09-20 : « au niveau des
   * horaires on ne donne que la première heure »).
   *
   * Elle a porté l'intervalle quelques heures — les deux bornes sont dans le
   * contrat — mais ce point découpe au quart d'heure : la seconde borne se
   * déduisait de la tuile suivante, et douze cartes répétaient deux fois la
   * même information. On choisit une heure, pas une fenêtre.
   */
  it('ne donne que l’heure de début', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '07:00', endAt: `${DAY}T06:00:00.000Z` })]);
    await fixture.whenStable();
    fixture.detectChanges();

    // L'espace avant le `h` est INSÉCABLE — c'est l'écriture française que
    // `formatHour` pose.
    expect((fixture.nativeElement as HTMLElement).querySelector('.hour')?.textContent?.trim()).toBe(
      '7\u00a0h',
    );
  });

  /**
   * 🔴 LE BADGE TITRE SA FOURNÉE, il n'est plus une pastille par carte. Il
   * désigne une PLAGE, pas une heure : répété sur les quatre cartes d'une même
   * fournée, il se lisait comme un attribut du créneau.
   *
   * Deux plages distantes qui portent le même badge restent deux groupes — ce
   * sont deux moments de la journée, et les fondre en inventerait un troisième.
   */
  it('groupe les créneaux par fournée, et ne fond pas deux plages distantes', async () => {
    const { fixture, slots } = await mount();
    slots.serve([
      slot({ time: '07:00', badge: 'Première fournée' }),
      slot({ time: '07:30', badge: 'Première fournée' }),
      slot({ time: '16:00', badge: 'Tout est chaud' }),
      slot({ time: '17:00', badge: 'Première fournée' }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.batch-label')].map(
      (node) => node.textContent?.trim(),
    );
    const grilles = (fixture.nativeElement as HTMLElement).querySelectorAll('.slots');

    expect(labels).toEqual(['Première fournée', 'Tout est chaud', 'Première fournée']);
    expect(grilles).toHaveLength(3);
    expect(grilles[0]?.querySelectorAll('.slot')).toHaveLength(2);
  });

  /**
   * Des créneaux sans badge gardent leur grille SANS sur-titre : un groupe
   * nommé « Autres » serait un nom qu'on aurait inventé.
   */
  it('ne titre pas un groupe que le vendeur n’a pas nommé', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '07:00' }), slot({ time: '07:30' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.batch-label')).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.slot')).toHaveLength(2);
  });

  it('dit sous chaque heure ce qu’elle vaut', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '07:00' }), slot({ time: '08:00', open: false })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const etats = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.state')].map(
      (node) => node.textContent?.trim(),
    );

    expect(etats).toEqual(['Ouvert', 'Complet']);
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

  /**
   * Un clic sur une heure AVANCE (plan `plan-barre-qui-accompagne.md`, Hugo,
   * 2026-10-27) : plus de pied, plus de « Je prends … ».
   */
  it('🔴 un clic sur une heure ferme sur ce créneau, sans bouton de validation', async () => {
    const { fixture, slots, closed } = await mount();
    slots.serve([slot({ time: '06:30' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('fold-panel-footer')).toBeNull();
    expect(root.querySelector('button.slot')).not.toBeNull();
    (root.querySelector('button.slot') as HTMLButtonElement).click();

    expect(closed).toHaveLength(1);
    expect((closed[0] as PublicPickupSlot).time).toBe('06:30');
  });

  it('🔴 un créneau complet ne se prend pas, même appelé directement', async () => {
    // La garde est dans le composant et pas seulement dans l'attribut désactivé :
    // un gabarit qui oublierait `disabled` ne doit pas pouvoir vendre une heure
    // pleine.
    const { fixture, closed } = await mount();

    fixture.componentInstance['pick'](slot({ time: '12:30', open: false }));

    expect(closed).toHaveLength(0);
  });

  it('porte la barre du panier en pied', async () => {
    const { fixture } = await mount();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-cart-bar')).not.toBeNull();
  });
});

/**
 * Hugo, 2026-10-11 : « si une heure a été choisie, elle devrait être
 * highlight avec le badge Votre choix comme l'étape 1 ».
 */
describe('SlotPickerDialog — le créneau déjà retenu', () => {
  it('s’ouvre sur son jour, le présélectionne et le badge « Votre choix »', async () => {
    const { fixture, slots } = await mount({ ...DATA, current: { day: DAY, time: '07:15' } });
    slots.serve([slot({ time: '06:30' }), slot({ time: '07:15' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(slots.asked).toEqual([DAY]);
    expect(fixture.componentInstance['picked']()?.time).toBe('07:15');
    const tagged = (fixture.nativeElement as HTMLElement).querySelectorAll('.slot .tag');
    expect(tagged).toHaveLength(1);
    expect(plain(tagged[0]?.closest('.slot')?.textContent ?? '')).toContain('7 h 15');
    expect(tagged[0]?.textContent).toContain('Votre choix');
  });

  it('ne présélectionne pas un créneau retenu devenu complet, mais le badge encore', async () => {
    const { fixture, slots } = await mount({ ...DATA, current: { day: DAY, time: '07:15' } });
    slots.serve([slot({ time: '07:15', open: false })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['picked']()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.slot .tag')).not.toBeNull();
  });

  it('sans choix retenu, aucun badge ni présélection', async () => {
    const { fixture, slots } = await mount();
    slots.serve([slot({ time: '07:15' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance['picked']()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.slot .tag')).toBeNull();
  });

  /** Lot T4 des textes : un remplacement reçu redessine l'écran, sans rechargement. */
  it('se redessine quand un remplacement de son texte arrive', async () => {
    const { fixture } = await mount();
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'slotPicker.title': 'Quelle heure ?' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.screen')?.textContent).toBe(
      'Quelle heure ?',
    );
  });
});

/** Le jour se choisit à un seul endroit : le panneau du jour (Hugo, 2026-10-27). */
describe('SlotPickerDialog — le jour, un fait', () => {
  it('affiche le jour reçu, et c’est lui qui est lu', async () => {
    const { fixture, slots } = await mount();
    const el = fixture.nativeElement as HTMLElement;

    expect(slots.asked).toEqual([DAY]);
    expect(el.querySelectorAll('.days .day')).toHaveLength(1);
    expect(el.querySelector('.days .day.on')?.textContent?.trim()).toBe('Aujourd’hui');
  });

  it('« Je change de date » ferme sur CHANGE_DAY', async () => {
    const { fixture, closed } = await mount();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.change-day')?.click();

    expect(closed).toEqual([CHANGE_DAY]);
  });
});
