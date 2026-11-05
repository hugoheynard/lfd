import { InjectionToken } from '@angular/core';

/**
 * **Ce qui doit se faire avant de quitter la session** — un crochet que
 * {@link AuthFacade.logout} appelle, dans l'ordre d'enregistrement, AVANT de
 * partir chez Auth0 (ou, en bypass dev, avant de revenir à l'accueil).
 *
 * Un jeton plutôt qu'un appel direct : la façade ne connaît pas le client.
 * L'oubli du stockage (`client/sign-out/`) dépend du panier, qui dépend de
 * l'espace, qui dépend de la façade — l'importer d'ici fermerait le cycle
 * (plan `caching-usage/dans-quel-espace-est-le-client.md`, § 00 bis). La façade résout le
 * jeton au moment de la déconnexion, pas à sa construction, pour la même
 * raison : les abonnés injectent ce qui injecte la façade.
 *
 * Un crochet qui lève n'empêche pas la déconnexion : sortir prime sur oublier.
 */
export const BEFORE_SIGN_OUT = new InjectionToken<readonly (() => void)[]>('BEFORE_SIGN_OUT');
