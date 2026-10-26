import { computed, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientCart } from '../client-cart.service';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { FR } from '../../copy/fr';
import { ClientCompany } from '../../client-company.service';
import { ClientOrders } from '../../client-orders.service';
import { OrderDoors } from '../../shop/order-doors';
import { OrderAdmissionStore } from '../../shop/order-admission.store';
import { OrderOpeningStore } from '../../shop/order-opening.store';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { FoldPanelRef } from 'fold-ng';

import { PieceRequest } from '../../shop/piece-request.service';
import { GuestIdentityForm } from '../guest-identity-form/guest-identity-form';
import { SalesTermsConsent } from '../sales-terms-consent.service';
import { CartDialog } from './cart-dialog';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

/**
 * Les trois états d'Auth0 que cet écran distingue — et il DOIT les distinguer.
 *
 * ⚠️ `accessToken$` en fait partie sans que l'écran l'appelle : composer le
 * panier réveille le devis (`ShopQuote`), qui demande un jeton. Un doublé qui
 * ne le porte pas laisse une exception remonter hors du test — les cas passent
 * quand même, et vitest prévient alors que ses verts ne valent plus rien.
 */
const auth0 = (isLoading: boolean, isAuthenticated: boolean) => ({
  isLoading: () => isLoading,
  isAuthenticated: () => isAuthenticated,
  accessToken$: () => of('jeton-de-test'),
});

const VISITEUR = auth0(false, false);
const EN_COURS = auth0(true, false);
const RECONNU = auth0(false, true);

interface Monde {
  readonly auth?: unknown;
  /** Les termes ACCORDÉS à la société — vide = aucune société, ou aucun crédit. */
  readonly granted?: readonly string[];
  /** La comptabilité a suspendu le prélèvement (`directDebitBlocked`). */
  readonly blocked?: boolean;
  readonly service?: ServiceChoice | null;
  readonly panier?: boolean;
  /** Le réglage « Ouverture de la boutique » ; absent = pas encore lu (ouvert). */
  readonly opening?: { readonly ordersOpenToB2b: boolean; readonly ordersOpenToB2c: boolean };
  /** Ni retrait ni coursier proposés à qui regarde (2026-10-16) ; absent = servi. */
  readonly unservable?: boolean;
  /** Une exemption couvre qui regarde, boutique fermée (2026-10-26) ; absent = non. */
  readonly exempted?: boolean;
  /** Des CGV publiées pour cette clientèle (la case paraît) ; absent = aucune. */
  readonly cgv?: boolean;
  /** Le serveur vient de refuser des CGV périmées (409). */
  readonly cgvOutdated?: boolean;
}

/**
 * La case des CGV, doublée : publiée ou non, cochée ou non. Sa logique propre
 * (version cochée, relecture au 409) est éprouvée dans
 * `sales-terms-consent.service.spec.ts`.
 */
function consentDouble(published: boolean, outdated: boolean) {
  const checked = signal(false);
  const asked = signal(published);
  return {
    asked,
    checked,
    outdated: signal(outdated),
    blocking: computed(() => asked() && !checked()),
    pageQuery: signal({ pour: 'particulier' }),
    load: (): void => undefined,
    check: (on: boolean): void => {
      checked.set(on);
    },
  };
}

/** Les adresses d'invité que l'écran a soumises à la question de l'exemption. */
let adresses: (string | null)[] = [];

/** Le mode de règlement passé à `place()` — `null` = « le serveur décide ». */
let regle: (string | null)[] = [];

/** Les identités d'invité passées à `placeAsGuest()`. */
let invites: unknown[] = [];

/** Le refus de passation que `ClientOrders` garde pour le panier — `''` = sans message sûr. */
const refus = signal<string | null>(null);

/** Ce que l'écran a demandé aux portes, où il est allé, et s'il s'est fermé. */
let ouvertes: string[] = [];
let visitees: string[] = [];
let fermetures: boolean[] = [];

function boot({
  auth = VISITEUR,
  service = AU_LABO,
  panier = true,
  granted = [],
  blocked = false,
  opening,
  unservable = false,
  exempted = false,
  cgv = false,
  cgvOutdated = false,
}: Monde = {}): ComponentFixture<CartDialog> {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CartDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideWorkspace(workspaceDouble()),
      { provide: AuthFacade, useValue: auth },
      { provide: SalesTermsConsent, useValue: consentDouble(cgv, cgvOutdated) },
      {
        provide: OrderAdmissionStore,
        useValue: {
          admitted: signal(exempted),
          guestTyped: (email: string | null): void => {
            adresses.push(email);
          },
        },
      },
      // Le panier est un DIALOGUE : sa référence de panneau existe toujours
      // quand il est monté, et `close()` est ce qu'il appelle pour partir.
      {
        provide: FoldPanelRef,
        useValue: {
          close: (): void => {
            fermetures.push(true);
          },
        },
      },
      {
        provide: ClientCompany,
        useValue: {
          company: signal(
            granted.length === 0 ? null : { grantedTerms: granted, directDebitBlocked: blocked },
          ),
        },
      },
      {
        provide: ClientOrders,
        useValue: {
          refusal: refus,
          place: (settlement: string | null = null): Promise<null> => {
            regle.push(settlement);
            // `null` : on observe CE QUI EST DEMANDÉ, pas la suite — une
            // commande passée ferait naviguer et quitterait le sujet.
            return Promise.resolve(null);
          },
          placeAsGuest: (buyer: unknown): Promise<null> => {
            invites.push(buyer);
            return Promise.resolve(null);
          },
        },
      },
      // Les portes sont des DIALOGUES : on n'en monte pas le contenu ici, on
      // observe que l'écran les ouvre — et qu'il ne va nulle part pour ça.
      {
        provide: OrderDoors,
        useValue: {
          serviceOffered: signal(!unservable),
          choose: (): Promise<boolean> => {
            ouvertes.push('choose');
            return Promise.resolve(false);
          },
          pickup: (): Promise<boolean> => {
            ouvertes.push('pickup');
            return Promise.resolve(false);
          },
          delivery: (): Promise<boolean> => {
            ouvertes.push('delivery');
            return Promise.resolve(false);
          },
        },
      },
    ],
  });
  ouvertes = [];
  visitees = [];
  fermetures = [];
  regle = [];
  invites = [];
  adresses = [];
  refus.set(null);
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  TestBed.inject(OrderContextStore).choice.set(service);
  const cart = TestBed.inject(ClientCart);
  cart.clear();
  if (panier) {
    cart.add('VIE-001');
  }
  const router = TestBed.inject(Router);
  router.navigate = (commands): Promise<boolean> => {
    visitees.push(Array.isArray(commands) ? commands.join('/') : String(commands));
    return Promise.resolve(true);
  };
  if (opening !== undefined) {
    TestBed.inject(OrderOpeningStore).receive(opening);
  }
  const fixture = TestBed.createComponent(CartDialog);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<CartDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const invite = (fixture: ComponentFixture<CartDialog>): Element | null =>
  el(fixture).querySelector('.who');

const bouton = (fixture: ComponentFixture<CartDialog>): HTMLButtonElement | null =>
  el(fixture).querySelector('.pay');

/** La ligne sous le bouton : ce qui manque, sinon comment on règle. */
const note = (fixture: ComponentFixture<CartDialog>): HTMLElement | null =>
  el(fixture).querySelector('[role="status"].hint');

describe('le panier demande qui commande', () => {
  /**
   * Régression : `place()` rendait `null` en silence pour un visiteur, et
   * `proceed()` commentait « le refus a déjà été dit ». Il ne l'était pas — le
   * clic ne produisait RIEN. L'écran devait le dire ; il ne le disait pas.
   */
  it('retient le règlement et s’explique, devant un visiteur', async () => {
    const fixture = boot({ auth: VISITEUR });

    expect(invite(fixture)).not.toBeNull();
    expect(note(fixture)?.textContent?.trim()).toBe(FR.cart.payBlockedIdentity);
    expect(bouton(fixture)?.getAttribute('aria-describedby')).toBe(note(fixture)?.id);

    bouton(fixture)?.click();
    await fixture.whenStable();

    expect(invites).toEqual([]);
  });

  /**
   * RGAA 11.10 (lot A3) : le bouton grisé ne disait pas ce qui manquait, et un
   * clic ne montrait rien. Le clic montre désormais l'erreur de chaque champ,
   * et porte le focus sur le premier.
   */
  it('au clic sur une saisie incomplète, dit l’erreur de chaque champ et va au premier', async () => {
    const fixture = boot({ auth: VISITEUR });

    expect(bouton(fixture)?.disabled).toBe(false);
    bouton(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const form = el(fixture).querySelector('app-guest-identity-form');
    const fautifs = [...(form?.querySelectorAll('input[aria-invalid="true"]') ?? [])];
    expect(fautifs).toHaveLength(4);
    expect(form?.textContent).toContain(FR.cart.guestFirstNameMissing);
    expect(document.activeElement).toBe(fautifs[0]);
  });

  /**
   * Hugo, 2026-10-11 : « qui passe cette commande » ouvre le panier, la saisie
   * d'invité y est OUVERTE d'office, et « Me connecter » la remplace par la
   * connexion, dans la même carte.
   */
  it('ouvre le panier sur « qui », l’invité choisi d’office et sa saisie dépliée', () => {
    const fixture = boot({ auth: VISITEUR });
    const doors = [...el(fixture).querySelectorAll('.who-door-block')].map((block) => [
      block.querySelector('.who-kicker')?.textContent?.trim(),
      block.querySelector('.who-door')?.textContent?.trim(),
      block.querySelector('.who-door')?.getAttribute('aria-pressed'),
    ]);

    expect(el(fixture).querySelector('.page > *')?.classList).toContain('who');
    expect(doors).toEqual([
      ['Je commande pour la première fois', 'Commander en tant qu’invité', 'true'],
      ["J'ai déjà un compte", 'Me connecter', 'false'],
    ]);
    expect(el(fixture).querySelector('app-guest-identity-form')).not.toBeNull();
  });

  it('l’interrupteur bascule la carte entre la saisie et la connexion', () => {
    const fixture = boot({ auth: VISITEUR });
    const door = (index: number): HTMLButtonElement | undefined =>
      [...el(fixture).querySelectorAll<HTMLButtonElement>('.who-door')][index];

    door(1)?.click();
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-guest-identity-form')).toBeNull();
    expect(el(fixture).querySelector('app-sign-in-choices')).not.toBeNull();
    expect(door(1)?.getAttribute('aria-pressed')).toBe('true');
    expect(bouton(fixture)?.disabled).toBe(true);
    expect(note(fixture)?.textContent?.trim()).toBe(FR.cart.payBlockedSignIn);

    door(0)?.click();
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-guest-identity-form')).not.toBeNull();
    expect(el(fixture).querySelector('app-sign-in-choices')).toBeNull();
  });

  it('règle en invité dès que la saisie est complète', async () => {
    const fixture = boot({ auth: VISITEUR });
    const buyer = { firstName: 'Jean', email: 'jean@exemple.fr', phone: '0612345678' };

    fixture.debugElement
      .query((node) => node.name === 'app-guest-identity-form')
      .triggerEventHandler('identityChange', buyer);
    fixture.detectChanges();
    expect(bouton(fixture)?.disabled).toBe(false);

    bouton(fixture)?.click();
    await fixture.whenStable();

    expect(invites).toEqual([buyer]);
    expect(regle).toEqual([]);
  });

  /**
   * 🔴 **Le cas qui justifie `isLoading()`.** Le SDK Auth0 résout la session au
   * premier chargement, et `isAuthenticated` vaut `false` pendant ce temps-là
   * pour quelqu'un de connecté. Sans cette distinction, un abonné verrait
   * l'invite apparaître puis disparaître — sur l'écran où il s'apprête à payer.
   */
  it('ne demande rien pendant que la session se résout', () => {
    const fixture = boot({ auth: EN_COURS });

    expect(invite(fixture)).toBeNull();
    expect(bouton(fixture)?.disabled).toBe(false);
  });

  it('ne demande rien à qui est déjà reconnu', () => {
    const fixture = boot({ auth: RECONNU });

    expect(invite(fixture)).toBeNull();
    expect(bouton(fixture)?.disabled).toBe(false);
  });

  /**
   * On ne réclame pas une identité à quelqu'un qui n'a rien à acheter : le
   * bouton nomme alors le rayon, et il doit rester cliquable.
   */
  it('ne demande rien devant un panier vide', () => {
    const fixture = boot({ auth: VISITEUR, panier: false });

    expect(invite(fixture)).toBeNull();
    expect(bouton(fixture)?.disabled).toBe(false);
  });

  /** Sans lieu ni heure, la question suivante est « où », pas « qui ». */
  it('laisse passer la question du lieu avant celle de l’identité', () => {
    const fixture = boot({ auth: VISITEUR, service: null });

    expect(invite(fixture)).toBeNull();
    expect(bouton(fixture)?.disabled).toBe(false);
  });
});

/**
 * 🔴 LE PANIER NE QUITTE PLUS L'ÉCRAN POUR DEMANDER OÙ (2026-09-21, Hugo :
 * « le panier devient un dialog comme le reste »).
 *
 * Les trois gestes partaient sur `/nouvelle-commande`, et « Modifier » devait
 * emporter un paramètre de retour pour revenir — la preuve que le détour
 * n'avait pas lieu d'être. Un panier composé qu'on quitte pour répondre à une
 * question est un panier qu'on risque de perdre de vue.
 */
describe('le panier pose la question du lieu SUR PLACE', () => {
  const clic = (fixture: ComponentFixture<CartDialog>, selector: string): void => {
    el(fixture).querySelector<HTMLButtonElement>(selector)?.click();
  };

  /** O6 (2026-10-13) : rien de choisi, c'est « retrait ou coursier ? » qui s'ouvre. */
  it('🔴 pose « retrait ou coursier ? » sans naviguer, quand aucun mode n’est pris', () => {
    const fixture = boot({ auth: RECONNU, service: null });

    clic(fixture, '.ask');

    expect(ouvertes).toEqual(['choose']);
    expect(visitees).toEqual([]);
  });

  it('🔴 « Modifier » rouvre le mode déjà pris, sans naviguer', () => {
    const fixture = boot({ auth: RECONNU, service: AU_LABO });

    clic(fixture, '.change');

    expect(ouvertes).toEqual(['pickup']);
    expect(visitees).toEqual([]);
  });

  /**
   * ⚠️ Et une porte refermée sans choisir ne mène NULLE PART. Le règlement
   * exige le mode : sans lui, partir vers le paiement facturerait un panier
   * sans destination.
   */
  it('🔴 ne règle rien quand la porte se referme sans choix', async () => {
    const fixture = boot({ auth: RECONNU, service: null });

    clic(fixture, '.pay');
    await Promise.resolve();

    expect(ouvertes).toEqual(['choose']);
    expect(visitees).toEqual([]);
  });
});

/**
 * 🔴 **« AU COMPTE » SE DÉCIDE AU PANIER** (Hugo, 2026-09-21 : « la seule chose
 * qui ressemble c'est ajouter au compte, ou paiement direct pour les pros »).
 *
 * Le panier appelait `place()` sans argument : le serveur tranchait seul — au
 * compte si les termes sont accordés, carte sinon. Un pro au mensuel n'avait
 * donc jamais le choix, alors que le contrat dit que payer comptant « est un
 * droit, pas une exception ».
 */
describe('le panier demande COMMENT régler, à qui a le choix', () => {
  const clic = (fixture: ComponentFixture<CartDialog>, label: string): void => {
    const found = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    found.click();
  };

  it('🔴 ne propose RIEN à un particulier : il n’a pas de compte à débiter', () => {
    const fixture = boot({ auth: RECONNU });

    expect(el(fixture).textContent).not.toContain(FR.cart.settleAccount);
  });

  /**
   * ⚠️ Les termes ACCORDÉS, pas le terme souhaité. Le contrat distingue les
   * deux, et confondre une demande avec un droit acquis proposerait un
   * règlement que le serveur refuse par `TermsNotGrantedError`.
   */
  it('🔴 ne le propose pas non plus à une société SANS crédit accordé', () => {
    const fixture = boot({ auth: RECONNU, granted: [] });

    expect(el(fixture).textContent).not.toContain(FR.cart.settleAccount);
  });

  it('🔴 propose les DEUX à une société au mensuel', () => {
    const fixture = boot({ auth: RECONNU, granted: ['monthly'] });

    expect(el(fixture).textContent).toContain(FR.cart.settleAccount);
    expect(el(fixture).textContent).toContain(FR.cart.settleCard);
  });

  /**
   * Le crédit reste accordé quand la comptabilité suspend le prélèvement : lire
   * `grantedTerms` seul proposerait « au compte », que le serveur refuse.
   */
  it('🔴 ne propose plus « au compte » quand le prélèvement est SUSPENDU', async () => {
    const fixture = boot({ auth: RECONNU, granted: ['monthly'], blocked: true });

    expect(el(fixture).textContent).not.toContain(FR.cart.settleAccount);
    expect(el(fixture).textContent).not.toContain(FR.cart.settleTitle);

    // Le seul bouton restant ne demande pas le compte : le serveur tranche.
    el(fixture).querySelector<HTMLButtonElement>('button.pay')?.click();
    await Promise.resolve();
    expect(regle).not.toContain('account');
  });

  it('🔴 envoie « account » quand on ajoute au compte', async () => {
    const fixture = boot({ auth: RECONNU, granted: ['monthly'] });

    clic(fixture, FR.cart.settleAccount);
    await Promise.resolve();

    expect(regle).toEqual(['account']);
  });

  /** Payer comptant reste possible AU MENSUEL : c'est une facilité, pas une obligation. */
  it('🔴 envoie « card » quand la même société paie comptant', async () => {
    const fixture = boot({ auth: RECONNU, granted: ['monthly'] });

    clic(fixture, FR.cart.settleCard);
    await Promise.resolve();

    expect(regle).toEqual(['card']);
  });

  /** Sans choix à l'écran, on ne décide rien : le serveur tranche comme avant. */
  it('laisse le serveur décider quand le choix n’est pas offert', async () => {
    const fixture = boot({ auth: RECONNU });

    clic(fixture, FR.cart.pay.split('{')[0] ?? '');
    await Promise.resolve();

    expect(regle).toEqual([null]);
  });
});

/** « Ouverture de la boutique » (Hugo, 2026-10-09) : fermée, la phrase remplace le bouton. */
describe('la boutique fermée à la commande', () => {
  it('dit « Les commandes sont fermées » à un particulier, sans bouton de commande', () => {
    const fixture = boot({ opening: { ordersOpenToB2b: true, ordersOpenToB2c: false } });

    expect(bouton(fixture)).toBeNull();
    // Un encadré fold, qui dit aussi ce qui reste possible (2026-10-26).
    const callout = el(fixture).querySelector('fold-callout[data-orders-closed]');
    expect(callout?.textContent).toContain(FR.cart.ordersClosed);
    expect(callout?.textContent).toContain(FR.cart.ordersClosedHint);
    // Le panier reste : seule la commande est fermée.
    expect(el(fixture).querySelector('app-cart-summary')).not.toBeNull();
  });

  /** Les exemptions à la fermeture (2026-10-26) : le serveur dit « vous, si ». */
  it('garde le bouton de qui une exemption couvre, sans encadré de fermeture', () => {
    const fixture = boot({
      auth: RECONNU,
      opening: { ordersOpenToB2b: false, ordersOpenToB2c: false },
      exempted: true,
    });

    expect(bouton(fixture)).not.toBeNull();
    expect(el(fixture).querySelector('[data-orders-closed]')).toBeNull();
  });

  it('cache le bouton d’un client connecté qu’aucune exemption ne couvre', () => {
    const fixture = boot({
      auth: RECONNU,
      opening: { ordersOpenToB2b: false, ordersOpenToB2c: false },
    });

    expect(bouton(fixture)).toBeNull();
    expect(el(fixture).querySelector('[data-orders-closed]')).not.toBeNull();
  });

  it('soumet l’adresse complète de l’invité, et l’oublie quand il choisit de se connecter', () => {
    const fixture = boot({ opening: { ordersOpenToB2b: true, ordersOpenToB2c: false } });
    const form = fixture.debugElement
      .query(By.directive(GuestIdentityForm))
      .injector.get(GuestIdentityForm);

    adresses = []; // la saisie vide s'annonce à l'ouverture
    form.identityChange.emit({ firstName: 'Camille', email: 'camille@visiteur.fr', phone: '06' });
    const doors = el(fixture).querySelectorAll<HTMLButtonElement>('.who-door');
    doors[1]?.click();

    expect(adresses).toEqual(['camille@visiteur.fr', null]);
  });

  it('garde le bouton d’un particulier quand seule la boutique pro est fermée', () => {
    const fixture = boot({ opening: { ordersOpenToB2b: false, ordersOpenToB2c: true } });

    expect(bouton(fixture)).not.toBeNull();
    expect(el(fixture).textContent).not.toContain(FR.cart.ordersClosed);
  });

  it('garde le bouton tant que le réglage n’est pas lu', () => {
    const fixture = boot();

    expect(bouton(fixture)).not.toBeNull();
  });
});

/**
 * Hugo, 2026-10-14 : « pas de commande sans créneau ». Un choix relu du
 * navigateur, posé avant, peut porter le mode sans la fenêtre : on ne la
 * présélectionne pas, on grise « Régler » et on dit le geste.
 */
describe('le panier exige un créneau choisi', () => {
  const SANS_CRENEAU: ServiceChoice = { ...AU_LABO, slot: '', window: null };

  it('🔴 grise le règlement et dit quoi faire, sans rien envoyer', async () => {
    const fixture = boot({ auth: RECONNU, service: SANS_CRENEAU });

    expect(bouton(fixture)?.disabled).toBe(true);
    expect(el(fixture).querySelector('[data-slot-missing]')?.textContent?.trim()).toBe(
      FR.cart.slotMissing,
    );
    expect(bouton(fixture)?.getAttribute('aria-describedby')).toBe(note(fixture)?.id);
    bouton(fixture)?.click();
    await Promise.resolve();
    expect(regle).toEqual([]);
  });

  it('laisse régler dès que le créneau est choisi', () => {
    const fixture = boot({ auth: RECONNU, service: AU_LABO });

    expect(bouton(fixture)?.disabled).toBe(false);
    expect(el(fixture).querySelector('[data-slot-missing]')).toBeNull();
  });
});

/**
 * 2026-10-16 : plus de site par défaut — le retrait peut être fermé à une
 * clientèle. Sans retrait ni coursier, le panier le dit au lieu de poser une
 * question dont toutes les réponses mènent au refus.
 */
describe('CartDialog — ni retrait ni livraison', () => {
  it('🔴 dit qu’on ne peut pas servir, et grise le règlement', () => {
    const fixture = boot({ service: null, unservable: true });

    expect(el(fixture).querySelector('[data-no-service]')?.textContent).toContain(
      FR.shop.noService,
    );
    expect(el(fixture).querySelector('.ask')).toBeNull();
    const pay = el(fixture).querySelector<HTMLButtonElement>('button.pay');
    expect(pay?.disabled).toBe(true);
  });

  it('pose la question quand une porte est ouverte', () => {
    const fixture = boot({ service: null });

    expect(el(fixture).querySelector('[data-no-service]')).toBeNull();
    expect(el(fixture).querySelector('.ask')).not.toBeNull();
  });
});

describe('CartDialog — la suggestion ouvre une fiche', () => {
  it('se referme quand une fiche est demandée après son ouverture, pour qu’elle se voie', () => {
    const fixture = boot();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fermetures = [];

    TestBed.inject(PieceRequest).open('PAI-001');
    TestBed.tick();
    fixture.detectChanges();

    expect(fermetures).toEqual([true]);
  });
});

/**
 * Hugo, 2026-10-26 : « sur chaque commande, une checkbox au panier : j'accepte
 * les conditions générales de vente (lien) ». Le bouton attend la case ; sans
 * texte publié, pas de case.
 */
describe('le panier fait accepter les CGV', () => {
  const caseCgv = (fixture: ComponentFixture<CartDialog>): Element | null =>
    el(fixture).querySelector('[data-sales-terms]');

  it('grise Commander tant que la case n’est pas cochée, puis le rend', () => {
    const fixture = boot({ auth: RECONNU, cgv: true });

    expect(caseCgv(fixture)?.textContent).toContain(FR.cart.salesTermsAccept);
    expect(bouton(fixture)?.disabled).toBe(true);

    TestBed.inject(SalesTermsConsent).check(true);
    fixture.detectChanges();

    expect(bouton(fixture)?.disabled).toBe(false);
  });

  /** RGAA 11.10/11.11 (lot A3) : la raison est À CÔTÉ du bouton, et le bouton la cite. */
  it('dit pourquoi Commander est grisé, et relie la phrase au bouton', () => {
    const fixture = boot({ auth: RECONNU, cgv: true });

    expect(note(fixture)?.textContent?.trim()).toBe(FR.cart.payBlockedTerms);
    expect(bouton(fixture)?.getAttribute('aria-describedby')).toBe(note(fixture)?.id);

    TestBed.inject(SalesTermsConsent).check(true);
    fixture.detectChanges();

    expect(note(fixture)?.textContent?.trim()).toBe(FR.cart.payHint);
    expect(bouton(fixture)?.getAttribute('aria-describedby')).toBeNull();
  });

  /** RGAA 13.2 (lot A3) : le nouvel onglet se dit dans le nom du lien. */
  it('le nom du lien annonce le nouvel onglet', () => {
    const fixture = boot({ auth: RECONNU, cgv: true });

    expect(caseCgv(fixture)?.querySelector('a')?.getAttribute('aria-label')).toBe(
      `${FR.cart.salesTermsLink} (nouvel onglet)`,
    );
  });

  it('le lien mène à la page CGV, dans un nouvel onglet', () => {
    const fixture = boot({ auth: RECONNU, cgv: true });
    const lien = caseCgv(fixture)?.querySelector('a');

    expect(lien?.textContent?.trim()).toBe(FR.cart.salesTermsLink);
    expect(lien?.getAttribute('target')).toBe('_blank');
    expect(lien?.getAttribute('href')).toBe('/cgv?pour=particulier');
  });

  /** Pré-audit RGAA 2026-10-26 : la case était nommée par un `ariaLabel` doublant le texte voisin. */
  it('la case est nommée par sa phrase projetée, lien compris', () => {
    const fixture = boot({ auth: RECONNU, cgv: true });
    const input = caseCgv(fixture)?.querySelector('input[type="checkbox"]');
    const ids = input?.getAttribute('aria-labelledby') ?? '';
    const nom = ids
      .split(' ')
      .map((id) => el(fixture).querySelector(`[id="${id}"]`)?.textContent ?? '')
      .join(' ');

    expect(input?.getAttribute('aria-label')).toBeNull();
    expect(nom).toContain(FR.cart.salesTermsAccept);
    expect(nom).toContain(FR.cart.salesTermsLink);
  });

  it('les mêmes règles pour l’invité', () => {
    const fixture = boot({ cgv: true });

    expect(caseCgv(fixture)).not.toBeNull();
    expect(bouton(fixture)?.disabled).toBe(true);
  });

  it('sans CGV publiées : pas de case, et rien n’est retenu', () => {
    const fixture = boot({ auth: RECONNU });

    expect(caseCgv(fixture)).toBeNull();
    expect(bouton(fixture)?.disabled).toBe(false);
  });

  it('dit que les CGV ont changé après un refus du serveur', () => {
    const fixture = boot({ auth: RECONNU, cgv: true, cgvOutdated: true });

    expect(el(fixture).querySelector('[data-terms-outdated]')?.textContent?.trim()).toBe(
      FR.cart.salesTermsOutdated,
    );
    expect(el(fixture).querySelector('[data-terms-outdated]')?.getAttribute('role')).toBe('status');
  });

  /**
   * RGAA 11.10 (lot A3) : le refus de la passation était un toast, inerte
   * derrière le voile du dialogue. Il se dit dans le panier, et s'annonce.
   */
  it('dit le refus du serveur dans le panier, annoncé', () => {
    const fixture = boot({ auth: RECONNU });
    refus.set('L’heure limite est dépassée.');
    fixture.detectChanges();

    const callout = el(fixture).querySelector('[data-place-refused]');
    expect(callout?.textContent?.trim()).toBe('L’heure limite est dépassée.');
    expect(callout?.getAttribute('role')).toBe('alert');

    refus.set('');
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-place-refused]')?.textContent?.trim()).toBe(
      FR.cart.placeFailed,
    );
  });

  it('pas de case devant un panier vide', () => {
    const fixture = boot({ auth: RECONNU, cgv: true, panier: false });

    expect(caseCgv(fixture)).toBeNull();
  });
});
