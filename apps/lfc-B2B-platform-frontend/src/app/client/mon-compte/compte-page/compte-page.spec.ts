import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyView, CustomerBankAccountView, GateLevel, ShopLevel } from '@lfd/contracts';

import { AccountService, type AccountStatus } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientBankAccount } from '../../client-bank-account.service';
import { ClientChrome } from '../../client-chrome.service';
import { ClientMandate } from '../../client-mandate.service';
import { FR } from '../../copy/fr';
import { PRO_ACCOUNT_FR } from '../../copy/screens/pro-account.copy';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { DEFAULT_SURFACES, openShopAt } from '../../feature-access/feature-access.fixture';
import { ProOnboarding } from '../../pro-onboarding.service';
import { asRole, PROFILE, TOMMEUSES } from '../account.fixture';
import { ComptePage } from './compte-page';

/** Ce que le test fait croire à l'écran : qui est entré, et ce que `/me` a rendu. */
interface Situation {
  readonly authenticated?: boolean;
  readonly status?: AccountStatus;
  /** Le drapeau `customerMandate` — fermé par défaut, comme au catalogue. */
  readonly mandate?: GateLevel;
  /** Le RIB que ses cartes ont lu — aucun par défaut. */
  readonly bank?: CustomerBankAccountView | null;
}

/** Un RIB enregistré, sans IBAN : la lecture n'en rend que `last4`. */
const RIB: CustomerBankAccountView = {
  holder: 'SAS Les Tommeuses',
  holderLegalForm: 'SAS',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: 'Val d’Isère',
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '1906',
};

/** Les relectures de `/me` et les connexions demandées par l'écran. */
let loads = 0;
let signIns: string[] = [];

function boot(
  companies: readonly CompanyView[],
  shop: ShopLevel = 'order',
  { authenticated = true, status = 'ready', mandate = 'closed', bank = null }: Situation = {},
): ComponentFixture<ComptePage> {
  loads = 0;
  signIns = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ComptePage],
    providers: [
      provideRouter([]),
      {
        provide: AccountService,
        useValue: {
          companies: () => companies,
          profile: () => PROFILE,
          status: () => status,
          load: (): void => {
            loads += 1;
          },
        },
      },
      {
        provide: AuthFacade,
        useValue: {
          isLoading: () => false,
          isAuthenticated: () => authenticated,
          login: (target: string): void => {
            signIns.push(target);
          },
        },
      },
      // Les cartes RIB ont leur propre suite : ici, un RIB lu, absent sauf mention.
      {
        provide: ClientBankAccount,
        useValue: {
          status: signal('ready'),
          account: signal(bank),
          ensure: (): void => undefined,
          reload: (): Promise<void> => Promise.resolve(),
        },
      },
      // Les cartes mandat ont leur propre suite : ici, aucun mandat en cours.
      {
        provide: ClientMandate,
        useValue: {
          status: signal('ready'),
          mandate: signal(null),
          issuerScheme: signal(null),
          mintBlockers: signal([]),
          ensure: (): void => undefined,
          reload: (): Promise<void> => Promise.resolve(),
        },
      },
      // La carte « Compléter mon dossier » a sa propre suite : ici, le dossier existe.
      { provide: ProOnboarding, useValue: { needsDossier: () => false } },
    ],
  });
  openShopAt(shop);
  if (mandate === 'open') {
    TestBed.inject(ClientFeatureAccess).receive({
      shop,
      ...DEFAULT_SURFACES,
      customerMandate: 'open',
    });
  }
  const fixture = TestBed.createComponent(ComptePage);
  fixture.detectChanges();
  return fixture;
}

/** Les huit sections, dans l'ordre du sommaire. */
const SECTIONS = [
  'identity',
  'users',
  'kbis',
  'addresses',
  'bank',
  'payment',
  'preferences',
  'data',
] as const;

/**
 * 🔴 **Cet écran était le dossier d'une autre maison.** « Brasserie Marchand »,
 * son SIRET, son KBIS « vérifié par Léa », ses cinq utilisateurs, son mandat
 * SEPA — tout écrit en dur. Il lit désormais `GET /me`.
 */
describe('ComptePage', () => {
  let fixture: ComponentFixture<ComptePage>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = boot([TOMMEUSES]);
  });

  /**
   * En pile, le bandeau fixe mangeait 338 px sur 812 et laissait 410 px au
   * contenu (mesuré le 2026-09-14). L'écran le reprend dans sa page pour qu'il
   * défile, la carte amarrée — et le rend à la bande en partant.
   */
  it('reprend son bandeau dans la page en pile, la carte amarrée, et le rend en partant', () => {
    const chrome = TestBed.inject(ClientChrome);
    expect(chrome.bandNarrow()).toBe(false);
    expect(el().querySelector('.narrow-pin app-account-card')).not.toBeNull();

    fixture.destroy();
    expect(chrome.bandNarrow()).toBe(true);
  });

  it('donne huit sections, et un sommaire qui pointe LEURS ancres', () => {
    // Le sommaire fait défiler, il ne change pas d'écran : une entrée qui
    // pointerait une ancre absente mènerait nulle part.
    const anchors = Array.from(el().querySelectorAll('.summary-link')).map((a) =>
      a.getAttribute('href')?.slice(1),
    );
    expect(anchors.length).toBe(8);
    // « Mes informations » a quitté Mon compte pour l'en-tête (2026-09-14).
    expect(el().querySelector('#compte-profile')).toBeNull();
    for (const anchor of anchors) {
      expect(el().querySelector(`#${anchor}`)).not.toBeNull();
    }
  });

  /**
   * Deux cartes par section, et le CSS de la page n'en affiche qu'une au pli.
   * L'ancre reste sur la SECTION : le sommaire mène au même endroit aux deux
   * largeurs.
   */
  it('rend une carte bureau et une carte mobile dans chaque section, sous son ancre', () => {
    for (const key of SECTIONS) {
      const section = el().querySelector(`section#compte-${key}`);
      expect(section?.querySelectorAll(`app-${key}-desk-card.desk`).length).toBe(1);
      expect(section?.querySelectorAll(`app-${key}-mobile-card.mobile`).length).toBe(1);
      expect(section?.querySelector('[id]')).toBeNull();
    }
  });

  /**
   * Plan `plan-inscription-pro-seule.md` §4 : sous le niveau où l'on commande,
   * règlement et préférences disparaissent — et le sommaire se renumérote sur
   * ce qui reste, sans trou ni ancre morte.
   */
  it('sous `order`, retire règlement et préférences, et renumérote le sommaire', () => {
    fixture = boot([TOMMEUSES], 'browse');

    const links = Array.from(el().querySelectorAll('.summary-link'));
    const anchors = links.map((a) => a.getAttribute('href')?.slice(1));
    expect(anchors).toEqual([
      'compte-identity',
      'compte-users',
      'compte-kbis',
      'compte-addresses',
      'compte-bank',
      'compte-data',
    ]);
    expect(links.map((a) => a.querySelector('.summary-num')?.textContent)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
    for (const anchor of anchors) {
      expect(el().querySelector(`#${anchor}`)).not.toBeNull();
    }
    expect(el().querySelector('#compte-payment')).toBeNull();
    expect(el().querySelector('#compte-preferences')).toBeNull();
  });

  /**
   * Plan `plan-rib-client.md` §2 : le RIB n'appartient qu'au détenteur et au
   * rôle comptable. Aux autres, ni carte ni entrée de sommaire — et le sommaire
   * se renumérote sans trou.
   */
  it('ne montre le RIB qu’aux rôles `owner` et `billing`', () => {
    for (const role of ['owner', 'billing'] as const) {
      fixture = boot([asRole(role)]);
      expect(el().querySelector('#compte-bank app-bank-desk-card')).not.toBeNull();
      expect(el().querySelector('#compte-bank app-bank-mobile-card')).not.toBeNull();
    }
    for (const role of ['orders', 'admin'] as const) {
      fixture = boot([asRole(role)]);
      const links = Array.from(el().querySelectorAll('.summary-link'));
      expect(el().querySelector('#compte-bank')).toBeNull();
      expect(links.map((a) => a.getAttribute('href'))).not.toContain('#compte-bank');
      expect(links.length).toBe(7);
      expect(links.at(-1)?.querySelector('.summary-num')?.textContent).toBe('07');
    }
  });

  /**
   * Plan `plan-mandat-client.md` §3, lot B : la carte mandat exige le rôle du
   * RIB, un RIB enregistré ET le drapeau ouvert. Elle suit le RIB — même rangée
   * au bureau, panneau suivant en pile — et le sommaire la compte.
   */
  describe('le mandat SEPA', () => {
    const anchors = (): (string | undefined)[] =>
      Array.from(el().querySelectorAll('.summary-link')).map((a) =>
        a.getAttribute('href')?.slice(1),
      );

    it('se montre juste après le RIB, sur sa rangée, et le sommaire se renumérote avec lui', () => {
      for (const role of ['owner', 'billing'] as const) {
        fixture = boot([asRole(role)], 'order', { mandate: 'open', bank: RIB });

        const section = el().querySelector('section#compte-mandate');
        expect(section?.querySelectorAll('app-mandate-desk-card.desk').length).toBe(1);
        expect(section?.querySelectorAll('app-mandate-mobile-card.mobile').length).toBe(1);
        // Dans le rail, le panneau qui suit immédiatement celui du RIB.
        expect(el().querySelector('section#compte-bank + section#compte-mandate')).not.toBeNull();
        expect(el().querySelector('section#compte-bank')?.classList).toContain('paired');

        const shown = anchors();
        expect(shown.length).toBe(9);
        expect(shown.indexOf('compte-mandate')).toBe(shown.indexOf('compte-bank') + 1);
        expect(
          Array.from(el().querySelectorAll('.summary-num')).map((n) => n.textContent),
        ).toContain('09');
        expect(el().querySelector('.rail-foot .rail-count')?.textContent?.trim()).toBe('1/9');
      }
    });

    it('reste absent tant que le drapeau est fermé — le RIB reprend toute sa rangée', () => {
      fixture = boot([TOMMEUSES], 'order', { mandate: 'closed', bank: RIB });

      expect(el().querySelector('#compte-mandate')).toBeNull();
      expect(anchors()).not.toContain('compte-mandate');
      expect(anchors().length).toBe(8);
      expect(el().querySelector('section#compte-bank')?.classList).not.toContain('paired');
    });

    it('reste absent sans RIB enregistré, même drapeau ouvert', () => {
      fixture = boot([TOMMEUSES], 'order', { mandate: 'open', bank: null });

      expect(el().querySelector('#compte-mandate')).toBeNull();
      expect(anchors()).toContain('compte-bank');
      expect(anchors().length).toBe(8);
    });

    it('reste absent aux rôles qui ne voient pas le RIB, même drapeau ouvert et RIB lu', () => {
      for (const role of ['orders', 'admin'] as const) {
        fixture = boot([asRole(role)], 'order', { mandate: 'open', bank: RIB });

        expect(el().querySelector('#compte-mandate')).toBeNull();
        expect(anchors()).not.toContain('compte-mandate');
        expect(anchors().length).toBe(7);
      }
    });
  });

  /** En pile, neuf tirets ne se comptent pas : la pastille dit le rang en chiffres. */
  it('dit le rang du panneau dans une pastille « 1/N », et le libelle', () => {
    const count = el().querySelector('.rail-foot .rail-count');
    const total = el().querySelectorAll('.summary-link').length;

    expect(count?.textContent?.trim()).toBe(`1/${total}`);
    expect(count?.getAttribute('aria-live')).toBe('polite');
    expect(count?.getAttribute('aria-label')).toBe(`Section 1 sur ${total}`);
  });

  /**
   * Deux exemplaires, un par largeur : dans l'aside collant sous le sommaire au
   * bureau, sous le rail en pile. Le CSS masque l'autre (`display: none`).
   */
  it('pose la carte contact dans l’aside du bureau, et sous le rail en pile — jamais dedans', () => {
    expect(el().querySelector('aside.aside > nav.summary + app-support-card')).not.toBeNull();
    expect(el().querySelector('.main > app-support-card.support')).not.toBeNull();
    expect(el().querySelectorAll('app-support-card').length).toBe(2);
    expect(el().querySelector('fold-well app-support-card')).toBeNull();
  });

  /** En pile, la colonne à hauteur d'écran ne vaut que pour le dossier. */
  it('ne borne la page à l’écran que lorsque le dossier est affiché', () => {
    expect((fixture.nativeElement as HTMLElement).classList).toContain('dossier');

    fixture = boot([], 'closed');
    expect((fixture.nativeElement as HTMLElement).classList).not.toContain('dossier');
  });

  /** Plan §3.1 : tant qu'on ne commande pas, l'écran dit pourquoi, et quoi faire. */
  it('promet la boutique sous `order`, et se tait quand elle est ouverte', () => {
    expect(el().textContent).not.toContain(PRO_ACCOUNT_FR.promise.closed);

    fixture = boot([TOMMEUSES], 'closed');
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);
  });

  it('porte l’identité légale de LA société, pas celle d’une maquette', () => {
    const shown = el().textContent ?? '';

    expect(shown).toContain('SAS Les Tommeuses');
    expect(shown).toContain('81245678900021');
    expect(shown).not.toContain('Marchand');
  });

  /**
   * Régression (2026-09-14) : sans entrée, l'écran empilait la carte de dossier
   * au-dessus de sept cartes de compte vides. Il ne montre plus que de quoi entrer.
   */
  it('à qui n’est pas entré, ne montre que de quoi se connecter', () => {
    fixture = boot([], 'order', { authenticated: false, status: 'idle' });

    expect(el().textContent).toContain(FR.account.signedOutTitle);
    expect(el().querySelectorAll('.summary-link').length).toBe(0);
    expect(el().querySelector('app-account-card')).toBeNull();

    const signIn = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(FR.account.signIn),
    );
    signIn?.click();
    expect(signIns).toEqual(['/mon-compte']);
  });

  /**
   * Régression (2026-09-14) : une lecture de `/me` en échec s'affichait « Compte
   * non reconnu, connectez-vous » — à quelqu'un de connecté, pendant que l'API
   * redémarrait. C'est un échec, et on peut réessayer.
   */
  it('dit l’échec de lecture, et relit au clic', () => {
    fixture = boot([], 'order', { status: 'error' });

    expect(el().textContent).toContain(FR.account.loadFailedTitle);
    expect(el().textContent).not.toContain(FR.account.cardUnknown);

    const retry = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(FR.account.loadRetry),
    );
    retry?.click();
    expect(loads).toBe(1);
  });

  /** Connecté sans société : la carte de dossier, et pas le compte vide en dessous. */
  it('sans société, ne montre pas les cartes de compte', () => {
    fixture = boot([], 'closed');

    expect(el().querySelectorAll('.summary-link').length).toBe(0);
    expect(el().querySelector('app-account-card')).toBeNull();
    expect(el().querySelector('app-identity-desk-card')).toBeNull();
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);
  });
});
