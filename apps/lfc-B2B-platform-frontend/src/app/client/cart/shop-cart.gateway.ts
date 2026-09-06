import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ShopCartPayload, ShopCartResponse, ShopCartView } from '@lfd/contracts';
import { map, switchMap, type Observable } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * L'aller-retour avec `/shop/cart` — **le transport, et rien d'autre**.
 *
 * Aucune règle ici : ni fusion, ni cadence, ni décision de ce qu'on écrit. Elles
 * sont dans {@link ShopCartSync}, et la séparation a une raison précise — la
 * fusion se relit et se discute (« la copie la plus récente gagne en entier »),
 * alors qu'un transport se remplace. Mélangés, la première aurait disparu dans
 * les plis du second.
 *
 * Le jeton est demandé à chaque appel plutôt que gardé : c'est ce que fait
 * `AccountService`, et pour la même raison — le SDK Auth0 sait seul si celui
 * qu'il a en main est encore valable.
 */
@Injectable({ providedIn: 'root' })
export class ShopCartGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /** Le panier gardé chez nous, ou `null` si la personne n'en a jamais posé. */
  load(): Observable<ShopCartView | null> {
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<ShopCartResponse>(`${AUTH_CONFIG.apiBaseUrl}/shop/cart`, headers(token)),
      ),
      map((response) => response.cart),
    );
  }

  /** Met le panier de côté. Zéro ligne est un panier vide, pas un effacement. */
  save(payload: ShopCartPayload): Observable<ShopCartView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.put<ShopCartView>(
            `${AUTH_CONFIG.apiBaseUrl}/shop/cart`,
            payload,
            headers(token),
          ),
        ),
      );
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}
