import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientAudience } from '../client-audience.service';
import { ClientIdentity } from '../client-identity.service';
import { ClientWorkspace } from '../client-workspace.service';
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

/**
 * 🔴 QUI REGARDE — et il se DÉCLARE, il ne se subit plus.
 *
 * Ces montages ne posaient ni la session ni l'espace : les vrais services
 * répondaient, et l'écran s'est mis à rendre la page d'un PRO le jour où
 * `/bienvenue` a appris à en servir une (2026-09-20). Trois tests qui
 * parlaient des maisons ont échoué sans qu'aucun ne parle de qui les regarde
 * — c'est le signe qu'ils reposaient sur un état non dit.
 */
type Regard = 'visiteur' | 'perso' | 'pro';

function whoProviders(who: Regard): readonly unknown[] {
  const company = who === 'pro' ? { raisonSociale: 'Tommeuses SAS' } : null;
  // ⚠️ La doublure de l'espace porte TOUTE sa surface de lecture, pas seulement
  // ce que l'écran regarde : d'autres services du même arbre lisent `current`,
  // et une doublure partielle échoue à l'exécution, pas à la compilation.
  return [
    { provide: AuthFacade, useValue: { isAuthenticated: signal(who !== 'visiteur') } },
    {
      provide: ClientWorkspace,
      useValue: {
        current: signal(who === 'pro' ? 'c1' : null),
        company: signal(company),
        isPersonal: signal(who !== 'pro'),
        hasChoice: signal(who === 'pro'),
        options: signal([]),
      },
    },
    { provide: ClientIdentity, useValue: { firstName: signal(null) } },
  ];
}

async function mount(
  points: readonly PickupAddressView[],
  shop: 'order' | 'browse' | 'closed' = 'order',
  who: Regard = 'visiteur',
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
      ...whoProviders(who),
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
        ...whoProviders('visiteur'),
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

describe('AccueilPublic — les trois états', () => {
  const POINTS = [point({ id: 'a' }), point({ id: 'b', label: 'Le Village' })];

  it('accueille un VISITEUR par les trois verbes, et lui garde le bandeau', async () => {
    const fixture = await mount(POINTS, 'order', 'visiteur');

    expect(fixture.nativeElement.textContent).toContain('Bienvenue');
    expect(fixture.nativeElement.querySelector('.banner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-service-doors')).toBeNull();
  });

  /**
   * 🔴 LE PERSO SUIT LE PARCOURS DU VISITEUR. Il n'a qu'un mode de service,
   * donc rien à arbitrer : seule son ACCROCHE le reconnaît.
   */
  it('reconnaît un PERSO sans rien changer d’autre', async () => {
    const fixture = await mount(POINTS, 'order', 'perso');

    expect(fixture.nativeElement.textContent).toContain('Nouvelle commande');
    expect(fixture.nativeElement.querySelector('.banner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-service-doors')).toBeNull();
    expect(fixture.nativeElement.querySelector('.pro-pill')).toBeNull();
  });

  /**
   * 🔴 UN PRO EST QUELQU'UN QUI A UNE SOCIÉTÉ, VALIDÉE OU NON. La clientèle
   * reste `b2c` ici — le dossier n'est pas validé — et les deux portes
   * paraissent quand même : c'est exactement le cas que la règle du
   * 2026-09-20 a ouvert.
   */
  /**
   * 🔴 LA MENTION DE LA PORTE EST LA REMISE RÉELLE, et « jusqu'à » parce que
   * c'est un MAXIMUM : les maisons n'ont pas toutes la même. Elle vient de la
   * fonction que lisent aussi le rail et le panier — un second calcul serait
   * une seconde occasion d'annoncer un autre pourcentage.
   */
  it('annonce sur la porte la MEILLEURE remise de retrait', async () => {
    const fixture = await mount(
      [point({ id: 'a' }), point({ id: 'b', label: 'Le Village', discount: DIX })],
      'order',
      'pro',
    );

    expect(
      fixture.nativeElement.querySelector('.door-pickup .door-note')?.textContent?.trim(),
    ).toBe('Jusqu’à −10 %');
  });

  /**
   * ⚠️ Sans remise déclarée, la mention DISPARAÎT — elle n'annonce pas
   * « jusqu'à −0 % ». C'est la règle des preuves de cet écran, et la porte n'y
   * échappe pas.
   */
  it('ne met AUCUNE mention sur la porte quand il n’y a pas de remise', async () => {
    const fixture = await mount(POINTS, 'order', 'pro');

    expect(fixture.nativeElement.querySelector('.door-pickup .door-note')).toBeNull();
  });

  it('dit les trois étapes dans la voix d’un PRO', async () => {
    const fixture = await mount(POINTS, 'order', 'pro');
    const labels = [...fixture.nativeElement.querySelectorAll('.step-label')].map((node: Element) =>
      node.textContent?.trim(),
    );

    expect(labels).toEqual([
      'Je choisis mon acheminement',
      'Je choisis l’heure',
      'Je compose mon panier',
    ]);
  });

  it('donne ses deux portes à un PRO même non validé, à la place du bandeau', async () => {
    const fixture = await mount(POINTS, 'order', 'pro');

    expect(fixture.nativeElement.querySelector('app-service-doors')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.banner')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.pro-pill')).toHaveLength(3);
  });

  /**
   * 🔴 « ON RÉPOND » DANS LES TROIS ÉTATS (Hugo, 2026-09-20 : « on répond
   * toujours »), là où la maquette réservait la bande au pro. Le sur-titre ne
   * bouge pas — c'est un fait sur la maison — et c'est le TEXTE qui suppose une
   * question différente selon qui lit.
   *
   * Les trois assertions tiennent ensemble : une seule d'entre elles laisserait
   * passer une bande qui parle à tout le monde de la même chose, ce qui est
   * exactement ce qu'on ne veut pas.
   */
  it.each([
    ['visiteur', 'Un buffet, un gros volume'],
    ['perso', 'Changer l’heure, ajouter une pièce'],
    ['pro', 'Un ajout passe encore par téléphone'],
  ] as const)('répond à un %s dans ses mots', async (who, fragment) => {
    const fixture = await mount(POINTS, 'order', who);
    const band = fixture.nativeElement.querySelector('app-contact-band');

    expect(band?.querySelector('.kicker')?.textContent?.trim()).toBe('On répond');
    expect(band?.querySelector('.who')?.textContent).toContain(fragment);
  });
});
