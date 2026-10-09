import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { FR } from '../../client/copy/fr';
import { ClientFeatureAccess } from '../../client/feature-access/client-feature-access.service';
import { DEFAULT_LEVELS } from '../../client/feature-access/feature-access.fixture';

import { SignInDialog, type SignInIntent } from './sign-in-dialog';

const INTENT: SignInIntent = { target: '/mon-espace', email: 'hugo@lfd.test' };

interface Wire {
  /** Les appels à la façade, dans l'ordre où ils sont partis. */
  readonly calls: string[];
  /** L'indice de fermeture — il doit précéder toute redirection. */
  readonly closed: string[];
}

let wire: Wire;

/** Le niveau `facebookLogin` posé avant le rendu ; `null` = niveaux pas encore lus. */
function boot(
  intent: SignInIntent = INTENT,
  facebookLogin: 'hidden' | 'visible' | null = null,
): ComponentFixture<SignInDialog> {
  wire = { calls: [], closed: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SignInDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: {
          continueWithEmailCode: (target: string, hint?: string): void => {
            wire.calls.push(`code:${target}:${hint ?? '—'}`);
          },
          loginWithPassword: (target: string, hint?: string): void => {
            wire.calls.push(`password:${target}:${hint ?? '—'}`);
          },
          continueWithGoogle: (target: string): void => {
            wire.calls.push(`google:${target}`);
          },
          continueWithFacebook: (target: string): void => {
            wire.calls.push(`facebook:${target}`);
          },
        },
      },
      {
        provide: FoldPanelRef,
        useValue: {
          close: (): void => {
            wire.closed.push('closed');
          },
        },
      },
    ],
  });
  if (facebookLogin !== null) {
    TestBed.inject(ClientFeatureAccess).receive({ ...DEFAULT_LEVELS, facebookLogin });
  }
  const fixture = TestBed.createComponent(SignInDialog);
  fixture.componentRef.setInput('data', intent);
  fixture.detectChanges();
  return fixture;
}

describe('SignInDialog', () => {
  let fixture: ComponentFixture<SignInDialog>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /**
   * Les boutons, par le libellé EXACT que la personne lit.
   *
   * ⚠️ Égalité et non `includes` : « Continuer » est un préfixe de « Continuer
   * avec Google », et une correspondance lâche cliquait le fournisseur en
   * croyant cliquer le pied du dialogue.
   */
  const clickLabelled = (label: string): void => {
    const button = Array.from(el().querySelectorAll('button')).find(
      (node) => (node.textContent ?? '').trim() === label,
    );
    if (button === undefined) {
      throw new Error(`Bouton « ${label} » introuvable.`);
    }
    button.click();
    fixture.detectChanges();
  };

  const field = (): HTMLInputElement => {
    const found = el().querySelector('fold-input input');
    if (!(found instanceof HTMLInputElement)) {
      throw new Error("Le champ d'adresse est absent.");
    }
    return found;
  };

  const typeEmail = (value: string): void => {
    const input = field();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /**
   * Facebook suit l'interrupteur `facebookLogin` (2026-10-09) : masqué tant
   * que les niveaux ne sont pas lus.
   */
  it('propose Google et l’adresse, sans Facebook tant que les niveaux ne sont pas lus', () => {
    fixture = boot();
    const text = el().textContent ?? '';

    expect(text).toContain(FR.signup.google);
    expect(text).not.toContain(FR.signup.facebook);
    expect(text).toContain(FR.doors.signInSubmit);
  });

  it('garde Facebook masqué quand le niveau est masqué', () => {
    fixture = boot(INTENT, 'hidden');

    expect(el().textContent ?? '').not.toContain(FR.signup.facebook);
  });

  it('montre Facebook quand le niveau est visible, et le geste part chez Facebook', () => {
    fixture = boot(INTENT, 'visible');

    expect(el().textContent ?? '').toContain(FR.signup.facebook);
    clickLabelled(FR.signup.facebook);
    expect(wire.calls).toEqual([`facebook:${INTENT.target}`]);
  });

  /**
   * Régression : le geste partait droit chez Auth0 depuis l'accueil, et aucune
   * phrase n'annonçait que Google était un chemin possible — quelqu'un qui
   * avait ouvert son compte par un fournisseur tombait sur un mot de passe
   * qu'il n'a jamais posé (Hugo, 2026-09-22).
   */
  it('reprend l’adresse déjà tapée pour préremplir l’écran d’Auth0', () => {
    fixture = boot();

    expect(field().value).toBe(INTENT.email);

    clickLabelled(FR.doors.signInSubmit);

    expect(wire.calls).toEqual([`code:${INTENT.target}:${INTENT.email}`]);
  });

  /**
   * Le champ n'est qu'un raccourci : vide, il mène au même endroit. Exiger une
   * adresse pour un champ qui sert à éviter de la saisir serait absurde — et le
   * bouton ne se désarme donc jamais.
   */
  it('part sans indice quand l’adresse est vide', () => {
    fixture = boot({ target: '/mon-espace', email: '' });

    clickLabelled(FR.doors.signInSubmit);

    expect(wire.calls).toEqual(['code:/mon-espace:—']);
  });

  it('une adresse faite de blancs ne devient pas un indice', () => {
    fixture = boot();
    typeEmail('   ');

    clickLabelled(FR.doors.signInSubmit);

    expect(wire.calls).toEqual([`code:${INTENT.target}:—`]);
  });

  it('chaque fournisseur emmène vers la même destination', () => {
    fixture = boot();
    clickLabelled(FR.signup.google);

    expect(wire.calls).toEqual([`google:${INTENT.target}`]);
  });

  /**
   * 🔴 On ferme AVANT de rediriger. La page va disparaître ; un dialogue laissé
   * ouvert se retrouverait à l'écran au retour d'Auth0, par-dessus une app où
   * la personne est désormais connectée.
   */
  it('se ferme avant de partir, quel que soit le chemin', () => {
    for (const label of [FR.signup.google, FR.doors.signInSubmit, FR.doors.usePassword]) {
      fixture = boot();
      clickLabelled(label);

      expect(wire.closed).toEqual(['closed']);
      expect(wire.calls.length).toBe(1);
    }
  });

  /**
   * Le chemin par défaut est le CODE (2026-10-09) ; le mot de passe reste,
   * derrière un lien, avec la même adresse soufflée.
   */
  it('« Utiliser un mot de passe » part sur la connexion à mot de passe, l’adresse en main', () => {
    fixture = boot();
    clickLabelled(FR.doors.usePassword);

    expect(wire.calls).toEqual([`password:${INTENT.target}:${INTENT.email}`]);
  });

  it('le lien du mot de passe ne souffle pas une adresse vide', () => {
    fixture = boot({ target: '/mon-espace', email: '' });
    clickLabelled(FR.doors.usePassword);

    expect(wire.calls).toEqual(['password:/mon-espace:—']);
  });

  it('annuler ne connecte personne', () => {
    fixture = boot();
    clickLabelled(FR.account.cancel);

    expect(wire.closed).toEqual(['closed']);
    expect(wire.calls).toEqual([]);
  });
});
