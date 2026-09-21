import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerOrderLineView, CustomerOrderView, PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientAudience } from '../client-audience.service';
import { ClientIdentity } from '../client-identity.service';
import { ClientWorkspace } from '../client-workspace.service';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { ClientCart } from '../cart/client-cart.service';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { ServicePoints } from '../shop/pickup-points.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
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

/**
 * Le panier et la vitrine, doublés ensemble : « refaire » les traverse tous les
 * deux, et c'est leur ACCORD qu'on éprouve — ce que la vitrine ne connaît plus
 * ne doit pas entrer dans le panier.
 *
 * `sold` est la liste des SKU encore au rayon ; tout le reste est retiré.
 */
class FakeShop {
  constructor(private readonly sold: readonly string[]) {}
  readonly posed = new Map<string, number>();
  hydrate(): Promise<void> {
    return Promise.resolve();
  }
  itemOf(sku: string): { readonly sku: string } | null {
    return this.sold.includes(sku) ? { sku } : null;
  }
  clear(): void {
    this.posed.clear();
  }
  setQuantity(sku: string, quantity: number): void {
    this.posed.set(sku, quantity);
  }
}

/**
 * La dernière commande. Écrite depuis le fixture PARTAGÉ et non castée depuis
 * un objet partiel : un champ ajouté demain à `CustomerOrderView` doit faire
 * rougir le fixture, pas passer sous un `as`.
 */
function order(over: Partial<CustomerOrderView> = {}): CustomerOrderView {
  // 🔴 `placedAt` dit une INTENTION relative à maintenant. Une date du
  // calendrier ferait virer ce test au rouge tout seul le jour où elle sort de
  // la fenêtre d'une semaine — sans qu'une ligne de code ait bougé.
  return { ...LIVE_PICKUP, placedAt: new Date().toISOString(), ...over };
}

function line(productName: string, quantity: number, sku = productName): CustomerOrderLineView {
  return { ...LIVE_PICKUP.lines[0]!, sku, productName, quantity };
}

async function mount(
  points: readonly PickupAddressView[],
  shop: 'order' | 'browse' | 'closed' = 'order',
  who: Regard = 'visiteur',
  orders: readonly CustomerOrderView[] = [],
  sold: readonly string[] = [],
  publicDelivery: 'closed' | 'open' = 'closed',
): Promise<ComponentFixture<AccueilPublic>> {
  const store = new FakePoints();
  store.pickups.set(points);
  const boutique = new FakeShop(sold);
  TestBed.configureTestingModule({
    imports: [AccueilPublic],
    providers: [
      provideRouter([]),
      { provide: ServicePoints, useValue: store },
      { provide: ClientAudience, useValue: { shown: signal('b2c' as const) } },
      {
        provide: ClientFeatureAccess,
        // ⚠️ `publicDelivery` FERMÉE, comme le catalogue : la porte du coursier
        // d'un b2c dépend d'elle depuis le 2026-09-21, et un doublé qui
        // l'ouvrirait ferait passer ces cas pour une règle qu'ils n'éprouvent
        // pas. Le cas qui l'éprouve la pose lui-même.
        useValue: { shop: signal(shop), publicDelivery: signal(publicDelivery) },
      },
      { provide: ClientOrderHistory, useValue: { orders: signal(orders) } },
      { provide: ShopCatalogue, useValue: boutique },
      { provide: ClientCart, useValue: boutique },
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
        { provide: ClientOrderHistory, useValue: { orders: signal([]) } },
        { provide: ShopCatalogue, useValue: new FakeShop([]) },
        { provide: ClientCart, useValue: new FakeShop([]) },
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
  /**
   * 🔴 PAS DE COMMANDE, PAS DE CARTE. La même carte existe sur
   * `/nouvelle-commande` avec ses articles écrits en dur : elle montre la
   * commande de personne, et propose de refaire ce qu'on n'a jamais commandé.
   */
  it('ne propose PAS de reprendre quand il n’y a rien à reprendre', async () => {
    const fixture = await mount(POINTS, 'order', 'perso');

    expect(fixture.nativeElement.querySelector('app-shop-shortcuts')).toBeNull();
  });

  it('dit la VRAIE dernière commande — ses articles et son lieu', async () => {
    const fixture = await mount(POINTS, 'order', 'perso', [
      order({ lines: [line('traditions', 2), line('croissants', 4)] }),
    ]);

    expect(fixture.nativeElement.querySelector('.sub')?.textContent?.trim()).toBe(
      '2 traditions, 4 croissants · retrait : Le Labo',
    );
  });

  /**
   * 🔴 Au-delà d'une semaine, AUCUN JOUR N'EST NOMMÉ : « comme mardi dernier »
   * pour une commande d'il y a trois semaines désigne un mardi que le client
   * n'a pas vécu. La fixture dit une intention relative, jamais une date.
   */
  it('ne nomme pas de jour pour une commande trop ancienne', async () => {
    const vieille = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const fixture = await mount(POINTS, 'order', 'perso', [order({ placedAt: vieille })]);

    expect(fixture.nativeElement.querySelector('.title')?.textContent?.trim()).toBe(
      'Comme votre dernière commande ?',
    );
  });

  /**
   * 🔴 CE QUE LE RAYON NE VEND PLUS SE DIT, et l'écran NE PART PAS. Le panier
   * laisse tomber une référence inconnue sans un mot ; le manque se serait
   * découvert à la caisse.
   */
  it('refait le panier et retient l’écran quand un article a disparu', async () => {
    const fixture = await mount(
      POINTS,
      'order',
      'perso',
      [order({ lines: [line('tradition', 2, 'TRAD'), line('éclair', 1, 'ECLAIR')] })],
      ['TRAD'],
    );

    await fixture.componentInstance['reorder']();
    fixture.detectChanges();

    expect(fixture.componentInstance['reorderGone']()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('ne sont plus au rayon');
  });

  /**
   * 🔴 UN VISITEUR NE VOIT NI LA REPRISE NI LES SUIVIS (Hugo, 2026-09-20), même
   * quand le magasin porte encore les commandes du compte précédent.
   *
   * Le magasin est `providedIn: 'root'` et ne se vide pas à la déconnexion :
   * se fier à « la liste est vide » faisait lire « Comme jeudi dernier » sur la
   * commande de quelqu'un d'autre. La condition est la RECONNAISSANCE.
   *
   * La fixture pose donc exprès un historique NON vide sur un visiteur — c'est
   * le seul montage qui prouve quelque chose.
   */
  it('🔴 ne montre ni reprise ni suivis à un VISITEUR, même avec un historique en mémoire', async () => {
    const fixture = await mount(POINTS, 'order', 'visiteur', [order({ lines: [line('a', 1)] })]);

    expect(fixture.nativeElement.querySelector('app-shop-shortcuts')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-live-orders-well')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Comme');
  });

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
