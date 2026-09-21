import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';

import { AuthFacade, type ProRegistration } from '../../auth/auth.facade';
import { ClientChrome } from '../../client/client-chrome.service';
import { FR } from '../../client/copy/fr';
import { PRO_ACCOUNT_FR } from '../../client/copy/screens/pro-account.copy';
import { openShopAt } from '../../client/feature-access/feature-access.fixture';
import { AccueilPage } from './accueil-page';

/**
 * **La porte PRO de l'inscription.**
 *
 * Elle avait son écran — `OuvertureCompteProPage` — jusqu'au 2026-09-21 ; elle
 * est maintenant l'une des deux portes de `/inscription` (handoff
 * `handoff-inscription`, §1). Ce fichier est SON spec, déplacé avec elle : ce
 * qu'on éprouve n'a pas changé — cinq champs, `registerPro`, Mon compte au
 * retour, aucun devis ni rappel — seul l'écran qui le porte a changé.
 *
 * `/ouverture-compte-pro` ouvre cette même page avec `data.door = 'pro'`, ce
 * que le montage reproduit.
 */
describe('AccueilPage · porte pro', () => {
  let fixture: ComponentFixture<AccueilPage>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let asked: { kind: 'registerPro' | 'login'; target: string; payload: unknown }[];
  let navigated: string[];
  /** Ce que l'écran a demandé d'ouvrir, et ce que le dialogue lui a rendu. */
  let opened: unknown[];
  let slotFromDialog: string | undefined;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const type = (index: number, value: string): void => {
    const input = el().querySelectorAll('input')[index];
    if (!input) {
      throw new Error(`Pas de champ n°${index} à l'écran.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /**
   * L'ordre du DOM — **l'enseigne d'abord** (réf, capture 05) : on ouvre le
   * compte d'un ÉTABLISSEMENT, et le demander en dernier laissait croire
   * l'inverse pendant tout le formulaire.
   */
  const ENSEIGNE = 0;
  const PRENOM = 1;
  const NOM = 2;
  const TEL = 3;
  const MAIL = 4;

  const fillAll = (): void => {
    type(ENSEIGNE, 'Brasserie Marchand');
    type(PRENOM, ' Pierre ');
    type(NOM, 'Marchand');
    type(TEL, '06 12 44 09 87');
    type(MAIL, 'pierre@brasserie-marchand.fr');
  };

  /**
   * ⚠️ jsdom n'implémente pas `matchMedia`, et `dialogSide()` le lit à chaque
   * ouverture de dialogue pour choisir entre le centre et la feuille du bas.
   * Sans ce double, l'ouverture ÉCHOUE dans une promesse — donc en silence,
   * avec un test qui constate seulement que rien ne s'est passé.
   *
   * Il répond « large » : c'est la largeur où l'on regarde cet écran, et le
   * côté choisi ne change rien à ce que le dialogue rend.
   */
  beforeAll(() => {
    Object.defineProperty(globalThis, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
      }),
    });
  });

  function boot(authenticated = false, door: 'perso' | 'pro' = 'pro'): void {
    asked = [];
    navigated = [];
    isAuthenticated = signal(authenticated);
    const auth = {
      isAuthenticated,
      registerPro: (target: string, registration: ProRegistration): void => {
        asked.push({ kind: 'registerPro', target, payload: registration });
      },
      login: (target: string, hint?: string): void => {
        asked.push({ kind: 'login', target, payload: hint });
      },
      register: (): void => {
        throw new Error('La porte pro ne passe jamais par `register`.');
      },
      continueWithGoogle: (): void => {
        throw new Error('La porte pro n’a pas de fournisseur social.');
      },
    };
    opened = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AccueilPage],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: auth },
        // Le choix du créneau est un DIALOGUE : on ne monte pas son contenu
        // ici, on observe ce que l'écran demande et ce qu'il fait du retour.
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown): { closed: Promise<string | undefined> } => {
              opened.push(component);
              return { closed: Promise.resolve(slotFromDialog) };
            },
          },
        },
        // C'est la ROUTE qui désigne la porte au premier rendu : c'est ainsi
        // que `/ouverture-compte-pro` ouvre cette page du bon côté.
        { provide: ActivatedRoute, useValue: { snapshot: { data: { door } } } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = (url): Promise<boolean> => {
      navigated.push(String(url));
      return Promise.resolve(true);
    };
    fixture = TestBed.createComponent(AccueilPage);
    fixture.detectChanges();
  }

  /**
   * 🔴 LE RAPPEL EST UN DIALOGUE (Hugo, 2026-09-21). Il prenait l'écran entier :
   * le formulaire disparaissait sous lui, alors qu'il ne conditionne rien (§4).
   * Ce que le test garde, c'est que le formulaire RESTE — et que le créneau
   * revenu du dialogue se pose dans l'encart.
   */
  it('🔴 ouvre le rappel en dialogue, sans faire disparaître le formulaire', async () => {
    slotFromDialog = '14 h – 15 h';
    boot();

    button(FR.pro.cta).click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(opened).toHaveLength(1);
    expect(el().querySelector('app-pro-step')).not.toBeNull();
    expect(el().textContent).toContain('14 h – 15 h');
  });

  /** Fermer n'est pas demander : rien ne se pose dans l'encart. */
  it('ne retient rien quand on ferme le dialogue sans choisir', async () => {
    slotFromDialog = undefined;
    boot();

    button(FR.pro.cta).click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(el().textContent).not.toContain(FR.pro.bookedTitle);
  });

  it('ouvre la porte pro quand la route la désigne', () => {
    boot();

    expect(el().querySelector('app-pro-step')).not.toBeNull();
    expect(el().querySelector('app-welcome-step')).toBeNull();
  });

  it('garde le bouton inactif tant qu’un champ est vide', () => {
    boot();
    const submit = button(PRO_ACCOUNT_FR.door.submit);
    expect(submit.disabled).toBe(true);

    type(ENSEIGNE, 'Brasserie Marchand');
    type(PRENOM, 'Pierre');
    type(NOM, 'Marchand');
    type(TEL, '06 12 44 09 87');
    expect(submit.disabled).toBe(true);

    type(MAIL, '   ');
    expect(submit.disabled).toBe(true);

    type(MAIL, 'pierre@brasserie-marchand.fr');
    expect(submit.disabled).toBe(false);
  });

  it('part chez Auth0 avec les cinq champs, et revient sur Mon compte', () => {
    boot();
    fillAll();

    button(PRO_ACCOUNT_FR.door.submit).click();

    expect(asked).toEqual([
      {
        kind: 'registerPro',
        target: '/mon-compte',
        payload: {
          firstName: 'Pierre',
          lastName: 'Marchand',
          email: 'pierre@brasserie-marchand.fr',
          phone: '06 12 44 09 87',
          enseigne: 'Brasserie Marchand',
        },
      },
    ]);
  });

  /**
   * ⚠️ On vise le bouton DU FORMULAIRE, pas celui de la colonne d'encre. Il y
   * en a deux depuis que la réf a posé la connexion au bas du bandeau, et ils
   * ne sont pas interchangeables : celui-ci souffle l'e-mail déjà tapé, celui
   * de la colonne n'en a aucun à souffler. Le CSS n'en montre qu'un à la fois —
   * le bandeau au bureau, le formulaire en pile — mais le DOM porte les deux,
   * et un `querySelector` global prendrait le premier venu.
   */
  it('« Déjà client ? » du formulaire connecte vers Mon compte, e-mail soufflé', () => {
    boot();
    type(MAIL, 'pierre@brasserie-marchand.fr');

    const form = el().querySelector('app-pro-step');
    const link = Array.from(form?.querySelectorAll('button') ?? []).find((b) =>
      (b.textContent ?? '').includes(PRO_ACCOUNT_FR.door.alreadyLink),
    );
    link?.click();

    expect(asked).toEqual([
      { kind: 'login', target: '/mon-compte', payload: 'pierre@brasserie-marchand.fr' },
    ]);
  });

  it('envoie qui est déjà connecté sur Mon compte', () => {
    boot(true);
    TestBed.tick();

    expect(navigated).toEqual(['/mon-compte']);
  });

  it('pose le chrome de l’entrée : ni menu, ni cloche, pas de barre au-delà du pli', () => {
    boot();
    TestBed.tick();
    const chrome = TestBed.inject(ClientChrome);

    expect(chrome.menu()).toBe(false);
    expect(chrome.bell()).toBeNull();
    expect(chrome.barOnDesktop()).toBe(false);
    expect(chrome.kicker()).toBe(PRO_ACCOUNT_FR.door.kicker);
  });

  /** Plan §3.1 : la promesse suit le niveau que le serveur a rendu, et se tait avant. */
  it('ne dit la promesse qu’une fois le niveau connu, et jamais boutique ouverte', () => {
    boot();
    expect(el().querySelector('app-shop-promise')).toBeNull();

    openShopAt('closed');
    fixture.detectChanges();
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);

    openShopAt('order');
    fixture.detectChanges();
    expect(el().textContent).not.toContain(PRO_ACCOUNT_FR.promise.closed);
  });

  it('ne parle pas de devis traiteur : on n’y vend rien', () => {
    boot();

    expect(el().querySelector('app-event-card')).toBeNull();
    expect((el().textContent ?? '').toLowerCase()).not.toContain('traiteur');
  });

  /**
   * 🔴 LE RAPPEL EST SOUS LE FORMULAIRE PRO, et lui seul (handoff §4 ; Hugo,
   * 2026-09-21). Il a longtemps été sous le formulaire PARTICULIER, où il
   * vendait l'espace pro à quelqu'un qui n'en voulait pas.
   *
   * ⚠️ Ce que ce test garde n'est pas sa présence mais ses MOTS : avec la copie
   * de `ClientCopy.pro`, l'encart proposerait de découvrir l'espace pro à
   * quelqu'un qui est en train de l'ouvrir. C'est la faute que la présence
   * seule ne montrerait pas.
   */
  it('🔴 porte le rappel, avec les mots de la porte pro', () => {
    boot();
    const shown = el().textContent ?? '';

    expect(el().querySelector('app-callback-block')).not.toBeNull();
    expect(shown).toContain(PRO_ACCOUNT_FR.door.callbackTitle);
    expect(shown).not.toContain(FR.pro.title);
  });

  /** Et il ne conditionne rien (§4) : le formulaire part sans lui. */
  it('🔴 envoie le dossier sans qu’un rappel ait été demandé', () => {
    boot();
    fillAll();

    button(PRO_ACCOUNT_FR.door.submit).click();

    expect(asked).toHaveLength(1);
    expect(asked[0]?.kind).toBe('registerPro');
  });

  /**
   * 🔴 Le BANDEAU suit la porte (handoff §1). C'est la régression la plus facile
   * à laisser passer : les deux portes partagent le châssis, et rien dans le
   * compilateur ne dit qu'une accroche parle au mauvais lecteur. Ici, la preuve
   * pro doit être à l'écran et celle du particulier absente.
   */
  it('🔴 montre les preuves PRO, pas celles du particulier', () => {
    boot();
    const shown = el().textContent ?? '';

    expect(shown).toContain(PRO_ACCOUNT_FR.door.heading);
    expect(shown).toContain(PRO_ACCOUNT_FR.door.proof[0]);
    expect(shown).not.toContain(FR.aside.proof[0]);
  });

  /** Le segmenté ramène à l'autre porte, sur place — sans changer d'adresse. */
  it('bascule vers la porte particulier d’un segment', () => {
    boot();

    button(FR.doors.persoLabel).click();
    fixture.detectChanges();

    expect(el().querySelector('app-welcome-step')).not.toBeNull();
    expect(el().querySelector('app-pro-step')).toBeNull();
    expect(navigated).toEqual([]);
  });

  /** Et le pied de la porte pro le propose aussi, en toutes lettres (§1). */
  it('propose la porte particulier au pied du formulaire', () => {
    boot();

    button(FR.doors.toPersoLink).click();
    fixture.detectChanges();

    expect(el().querySelector('app-welcome-step')).not.toBeNull();
  });
});
