import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../client-audience.service';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { ServicePoints } from '../shop/pickup-points.store';
import { AccueilPublic } from './accueil-public';

/**
 * **L'accueil public** — ce que voit un visiteur sans compte.
 *
 * Trois choses s'y jouent, et aucune ne se voit au typecheck : le drapeau « le
 * plus avantageux » ne doit se poser qu'UNE fois, la preuve de remise doit
 * DISPARAÎTRE faute de remise plutôt qu'annoncer un zéro, et l'écran ne doit
 * jamais dire « aucune maison » pendant qu'il charge.
 */

function point(over: Partial<PickupAddressView> & { id: string }): PickupAddressView {
  return {
    label: 'Le Labo',
    ligne1: 'route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: false,
    discount: null,
    discountAudiences: { b2b: true, b2c: true },
    opening: { publicOpening: null, proPickup: null },
    ...over,
  };
}

/** Deux points à −10 % : le drapeau ne doit en marquer qu'un. */
const DIX = { mode: 'percent', bp: 1000 } as const;

class FakePoints {
  readonly pickups = signal<readonly PickupAddressView[]>([]);
  hydrate(): Promise<void> {
    return Promise.resolve();
  }
}

async function mount(
  points: readonly PickupAddressView[],
  shop: 'order' | 'browse' | 'closed' = 'order',
): Promise<ComponentFixture<AccueilPublic>> {
  const store = new FakePoints();
  store.pickups.set(points);
  TestBed.configureTestingModule({
    imports: [AccueilPublic],
    providers: [
      provideRouter([]),
      { provide: ServicePoints, useValue: store },
      { provide: ClientAudience, useValue: { shown: signal('b2c' as const) } },
      { provide: ClientFeatureAccess, useValue: { shop: signal(shop) } },
    ],
  });
  const fixture = TestBed.createComponent(AccueilPublic);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AccueilPublic — ce que les maisons annoncent', () => {
  it('🔴 ne marque QU’UNE maison « le plus avantageux »', async () => {
    // Deux points à la même remise : deux drapeaux ne diraient plus rien.
    const fixture = await mount([
      point({ id: 'a', discount: DIX }),
      point({ id: 'b', label: 'Le Village', discount: DIX }),
    ]);

    const flagged = fixture.componentInstance['houses']().filter((house) => house.best);

    expect(flagged).toHaveLength(1);
  });

  it('dit son tarif à un point sans remise, jamais rien', async () => {
    const fixture = await mount([point({ id: 'a' })]);

    expect(fixture.componentInstance['houses']()[0]?.offer.label).not.toBe('');
    expect(fixture.componentInstance['houses']()[0]?.offer.hasOffer).toBe(false);
  });

  it('🔴 n’annonce AUCUNE remise quand il n’y en a pas', async () => {
    // « −0 % au retrait » serait une promesse vide écrite en gros.
    const fixture = await mount([point({ id: 'a' })]);

    expect(fixture.componentInstance['bestLabel']()).toBeNull();
  });

  it('annonce la meilleure remise quand il y en a une', async () => {
    const fixture = await mount([point({ id: 'a', discount: DIX })]);

    expect(fixture.componentInstance['bestLabel']()).toContain('10');
  });
});

describe('AccueilPublic — l’heure d’ouverture', () => {
  it('annonce la PLUS MATINALE des ouvertures publiques', async () => {
    const fixture = await mount([
      point({
        id: 'a',
        opening: { publicOpening: { start: '07:00', end: '19:00' }, proPickup: null },
      }),
      point({
        id: 'b',
        opening: { publicOpening: { start: '06:30', end: '19:00' }, proPickup: null },
      }),
    ]);

    expect(fixture.componentInstance['opensAt']()).toContain('6');
    expect(fixture.componentInstance['opensAt']()).toContain('30');
  });

  it('🔴 ne dit rien quand aucun point ne reçoit de public', async () => {
    // `publicOpening: null` = le point ne reçoit pas de public. Afficher une
    // heure prise ailleurs — le créneau PRO, par exemple — ferait venir un
    // visiteur devant une porte qui ne lui est pas ouverte.
    const fixture = await mount([
      point({
        id: 'a',
        opening: { publicOpening: null, proPickup: { start: '05:00', end: '06:00' } },
      }),
    ]);

    expect(fixture.componentInstance['opensAt']()).toBeNull();
  });
});

describe('AccueilPublic — ce qu’il refuse de dire', () => {
  it('🔴 ne dit pas « aucune maison » tant qu’il n’a pas lu', async () => {
    // Le magasin laisse ses listes vides pendant l'attente ET quand il n'y a
    // rien : sans le drapeau, l'écran affirmerait le second pendant le premier.
    const store = new FakePoints();
    TestBed.configureTestingModule({
      imports: [AccueilPublic],
      providers: [
        provideRouter([]),
        { provide: ServicePoints, useValue: store },
        { provide: ClientAudience, useValue: { shown: signal('b2c' as const) } },
        { provide: ClientFeatureAccess, useValue: { shop: signal('order' as const) } },
      ],
    });
    const fixture = TestBed.createComponent(AccueilPublic);
    fixture.detectChanges();

    expect(fixture.componentInstance['ready']()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Aucune maison');
  });

  it('🔴 ne coche AUCUNE étape à l’arrivée', async () => {
    // Le visiteur qui arrive n'a rien choisi. Une étape marquée franchie
    // annoncerait un choix qui n'a pas eu lieu ; la première est COURANTE, et
    // les deux suivantes attendent des surfaces qui n'existent pas encore.
    const fixture = await mount([point({ id: 'a' })]);

    const done = fixture.nativeElement.querySelectorAll('.step.is-done');
    const current = fixture.nativeElement.querySelectorAll('.step.is-current');

    expect(done).toHaveLength(0);
    expect(current).toHaveLength(1);
  });

  it('🔴 ne dit pas « faites défiler » quand tout tient à l’écran', async () => {
    // Le rail ne déborde pas ici (aucune largeur en test) : annoncer le geste
    // demanderait quelque chose qui ne mène nulle part. Le compte des maisons,
    // lui, reste — c'est un fait, pas une consigne.
    const fixture = await mount([point({ id: 'a' }), point({ id: 'b', label: 'Le Village' })]);

    expect(fixture.componentInstance['railOverflows']()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.dot')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('faites défiler');
    expect(fixture.nativeElement.textContent).toContain('2 maisons');
  });

  it('🔴 ferme les maisons quand la boutique ne prend pas de commande', async () => {
    // Le refus précède l'effort : faire choisir une heure pour une boutique
    // fermée ferait arriver le refus APRÈS la saisie.
    const fixture = await mount([point({ id: 'a' })], 'browse');

    expect(fixture.componentInstance['canOrder']()).toBe(false);
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button.house');
    expect(button?.disabled).toBe(true);
  });
});
