/**
 * Les paramètres d'autorisation qu'on envoie à Auth0 — la partie PURE des
 * redirections de {@link AuthFacade}.
 *
 * Sortie de la façade le 2026-10-09 (connexion par code e-mail) pour deux
 * raisons : la façade dépassait déjà la taille d'un fichier, et les tests
 * tournent en configuration `development`, où `DEV_BYPASS_AUTH` rend la branche
 * qui part chez Auth0 inatteignable. Ce que la redirection DEMANDE —
 * connexion, `login_hint`, `prompt`, onglet — s'éprouve donc ici, sans SDK.
 */

/** Ce qu'une redirection demande à Auth0, avant l'arbitrage de `prompt`. */
export interface RedirectRequest {
  /** La connexion nommée — jamais laissée au choix de l'application Auth0. */
  readonly connection: string;
  /** L'adresse déjà tapée chez nous, pour préremplir l'écran d'Auth0. */
  readonly hint?: string | undefined;
  /** Ouvrir l'onglet inscription (connexion base de données seulement). */
  readonly signup?: boolean | undefined;
}

/** Les `authorizationParams` que ce dépôt envoie — un sous-ensemble de ceux du SDK. */
export interface RedirectParams {
  readonly connection: string;
  readonly login_hint?: string;
  readonly screen_hint?: 'signup';
  readonly prompt?: 'login';
}

/**
 * Fabrique les paramètres d'une redirection.
 *
 * 🔴 **`prompt: 'login'` dès qu'on change de connexion (S6 du plan).** Le
 * tenant garde UNE session, quelle que soit la connexion qui l'a ouverte. Sans
 * ce paramètre, quelqu'un qui a ouvert une session par mot de passe puis
 * choisit « recevoir un code » pouvait être renvoyé chez nous avec la session
 * de la première — l'écran demandé n'aurait jamais été montré. Une connexion
 * précédente inconnue (premier passage sur ce navigateur, stockage refusé)
 * compte comme un changement : on préfère un écran de trop à une session
 * reprise par erreur.
 *
 * Même connexion qu'au dernier passage : pas de `prompt`, la session du
 * tenant, si elle existe encore, peut servir.
 */
export function redirectParams(
  request: RedirectRequest,
  previousConnection: string | null,
): RedirectParams {
  return {
    connection: request.connection,
    ...loginHint(request.hint),
    ...(request.signup === true ? { screen_hint: 'signup' as const } : {}),
    ...(previousConnection === request.connection ? {} : { prompt: 'login' as const }),
  };
}

/** `login_hint` seulement s'il y a quelque chose à souffler. */
function loginHint(email: string | undefined): { login_hint?: string } {
  return email !== undefined && email.trim() !== '' ? { login_hint: email.trim() } : {};
}

/** La clé de stockage local de la dernière connexion demandée. */
const LAST_CONNECTION_KEY = 'lfc-last-connection';

/**
 * La connexion du dernier départ chez Auth0, ou `null` si on ne la sait pas.
 *
 * Le stockage peut être refusé (navigation privée) : on retombe alors sur
 * « inconnue », donc sur `prompt: 'login'` — le sens sûr.
 */
export function readLastConnection(): string | null {
  try {
    return localStorage.getItem(LAST_CONNECTION_KEY);
  } catch {
    return null;
  }
}

export function writeLastConnection(connection: string): void {
  try {
    localStorage.setItem(LAST_CONNECTION_KEY, connection);
  } catch {
    // Stockage refusé : le prochain départ redemandera l'écran, ce qui est sûr.
  }
}
