import { signInFailureOf } from './sign-in-failure';

describe('signInFailureOf', () => {
  /** Régression 2026-10-09 : la connexion par code n'était pas activée sur l'application. */
  it('rend le code et le texte d’Auth0', () => {
    expect(
      signInFailureOf({
        error: 'invalid_request',
        error_description: 'the connection is not enabled',
      }),
    ).toEqual({ code: 'invalid_request', description: 'the connection is not enabled' });
  });

  it('un code sans texte reste un refus', () => {
    expect(signInFailureOf({ error: 'access_denied' })).toEqual({
      code: 'access_denied',
      description: null,
    });
  });

  it('une erreur sans code OAuth n’est pas un refus d’Auth0', () => {
    expect(signInFailureOf(new Error('Failed to fetch'))).toBeNull();
    expect(signInFailureOf({ error: '  ' })).toBeNull();
    expect(signInFailureOf(null)).toBeNull();
    expect(signInFailureOf('invalid_request')).toBeNull();
  });
});
