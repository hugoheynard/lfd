import type { LoginMethodsView } from '@lfd/contracts';

import { FACEBOOK_CONNECTION, GOOGLE_CONNECTION } from '../auth/auth.config';
import type { AccountCopy } from '../client/copy/screens/account.copy';

/**
 * Ce qu'un geste sur les méthodes de connexion a produit.
 *
 * Trois issues, et la deuxième n'est **pas** un échec : fermer la fenêtre
 * d'autorisation est un renoncement, pas un refus — il n'y a rien à dire.
 */
export type LoginMethodsOutcome =
  | { readonly kind: 'loaded'; readonly methods: LoginMethodsView }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly refusal: LoginMethodRefusal };

/**
 * Un refus, et le geste qu'il appelle.
 *
 * `message` est celui du **serveur** quand il en a rendu un : il est écrit en
 * français, pour être lu, et le réécrire ici ferait deux versions du même
 * refus. `null` quand l'échec est survenu avant l'appel (fenêtre refusée,
 * autorisation qui n'aboutit pas) — l'écran met alors sa propre phrase.
 */
export interface LoginMethodRefusal {
  /**
   * Le même geste, refait, peut passer : une preuve périmée ou invalide se
   * repasse (plan §10.2, `identity.proof_*` en 400). Un conflit (409) non :
   * ce compte ouvre autre chose, et c'est ailleurs qu'il faut agir.
   */
  readonly again: boolean;
  readonly message: string | null;
}

/**
 * Les codes de refus que **refaire le geste** répare — les 400 du lot A.
 *
 * Le code se branche, le message s'affiche : comparer des messages ferait
 * dépendre un enchaînement d'une phrase qu'un relecteur peut reformuler
 * (`httpErrorCode`, `@lfd/endpoints`).
 */
export const RETRYABLE_REFUSALS: readonly string[] = [
  'identity.proof_expired',
  'identity.proof_invalid',
];

/**
 * Ce qu'a produit une demande de **lien de mot de passe** (`POST
 * /me/password-link`, 204 sans corps).
 *
 * Deux issues et pas trois : il n'y a rien à renoncer, le geste ne passe pas
 * par une fenêtre d'autorisation. Le refus porte le message du **serveur** —
 * les deux 409 connus (`identity.password_email_unverified`,
 * `identity.no_password_method`) disent chacun leur geste de sortie, et le 429
 * dit le débit ; les réécrire ici ferait deux versions du même refus.
 */
export type PasswordLinkOutcome =
  { readonly kind: 'sent' } | { readonly kind: 'failed'; readonly message: string | null };

/** Un fournisseur qu'on peut ajouter à son compte. */
export interface AddableProvider {
  /**
   * Le nom de connexion Auth0 — celui qu'on passe à l'autorisation, et celui
   * que la liste des méthodes rend en `provider` pour une connexion sociale.
   */
  readonly connection: string;
  readonly label: (copy: AccountCopy) => string;
}

/**
 * 🔴 **Une liste, même à un seul élément.** Facebook est reporté, pas
 * abandonné (plan, en-tête) : l'écran se dessine sur une liste de fournisseurs,
 * sans quoi il se réécrirait entièrement au second. L'ajouter ici sera une
 * ligne — `{ connection: FACEBOOK_CONNECTION, label: (c) => c.loginMethodFacebook }`
 * — le jour où le tenant l'active.
 */
export const ADDABLE_PROVIDERS: readonly AddableProvider[] = [
  { connection: GOOGLE_CONNECTION, label: (copy) => copy.loginMethodGoogle },
];

/**
 * La stratégie des identités de base de données chez Auth0 — le mot de passe /
 * la passkey. Exporté depuis le 2026-09-22 : c'est la ligne « E-mail », celle
 * qui porte l'adresse de connexion et le geste qui la change.
 */
export const DATABASE_PROVIDER = 'auth0';

/**
 * Le nom lisible d'une méthode.
 *
 * Un fournisseur inconnu se montre **tel quel** plutôt que sous une étiquette
 * inventée : mieux vaut un nom technique lisible qu'un nom faux.
 */
export function loginMethodLabel(provider: string, copy: AccountCopy): string {
  switch (provider) {
    case DATABASE_PROVIDER:
      return copy.loginMethodEmail;
    case GOOGLE_CONNECTION:
      return copy.loginMethodGoogle;
    case FACEBOOK_CONNECTION:
      return copy.loginMethodFacebook;
    default:
      return provider;
  }
}
