import { CUSTOMER_CONNECTION, EMAIL_CODE_CONNECTION, GOOGLE_CONNECTION } from './auth.config';
import { readLastConnection, redirectParams, writeLastConnection } from './auth-redirect';

/**
 * Ce que chaque départ DEMANDE à Auth0. La façade n'est pas éprouvable sur ce
 * point en test — `DEV_BYPASS_AUTH` y vaut `true` —, d'où cette partie pure.
 */
describe('redirectParams', () => {
  it('le code e-mail : connexion `email`, adresse soufflée, sans onglet d’inscription', () => {
    expect(
      redirectParams(
        { connection: EMAIL_CODE_CONNECTION, hint: ' pierre@brasserie.fr ' },
        EMAIL_CODE_CONNECTION,
      ),
    ).toEqual({ connection: 'email', login_hint: 'pierre@brasserie.fr' });
  });

  it('sans adresse tapée, pas de `login_hint`', () => {
    expect(redirectParams({ connection: EMAIL_CODE_CONNECTION, hint: '  ' }, 'email')).toEqual({
      connection: 'email',
    });
  });

  it('l’inscription par mot de passe garde son onglet', () => {
    expect(
      redirectParams(
        { connection: CUSTOMER_CONNECTION, hint: 'a@b.fr', signup: true },
        CUSTOMER_CONNECTION,
      ),
    ).toEqual({ connection: CUSTOMER_CONNECTION, login_hint: 'a@b.fr', screen_hint: 'signup' });
  });

  /**
   * S6 : la session du tenant est unique, quelle que soit la connexion qui
   * l'a ouverte. Changer de connexion force l'écran.
   */
  it('🔴 force l’écran quand on change de connexion', () => {
    expect(redirectParams({ connection: CUSTOMER_CONNECTION }, EMAIL_CODE_CONNECTION)).toEqual({
      connection: CUSTOMER_CONNECTION,
      prompt: 'login',
    });
    expect(redirectParams({ connection: GOOGLE_CONNECTION }, CUSTOMER_CONNECTION).prompt).toBe(
      'login',
    );
  });

  it('une connexion précédente inconnue compte comme un changement', () => {
    expect(redirectParams({ connection: EMAIL_CODE_CONNECTION }, null).prompt).toBe('login');
  });

  it('la même connexion qu’au dernier départ ne force rien', () => {
    expect(
      redirectParams({ connection: EMAIL_CODE_CONNECTION }, EMAIL_CODE_CONNECTION).prompt,
    ).toBe(undefined);
  });
});

describe('la dernière connexion', () => {
  afterEach(() => localStorage.clear());

  it('se retient et se relit', () => {
    expect(readLastConnection()).toBeNull();
    writeLastConnection(EMAIL_CODE_CONNECTION);
    expect(readLastConnection()).toBe('email');
  });
});
