import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthFacade, type PendingProfile } from '../../auth/auth.facade';

import { ClientChrome } from '../../client/client-chrome.service';
import { fill } from '../../client/copy/client-copy.service';
import { FR } from '../../client/copy/fr';
import { AccueilPage } from './accueil-page';

/**
 * L'écran est piloté par le DOM : ses membres sont `protected`, et ce qui compte
 * est ce que voit la personne qui l'utilise.
 */
describe('AccueilPage', () => {
  let fixture: ComponentFixture<AccueilPage>;
  let chrome: ClientChrome;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const click = (label: string): void => {
    button(label).click();
    fixture.detectChanges();
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

  /** L'ordre des champs : prénom, téléphone, e-mail — celui du DOM aux deux plis. */
  const FIRST = 0;
  const TEL = 1;
  const MAIL = 2;

  const fillSignup = (): void => {
    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    type(MAIL, 'pierre@brasserie-marchand.fr');
  };

  /** Ce que l'écran demande à Auth0 — la seule chose qu'on veuille observer. */
  let asked: { kind: 'register' | 'login' | 'google'; target: string; payload: unknown }[];

  beforeEach(() => {
    asked = [];
    const auth = {
      isAuthenticated: signal(false),
      pendingProfile: signal<PendingProfile | null>(null),
      register: (target: string, profile?: PendingProfile): void => {
        asked.push({ kind: 'register', target, payload: profile });
      },
      login: (target: string, hint?: string): void => {
        asked.push({ kind: 'login', target, payload: hint });
      },
      continueWithGoogle: (target: string): void => {
        asked.push({ kind: 'google', target, payload: undefined });
      },
    };
    TestBed.configureTestingModule({
      imports: [AccueilPage],
      providers: [provideRouter([]), { provide: AuthFacade, useValue: auth }],
    });
    fixture = TestBed.createComponent(AccueilPage);
    chrome = TestBed.inject(ClientChrome);
    fixture.detectChanges();
  });

  it("ouvre sur l'accueil visiteur, sans retour possible", () => {
    expect(text()).toContain(FR.signup.submit);
    // Le sur-titre et le retour vivent dans l'en-tête du shell : l'écran les
    // PUBLIE, il ne les dessine plus.
    expect(chrome.kicker()).toBe(FR.chrome.kickerWelcome);
    expect(chrome.back()).toBeNull();
  });

  it("garde la pastille de marque : un visiteur n'a ni menu ni cloche", () => {
    expect(chrome.menu()).toBe(false);
    expect(chrome.bell()).toBeNull();
  });

  /**
   * 🔴 Les champs sont là D'ENTRÉE. Ils étaient repliés derrière un bouton, pour
   * garder « Déjà client ? » au-dessus de la ligne de flottaison ; cette porte
   * a quitté le formulaire le 2026-09-21, et le pli ne protégeait plus que
   * lui-même — au prix d'un clic pour tout le monde (réf, capture 03).
   */
  it('🔴 montre les trois champs sans qu’on ait à déplier', () => {
    expect(el().querySelectorAll('.fields input')).toHaveLength(3);
    // Et plus rien n'annonce un pli aux technologies d'assistance.
    expect(el().querySelector('[aria-expanded]')).toBeNull();
  });

  it("refuse la création tant que les trois champs n'y sont pas", () => {
    expect(button(FR.signup.open).disabled).toBe(true);

    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    expect(button(FR.signup.open).disabled).toBe(true);

    type(MAIL, 'pierre@brasserie-marchand.fr');
    expect(button(FR.signup.open).disabled).toBe(false);
  });

  it('les trois champs partent chez Auth0, avec la personne', () => {
    // Prénom et téléphone n'existent nulle part chez Auth0 : ils voyagent avec
    // elle, et se poseront sur le compte au retour.
    fillSignup();
    click(FR.signup.open);

    expect(asked).toEqual([
      {
        kind: 'register',
        target: '/accueil',
        payload: {
          firstName: 'Pierre',
          email: 'pierre@brasserie-marchand.fr',
          phone: '06 12 44 09 87',
        },
      },
    ]);
  });

  /**
   * Régression : l'écran éteignait la barre de bureau sans la rallumer, et
   * `/bienvenue` — où l'on arrive après la connexion en perso — restait sans
   * en-tête (Hugo, 2026-09-17).
   */
  it('🔴 rallume la barre du shell en partant', () => {
    expect(chrome.barOnDesktop()).toBe(false);

    fixture.destroy();

    expect(chrome.barOnDesktop()).toBe(true);
  });

  /** Le panneau d'entrée à la Sushi Shop (Hugo, 2026-09-17) : Google d'abord. */
  it('« Continuer avec Google » part chez Google, vers l’accueil de l’espace', () => {
    click(FR.signup.google);

    expect(asked).toEqual([{ kind: 'google', target: '/accueil', payload: undefined }]);
  });

  it('montre Google AVANT le formulaire', () => {
    const labels = Array.from(el().querySelectorAll('button')).map((b) => b.textContent ?? '');
    const google = labels.findIndex((label) => label.includes(FR.signup.google));
    const signup = labels.findIndex((label) => label.includes(FR.signup.open));

    expect(google).toBeGreaterThanOrEqual(0);
    expect(google).toBeLessThan(signup);
  });

  it("« Déjà client ? » souffle l'e-mail déjà tapé à l'écran de connexion", () => {
    // Ce n'est plus un lien à attendre : Auth0 reconnaît la passkey. Mais qui
    // vient de taper son adresse chez nous n'a pas à la retaper chez lui.
    type(MAIL, 'pierre@brasserie-marchand.fr');
    click(FR.doors.alreadyTitle);

    expect(asked).toEqual([
      { kind: 'login', target: '/accueil', payload: 'pierre@brasserie-marchand.fr' },
    ]);
  });

  /**
   * 🔴 NI DEVIS TRAITEUR, NI RAPPEL COMMERCIAL sur l'inscription (Hugo,
   * 2026-09-21 : « tu en profites pour enlever un event et intéressé par
   * l'espace pro de l'inscription »).
   *
   * ⚠️ Les deux composants VIVENT toujours — la carte d'événement sur l'accueil
   * public, le bloc de rappel et son panneau sur l'écran de commande. Ce qui
   * est retiré, c'est leur présence ICI : on n'argumente pas auprès de
   * quelqu'un qui est en train d'ouvrir son compte.
   */
  it('🔴 ne vend rien : ni devis traiteur, ni rappel commercial', () => {
    expect(el().querySelector('app-event-card')).toBeNull();
    expect(el().querySelector('app-callback-block')).toBeNull();
    expect(text()).not.toContain(FR.pro.title);
    expect(text()).not.toContain(FR.event.badge);
  });

  /** Le pied de la carte propose l'autre porte, sur place (handoff §1). */
  it('bascule vers la porte pro depuis le pied de la carte', () => {
    click(FR.pro.openAccount);

    expect(el().querySelector('app-pro-step')).not.toBeNull();
    expect(el().querySelector('app-welcome-step')).toBeNull();
  });
});
