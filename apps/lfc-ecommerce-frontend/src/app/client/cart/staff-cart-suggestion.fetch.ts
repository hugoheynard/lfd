import type { HttpClient } from '@angular/common/http';
import type { CartSuggestionsPayload, CartSuggestionView } from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';

const ROUTE = `${AUTH_CONFIG.apiBaseUrl}/shop/suggestions/cart`;

/**
 * **La requête des suggestions du panier**, dans un morceau chargé à la
 * demande : le paquet initial de la boutique est près de son plafond, et rien
 * de ceci ne sert avant qu'un panier s'ouvre.
 *
 * Reconnu (`token` fourni), la route murée — l'espace part dans l'en-tête que
 * pose `workspaceInterceptor`, comme pour la vitrine et le devis ; sinon la
 * route publique, lecteur particulier.
 */
export function fetchCartSuggestions(
  http: HttpClient,
  payload: CartSuggestionsPayload,
  token: Observable<string> | null,
): Promise<readonly CartSuggestionView[]> {
  if (token === null) {
    return firstValueFrom(http.post<CartSuggestionView[]>(ROUTE, payload));
  }
  return firstValueFrom(
    token.pipe(
      switchMap((bearer) =>
        http.post<CartSuggestionView[]>(`${ROUTE}/mine`, payload, {
          headers: { Authorization: `Bearer ${bearer}` },
        }),
      ),
    ),
  );
}
