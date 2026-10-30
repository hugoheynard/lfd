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
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { isLocked } from '../shop/locked-item';

/**
 * **La requête des suggestions** (panier, fiche, accueil), dans un morceau
 * chargé à la demande : le paquet initial de la boutique est près de son
 * plafond, et rien de ceci ne sert avant qu'un panier, une fiche ou l'accueil s'ouvre.
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
): Promise<readonly CartSuggestionView[]>;
/** La fiche et l'accueil ne servent que le décidé (`StaffSuggestionView`). */
export function fetchStaffSuggestions(
  http: HttpClient,
  placement: 'product',
  payload: ProductSuggestionsPayload,
  token: Observable<string> | null,
): Promise<readonly ProductSuggestionView[]>;
export function fetchStaffSuggestions(
  http: HttpClient,
  placement: 'home',
  payload: HomeSuggestionsPayload,
  token: Observable<string> | null,
): Promise<readonly HomeSuggestionView[]>;
export function fetchStaffSuggestions(
  http: HttpClient,
  placement: 'cart' | 'product' | 'home',
  payload: CartSuggestionsPayload | ProductSuggestionsPayload | HomeSuggestionsPayload,
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
 * comprendre pourquoi il ne peut plus — {@link fetchUsualSuggestions} garde
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
export function fetchUsualSuggestions(
  http: HttpClient,
  payload: UsualSuggestionsPayload,
  token: Observable<string>,
): Promise<readonly UsualSuggestionView[]> {
  const route = `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/usuals/mine`;
  return firstValueFrom(
    token.pipe(
      switchMap((bearer) =>
        http.post<UsualSuggestionView[]>(route, payload, {
          headers: { Authorization: `Bearer ${bearer}` },
        }),
      ),
    ),
  );
}
