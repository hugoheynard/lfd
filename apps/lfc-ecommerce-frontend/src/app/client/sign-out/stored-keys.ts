/**
 * **Toutes les clés que la boutique range dans le navigateur, classées** :
 * effacées à la déconnexion, ou gardées — et pourquoi.
 *
 * C'est la liste que tient `documentation/legal/registre-des-traceurs.md` :
 * une clé ajoutée au code s'inscrit ici ET au registre. Une clé de l'app qui
 * n'est dans aucune des deux listes fait échouer `stored-keys.spec.ts`, qui
 * relève les clés écrites dans les sources (relevé du 2026-11-05).
 *
 * Décision de Hugo (2026-11-05) : « supprimons le maximum du local à la
 * déconnexion ». Les noms sont les noms RÉELS dans le stockage — ceux de
 * `client/local-store.ts` y portent le préfixe `lfc.`.
 */

/** Une règle de nom : la clé exacte, ou tout ce qui commence par le préfixe. */
export interface KeyRule {
  readonly exact?: string;
  readonly prefix?: string;
}

const exact = (key: string): KeyRule => ({ exact: key });
const prefix = (start: string): KeyRule => ({ prefix: start });

/** Effacé à la déconnexion. */
export const ERASED_ON_SIGN_OUT: readonly KeyRule[] = [
  // Le panier visiteur et les copies par espace (`client/cart/cart.store.ts`).
  exact('lfc.cart'),
  exact('lfc.cart.savedAt'),
  exact('lfc.cart.units'),
  prefix('lfc.cart.ws.'),
  // Le mode de service et le brouillon d'une maison désignée (`client/order-context.store.ts`).
  exact('lfc.order.choice'),
  exact('lfc.order.houseDraft'),
  // Les coordonnées d'une commande sans compte (`guest-identity-form.ts`).
  exact('lfc.guest.identity'),
  // L'espace retenu de la dernière visite (`client/client-context.service.ts`, lot e).
  exact('lfc.workspace-hint'),
  // Le mode de connexion du dernier départ (`auth/auth-redirect.ts`).
  exact('lfc-last-connection'),
  // L'espace actif de l'ancienne surface (`legacy/commerce/commerce-context.service.ts`).
  exact('lfc-b2b-commerce-company-v1'),
  // Restes d'anciennes versions, plus écrits mais encore chez des clients
  // (registre, relevé du 2026-10-26 ; `pro-visit.service.ts` ne la lit plus).
  exact('lfc-b2b-cart-v1'),
  exact('lfd.shop.pro-visit'),
];

/**
 * Gardé à la déconnexion, et chaque ligne dit pourquoi.
 *
 * Les clés d'Auth0 (`@@auth0spajs@@…`, ses cookies) n'y sont pas : elles ne
 * sont pas à nous, `auth0.logout` les efface, et l'oubli n'y touche pas
 * (aucune règle ne les reconnaît comme de l'app).
 */
export const KEPT_ON_SIGN_OUT: readonly KeyRule[] = [
  // 🔴 L'anti-double-paiement (`client/client-orders.service.ts`). Une
  // déconnexion pendant un aller-retour Stripe qui les effacerait rendrait le
  // panier (la commande attendue est oubliée) et une clé d'idempotence neuve :
  // la même commande pourrait être payée deux fois.
  exact('lfc.orders'),
  prefix('lfc.orders.'),
  exact('lfc.order-attempt'),
  prefix('lfc.order-attempt.'),
  exact('lfc.cart-awaiting-payment'),
  prefix('lfc.cart-awaiting-payment.'),
  // Les avis à montrer APRÈS la sortie : `invitation-expired.ts` et
  // `identity-conflict.ts` les écrivent juste AVANT d'appeler `logout()`.
  // Les effacer ici détruirait le message qu'ils veulent montrer ; ils
  // s'effacent eux-mêmes une fois affichés, et la session d'onglet les borne.
  exact('lfc-invitation-expired'),
  exact('lfc-identity-link-required'),
  // L'état « déconnecté » du bypass dev (`auth/auth.facade.ts`), que la
  // déconnexion elle-même pose.
  exact('lfc-dev-signed-out'),
];

/** Vrai si la clé tombe sous une des règles. */
export function matches(rules: readonly KeyRule[], key: string): boolean {
  return rules.some(
    (rule) =>
      (rule.exact !== undefined && rule.exact === key) ||
      (rule.prefix !== undefined && key.startsWith(rule.prefix)),
  );
}

/** Vrai pour une clé de l'app — c'est-à-dire ni d'Auth0, ni de Stripe. */
export function isAppKey(key: string): boolean {
  return key.startsWith('lfc') || key.startsWith('lfd');
}
