import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyView, ShopLevel } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { AccountService, type AccountStatus } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientBankAccount } from '../../client-bank-account.service';
import { ClientChrome } from '../../client-chrome.service';
import { FR } from '../../copy/fr';
import { PRO_ACCOUNT_FR } from '../../copy/screens/pro-account.copy';
import { openShopAt } from '../../feature-access/feature-access.fixture';
import { ProOnboarding } from '../../pro-onboarding.service';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { ComptePage } from './compte-page';

/** La société du client de référence, telle que `GET /me` la rend. */
const TOMMEUSES = {
  id: 'cmp_1',
  reference: 'C-6KTQAT',
  raisonSociale: 'SAS Les Tommeuses',
  enseigne: "La Folie Douce Val d'Isère",
  formeJuridique: 'SAS',
  siret: '81245678900021',
  vatNumber: 'FR45812456789',
  status: 'active',
  grantedTerms: ['monthly'],
  requestedTerm: null,
  role: 'owner',
  primaryContact: {
    id: null,
    firstName: 'Hugo',
    lastName: 'Heynard',
    fonction: 'Directeur',
    email: 'hheynard@gmail.com',
    phone: '06 12 44 08 71',
    role: null,
  },
  contacts: [
    {
      id: 'ct_1',
      firstName: 'Cabinet',
      lastName: 'Ferrand',
      fonction: 'Comptabilité',
      email: 'compta@cabinet-ferrand.fr',
      phone: '',
      role: 'billing',
    },
  ],
  kbis: { fileName: 'kbis-tommeuses.pdf', uploadedAt: '2026-02-12T00:00:00.000Z', certified: true },
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
} as unknown as CompanyView;

/** Ce que le test fait croire à l'écran : qui est entré, et ce que `/me` a rendu. */
interface Situation {
  readonly authenticated?: boolean;
  readonly status?: AccountStatus;
}

/** Les relectures de `/me` et les connexions demandées par l'écran. */
let loads = 0;
let signIns: string[] = [];

function boot(
  companies: readonly CompanyView[],
  shop: ShopLevel = 'order',
  { authenticated = true, status = 'ready' }: Situation = {},
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
      // La carte RIB a sa propre suite : ici, elle lit un compte vide.
      {
        provide: ClientBankAccount,
        useValue: { read: () => Promise.resolve({ account: null }) },
      },
      // La carte « Compléter mon dossier » a sa propre suite : ici, le dossier existe.
      { provide: ProOnboarding, useValue: { needsDossier: () => false } },
    ],
  });
  openShopAt(shop);
  const fixture = TestBed.createComponent(ComptePage);
  fixture.detectChanges();
  return fixture;
}

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

  it('donne huit cartes, et un sommaire qui pointe LEURS ancres', () => {
    // Le sommaire fait défiler, il ne change pas d'écran : une entrée qui
    // pointerait une ancre absente romprait la promesse écrite sous la liste.
    const anchors = Array.from(el().querySelectorAll('.summary-link')).map((a) =>
      a.getAttribute('href')?.slice(1),
    );
    expect(anchors.length).toBe(8);
    for (const anchor of anchors) {
      expect(el().querySelector(`#${anchor}`)).not.toBeNull();
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
    // L'export des commandes suit la même règle ; l'export personnel reste.
    expect(el().querySelectorAll('.export').length).toBe(1);
  });

  /**
   * Plan `plan-rib-client.md` §2 : le RIB n'appartient qu'au détenteur et au
   * rôle comptable. Aux autres, ni carte ni entrée de sommaire — et le sommaire
   * se renumérote sans trou.
   */
  it('ne montre le RIB qu’aux rôles `owner` et `billing`', () => {
    for (const role of ['owner', 'billing'] as const) {
      fixture = boot([{ ...TOMMEUSES, role }]);
      expect(el().querySelector('#compte-bank app-bank-card')).not.toBeNull();
    }
    for (const role of ['orders', 'admin'] as const) {
      fixture = boot([{ ...TOMMEUSES, role }]);
      const links = Array.from(el().querySelectorAll('.summary-link'));
      expect(el().querySelector('#compte-bank')).toBeNull();
      expect(links.map((a) => a.getAttribute('href'))).not.toContain('#compte-bank');
      expect(links.length).toBe(7);
      expect(links.at(-1)?.querySelector('.summary-num')?.textContent).toBe('07');
    }
  });

  /**
   * L'API n'écrit l'identité que pour `owner` et `admin` (403 aux autres) :
   * un « Modifier » qui finirait en refus se lirait comme une panne.
   */
  it('n’offre « Modifier » sur l’identité qu’aux rôles `owner` et `admin`', () => {
    const action = (): Element | null =>
      el().querySelector('#compte-identity .card-head button[foldButton]');

    for (const role of ['owner', 'admin'] as const) {
      fixture = boot([{ ...TOMMEUSES, role }]);
      expect(action()?.textContent).toContain(FR.account.edit);
    }
    for (const role of ['orders', 'billing'] as const) {
      fixture = boot([{ ...TOMMEUSES, role }]);
      expect(action()).toBeNull();
    }
  });

  describe('« Modifier » ouvre le panneau fold d’identité', () => {
    /** La largeur que `matchMedia` prétend, au moment du clic. */
    const atWidth = (narrow: boolean): void => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: narrow && query === '(max-width: 899.98px)',
        media: query,
      }));
    };

    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    const openIdentity = (): ReturnType<FoldPanelHostService['panels']> => {
      el()
        .querySelector<HTMLButtonElement>('#compte-identity .card-head button[foldButton]')
        ?.click();
      return TestBed.inject(FoldPanelHostService).panels();
    };

    it('avec les valeurs de LA société', () => {
      atWidth(false);
      const [panel, ...rest] = openIdentity();

      expect(rest).toEqual([]);
      expect(panel?.kind === 'component' ? panel.component : null).toBe(IdentityPanel);
      expect(panel?.kind === 'component' ? panel.data : null).toEqual({
        companyId: 'cmp_1',
        enseigne: "La Folie Douce Val d'Isère",
        vatNumber: 'FR45812456789',
        raisonSociale: 'SAS Les Tommeuses',
        formeJuridique: 'SAS',
        siret: '81245678900021',
      });
    });

    /** Le côté se lit au clic : feuille du bas en pile, tiroir droit au bureau. */
    it('en feuille du bas sous le pli, à droite au-delà', () => {
      atWidth(true);
      expect(openIdentity()[0]?.side).toBe('bottom');

      TestBed.inject(FoldPanelHostService).dismissAll();
      atWidth(false);
      expect(openIdentity()[0]?.side).toBe('right');
    });
  });

  /** En pile, sept tirets ne se comptent pas : la pastille dit le rang en chiffres. */
  it('dit le rang du panneau dans une pastille « 1/N », et le libelle', () => {
    const count = el().querySelector('.rail-foot .rail-count');
    const total = el().querySelectorAll('.summary-link').length;

    expect(count?.textContent?.trim()).toBe(`1/${total}`);
    expect(count?.getAttribute('aria-live')).toBe('polite');
    expect(count?.getAttribute('aria-label')).toBe(`Section 1 sur ${total}`);
  });

  it('pose de quoi joindre le service commercial SOUS les cartes, hors du rail', () => {
    expect(el().querySelector('.main > app-support-card')).not.toBeNull();
    expect(el().querySelector('fold-well app-support-card')).toBeNull();
  });

  /** Plan §3.1 : tant qu'on ne commande pas, l'écran dit pourquoi, et quoi faire. */
  it('promet la boutique sous `order`, et se tait quand elle est ouverte', () => {
    expect(el().textContent).not.toContain(PRO_ACCOUNT_FR.promise.closed);

    fixture = boot([TOMMEUSES], 'closed');
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);
  });

  it('dit la règle plutôt que de griser le champ', () => {
    // Un champ mort se lit comme une panne ; une phrase se lit comme une règle.
    expect(el().textContent).toContain(FR.account.identityNote);
    expect(el().querySelectorAll('input[disabled]').length).toBe(0);
  });

  it('porte l’identité légale de LA société, pas celle d’une maquette', () => {
    const shown = el().textContent ?? '';

    expect(shown).toContain('SAS Les Tommeuses');
    expect(shown).toContain('81245678900021');
    expect(shown).not.toContain('Marchand');
  });

  /** Le fil ne porte ni la date de vérification ni son auteur : on ne les invente pas. */
  it('dit si l’extrait est certifié, et rien de plus', () => {
    expect(el().querySelector('.kbis-verified')?.textContent).toContain(FR.account.kbisCertified);
    expect(el().textContent).toContain('kbis-tommeuses.pdf');
  });

  it('sort le détenteur de la liste, et compte tout le monde', () => {
    expect(el().querySelectorAll('.holder').length).toBe(1);
    expect(el().querySelectorAll('.person').length).toBe(1);
  });

  it('n’offre les deux gestes irréversibles qu’en BORDÉ, dans leur territoire', () => {
    // Un aplat rouge invite au clic.
    const zone = el().querySelector('.danger');
    expect(zone?.querySelectorAll('.danger-cta').length).toBe(2);
    expect(zone?.textContent).toContain(FR.account.closeBody);
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
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);
  });
});
