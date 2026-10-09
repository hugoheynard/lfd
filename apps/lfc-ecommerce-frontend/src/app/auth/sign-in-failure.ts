/**
 * Ce qu'Auth0 a répondu quand une connexion échoue — la partie PURE de
 * `/connexion/erreur`.
 *
 * Régression du 2026-10-09 : la connexion `email` n'était pas activée sur
 * l'application de la boutique. Auth0 rendait `?error=invalid_request&
 * error_description=the connection is not enabled`, le SDK naviguait vers `/`,
 * et la personne retombait sur l'accueil sans un mot — ni code reçu, ni refus
 * affiché. L'échec n'était visible que dans l'URL.
 */

/** Le refus, tel qu'Auth0 le nomme. */
export interface SignInFailure {
  /** `access_denied` quand la personne a annulé ; sinon le code OAuth du refus. */
  readonly code: string;
  /** Le texte d'Auth0, en anglais, montré tel quel : c'est le cas réel. */
  readonly description: string | null;
}

/** Le code OAuth d'une connexion que la personne a elle-même abandonnée. */
export const SIGN_IN_CANCELLED = 'access_denied';

/**
 * Lit une erreur du SDK. `null` pour tout ce qui ne porte pas de code OAuth :
 * une erreur réseau n'est pas un refus d'Auth0, et on ne l'habille pas en refus.
 */
export function signInFailureOf(error: unknown): SignInFailure | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const code = textField(error, 'error');
  if (code === null) {
    return null;
  }
  return { code, description: textField(error, 'error_description') };
}

function textField(source: object, key: string): string | null {
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
