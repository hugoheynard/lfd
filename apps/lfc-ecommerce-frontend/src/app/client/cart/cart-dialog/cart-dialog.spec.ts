import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientCart } from '../client-cart.service';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { FR } from '../../copy/fr';
import { ClientCompany } from '../../client-company.service';
import { ClientOrders } from '../../client-orders.service';
import { OrderDoors } from '../../shop/order-doors';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { FoldPanelRef } from 'fold-ng';

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
  readonly service?: ServiceChoice | null;
  readonly panier?: boolean;
}

/** Le mode de règlement passé à `place()` — `null` = « le serveur décide ». */
let regle: (string | null)[] = [];

/** Ce que l'écran a demandé aux portes, où il est allé, et s'il s'est fermé. */
let ouvertes: string[] = [];
let visitees: string[] = [];
let fermetures: boolean[] = [];

function boot({
  auth = VISITEUR,
  service = AU_LABO,
  panier = true,
  granted = [],
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
        useValue: { company: signal(granted.length === 0 ? null : { grantedTerms: granted }) },
      },
      {
        provide: ClientOrders,
        useValue: {
          place: (settlement: string | null = null): Promise<null> => {
            regle.push(settlement);
            // `null` : on observe CE QUI EST DEMANDÉ, pas la suite — une
            // commande passée ferait naviguer et quitterait le sujet.
            return Promise.resolve(null);
          },
          placeAsGuest: (): Promise<null> => Promise.resolve(null),
        },
      },
      // Les portes sont des DIALOGUES : on n'en monte pas le contenu ici, on
      // observe que l'écran les ouvre — et qu'il ne va nulle part pour ça.
      {
        provide: OrderDoors,
        useValue: {
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

describe('le panier demande qui commande', () => {
  /**
   * Régression : `place()` rendait `null` en silence pour un visiteur, et
   * `proceed()` commentait « le refus a déjà été dit ». Il ne l'était pas — le
   * clic ne produisait RIEN. L'écran devait le dire ; il ne le disait pas.
   */
  it('retient le règlement et s’explique, devant un visiteur', () => {
    const fixture = boot({ auth: VISITEUR });

    expect(invite(fixture)).not.toBeNull();
    expect(bouton(fixture)?.disabled).toBe(true);
  });

  it('offre les DEUX portes, jamais une seule', () => {
    const fixture = boot({ auth: VISITEUR });

    expect(el(fixture).querySelectorAll('.who-door')).toHaveLength(2);
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

  it('🔴 ouvre la porte du retrait sans naviguer, quand aucun mode n’est pris', () => {
    const fixture = boot({ auth: RECONNU, service: null });

    clic(fixture, '.ask');

    expect(ouvertes).toEqual(['pickup']);
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

    expect(ouvertes).toEqual(['pickup']);
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
