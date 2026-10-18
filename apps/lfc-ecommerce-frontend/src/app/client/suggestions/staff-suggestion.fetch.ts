import type { HttpClient } from '@angular/common/http';
import type {
  CartSuggestionsPayload,
  CartSuggestionView,
  HomeSuggestionsPayload,
  HomeSuggestionView,
  ProductSuggestionsPayload,
  ProductSuggestionView,
} from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';

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
    return firstValueFrom(http.post<CartSuggestionView[]>(route, payload));
  }
  return firstValueFrom(
    token.pipe(
      switchMap((bearer) =>
        http.post<CartSuggestionView[]>(`${route}/mine`, payload, {
          headers: { Authorization: `Bearer ${bearer}` },
        }),
      ),
    ),
  );
}
