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
import { OrderDoors } from '../../shop/order-doors';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { PanierPage } from './panier-page';

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
  readonly service?: ServiceChoice | null;
  readonly panier?: boolean;
}

/** Ce que l'écran a demandé aux portes, et où il est allé. */
let ouvertes: string[] = [];
let visitees: string[] = [];

function boot({
  auth = VISITEUR,
  service = AU_LABO,
  panier = true,
}: Monde = {}): ComponentFixture<PanierPage> {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PanierPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideWorkspace(workspaceDouble()),
      { provide: AuthFacade, useValue: auth },
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
  const fixture = TestBed.createComponent(PanierPage);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<PanierPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const invite = (fixture: ComponentFixture<PanierPage>): Element | null =>
  el(fixture).querySelector('.who');

const bouton = (fixture: ComponentFixture<PanierPage>): HTMLButtonElement | null =>
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
  const clic = (fixture: ComponentFixture<PanierPage>, selector: string): void => {
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
