import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of, Subject } from 'rxjs';

import { AuthFacade, type ProRegistration } from './auth.facade';
import { DEV_BYPASS_AUTH } from './dev-flags';

const REGISTRATION: ProRegistration = {
  firstName: 'Pierre',
  lastName: 'Marchand',
  email: 'pierre@brasserie-marchand.fr',
  phone: '06 12 44 09 87',
  enseigne: 'Brasserie Marchand',
};

/**
 * Seuls les ajouts de la porte pro sont éprouvés ici : `registerPro` et la
 * relecture de sa déclaration dans l'`appState`.
 */
describe('AuthFacade — la porte pro', () => {
  let appState: Subject<unknown>;
  let redirects: unknown[];
  let facade: AuthFacade;

  beforeEach(() => {
    appState = new Subject<unknown>();
    redirects = [];
    const auth0 = {
      appState$: appState,
      isLoading$: of(false),
      isAuthenticated$: of(false),
      user$: of(null),
      loginWithRedirect: (options: unknown) => {
        redirects.push(options);
        return of(undefined);
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth0 }],
    });
    TestBed.inject(Router).navigateByUrl = (): Promise<boolean> => Promise.resolve(true);
    facade = TestBed.inject(AuthFacade);
  });

  /**
   * ⚠️ Les tests se construisent en configuration `development` (`angular.json`,
   * `test.options.buildTarget`), où `DEV_BYPASS_AUTH` vaut `true` : la branche
   * qui part chez Auth0 n'est pas atteignable ici — pas plus pour `register`.
   * On éprouve donc ce que fait VRAIMENT ce runner, et le garde-fou qu'il porte.
   */
  /**
   * Régression (2026-09-14) : en dev, la déclaration était jetée, et Mon compte
   * redemandait les champs qu'on venait de saisir sur la porte pro. Le parcours
   * passe désormais par l'écran d'Auth0 simulé, qui rend la main avec elle.
   */
  it('en bypass dev, passe par l’écran d’Auth0 simulé puis retient la déclaration', () => {
    const router = TestBed.inject(Router);
    const navigated: string[] = [];
    router.navigateByUrl = (url): Promise<boolean> => {
      navigated.push(String(url));
      return Promise.resolve(true);
    };

    facade.registerPro('/mon-compte', REGISTRATION);

    expect(DEV_BYPASS_AUTH).toBe(true);
    expect(redirects).toEqual([]);
    expect(navigated).toEqual(['/dev/inscription-auth0']);
    // Rien n'est retenu tant que l'écran simulé n'a pas rendu la main.
    expect(facade.pendingProRegistration()).toBeNull();

    expect(facade.completeDevSignup()).toBe('/mon-compte');
    expect(facade.pendingProRegistration()).toEqual(REGISTRATION);
    expect(facade.isAuthenticated()).toBe(true);
    // Une seule fois : un second passage n'a plus rien à rendre.
    expect(facade.completeDevSignup()).toBeNull();
  });

  it('retrouve la déclaration au retour', () => {
    appState.next({ target: '/mon-compte', proRegistration: REGISTRATION });

    expect(facade.pendingProRegistration()).toEqual(REGISTRATION);
  });

  it('un champ manquant rend `null` — une déclaration partielle ne se complète pas par du vide', () => {
    const { lastName: _dropped, ...partial } = REGISTRATION;
    appState.next({ target: '/mon-compte', proRegistration: partial });

    expect(facade.pendingProRegistration()).toBeNull();
  });

  it('un champ qui n’est pas une chaîne rend `null`', () => {
    appState.next({ target: '/mon-compte', proRegistration: { ...REGISTRATION, phone: 612 } });

    expect(facade.pendingProRegistration()).toBeNull();
  });

  it('sans e-mail, rien à retenir', () => {
    appState.next({ target: '/mon-compte', proRegistration: { ...REGISTRATION, email: '' } });

    expect(facade.pendingProRegistration()).toBeNull();
  });

  /** `/bienvenue` n'est pas touchée : son retour ne fabrique pas de déclaration pro. */
  it('le retour de `/bienvenue` ne pose que le profil', () => {
    const profile = { firstName: 'Pierre', email: 'pierre@brasserie-marchand.fr', phone: '06' };
    appState.next({ target: '/nouvelle-commande', profile });

    expect(facade.pendingProRegistration()).toBeNull();
    expect(facade.pendingProfile()).toEqual(profile);
  });
});
