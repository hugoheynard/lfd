import type { HttpClient } from '@angular/common/http';
import type {
  CartSuggestionsPayload,
  CartSuggestionView,
  HomeSuggestionsPayload,
  HomeSuggestionView,
  ProductSuggestionsPayload,
  ProductSuggestionView,
  ShopItemView,
  UsualSuggestionsPayload,
  UsualSuggestionView,
} from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { VISITOR } from '../client-context.service';
import {
  type ContextKey,
  type WorkspaceRequest,
  workspaceRequestOf,
} from '../context-keyed/context-keyed';
import { isLocked } from '../shop/locked-item';

/**
 * **La requête des suggestions du panier**, dans un morceau chargé à la
 * demande : le paquet initial de la boutique est près de son plafond, et rien
 * de ceci ne sert avant qu'un panier, une fiche ou l'accueil s'ouvre. La
 * fiche et l'accueil lisent par la brique ({@link productSuggestionsFor},
 * {@link homeSuggestionsFor}) ; le panier, exclu du lot d, reste ici.
 *
 * Reconnu (`token` fourni), la route murée — l'espace part dans l'en-tête que
 * pose `workspaceInterceptor`, comme pour la vitrine et le devis ; sinon la
 * route publique, lecteur particulier.
 */
export function fetchStaffSuggestions(
  http: HttpClient,
  placement: 'cart',
  payload: CartSuggestionsPayload,
  token: Observable<string> | null,
): Promise<readonly CartSuggestionView[]> {
  const route = `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/${placement}`;
  if (token === null) {
    return firstValueFrom(http.post<CartSuggestionView[]>(route, payload)).then(orderableOnly);
  }
  return firstValueFrom(
    token.pipe(
      switchMap((bearer) =>
        http.post<CartSuggestionView[]>(`${route}/mine`, payload, {
          headers: { Authorization: `Bearer ${bearer}` },
        }),
      ),
    ),
  ).then(orderableOnly);
}

/**
 * **Jamais suggérer ce qu'on ne peut pas commander**
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, L3). Le serveur ne
 * sert pas d'article verrouillé aux suggestions du panier (S7). Les habituels
 * font exception (Hugo, 2026-10-30) : le client l'a déjà commandé, et doit
 * comprendre pourquoi il ne peut plus — {@link usualSuggestionsFor} garde
 * l'article, que la carte montre grisé avec sa raison, sans « + ».
 */
function orderableOnly<V extends { readonly item: ShopItemView }>(views: readonly V[]): V[] {
  return views.filter((view) => !isLocked(view.item));
}

/**
 * **« Vos habituels »** (R1) — la route murée SEULE : il n'y a pas de route
 * publique, et l'appelant ne demande qu'avec une société dans l'espace
 * courant. Même morceau que les autres suggestions : rien à charger de plus.
 * Un article verrouillé y RESTE, grisé par la carte (pas d'`orderableOnly`).
 */
export function usualSuggestionsFor(
  http: HttpClient,
  payload: UsualSuggestionsPayload,
  token: Observable<string>,
  key: ContextKey,
): Observable<readonly UsualSuggestionView[]> {
  const route = `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/usuals/mine`;
  return token.pipe(
    switchMap((bearer) =>
      http.post<UsualSuggestionView[]>(
        route,
        payload,
        workspaceRequestOf(key, { Authorization: `Bearer ${bearer}` }),
      ),
    ),
  );
}

/**
 * La requête d'une lecture de la brique (`contextKeyed`) : la route murée si
 * la clé est un espace, la publique pour un visiteur — et l'en-tête d'espace
 * tiré de la CLÉ (`workspaceRequestOf`), jamais de l'espace courant à l'envoi.
 */
function postFor<V extends { readonly item: ShopItemView }>(
  route: string,
  send: (url: string, request: WorkspaceRequest) => Observable<V[]>,
  token: Observable<string>,
  key: ContextKey,
): Observable<readonly V[]> {
  const request =
    key.workspace === VISITOR
      ? send(route, workspaceRequestOf(key))
      : token.pipe(
          switchMap((bearer) =>
            send(`${route}/mine`, workspaceRequestOf(key, { Authorization: `Bearer ${bearer}` })),
          ),
        );
  return request.pipe(map(orderableOnly));
}

/** Les suggestions de l'accueil pour une clé de la brique (cf. {@link fetchStaffSuggestions}). */
export function homeSuggestionsFor(
  http: HttpClient,
  payload: HomeSuggestionsPayload,
  token: Observable<string>,
  key: ContextKey,
): Observable<readonly HomeSuggestionView[]> {
  return postFor(
    `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/home`,
    (url, request) => http.post<HomeSuggestionView[]>(url, payload, request),
    token,
    key,
  );
}

/** La suggestion d'une fiche pour une clé de la brique (cf. {@link fetchStaffSuggestions}). */
export function productSuggestionsFor(
  http: HttpClient,
  payload: ProductSuggestionsPayload,
  token: Observable<string>,
  key: ContextKey,
): Observable<readonly ProductSuggestionView[]> {
  return postFor(
    `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/product`,
    (url, request) => http.post<ProductSuggestionView[]>(url, payload, request),
    token,
    key,
  );
}
