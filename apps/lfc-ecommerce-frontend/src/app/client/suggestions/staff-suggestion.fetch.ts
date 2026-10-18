import type { HttpClient } from '@angular/common/http';
import type {
  CartSuggestionsPayload,
  CartSuggestionView,
  HomeSuggestionsPayload,
  ProductSuggestionsPayload,
} from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';

/** Les emplacements servis, et ce que chacun envoie. */
interface SuggestionAsks {
  readonly cart: CartSuggestionsPayload;
  readonly product: ProductSuggestionsPayload;
  readonly home: HomeSuggestionsPayload;
}

/**
 * **La requête des suggestions du staff** (panier, fiche, accueil), dans un morceau
 * chargé à la demande : le paquet initial de la boutique est près de son
 * plafond, et rien de ceci ne sert avant qu'un panier, une fiche ou l'accueil s'ouvre.
 *
 * Reconnu (`token` fourni), la route murée — l'espace part dans l'en-tête que
 * pose `workspaceInterceptor`, comme pour la vitrine et le devis ; sinon la
 * route publique, lecteur particulier. Les trois rendent la même vue.
 */
export function fetchStaffSuggestions<P extends keyof SuggestionAsks>(
  http: HttpClient,
  placement: P,
  payload: SuggestionAsks[P],
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
