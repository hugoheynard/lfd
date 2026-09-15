import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  WORKSPACE_HEADER,
  type ShopCartPayload,
  type ShopCartResponse,
  type ShopCartView,
} from '@lfd/contracts';
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
 *
 * ## L'espace passe en argument, pas par l'intercepteur
 *
 * Le serveur sert le panier de l'espace que déclare l'en-tête (plan espace de
 * travail, D6 et D9). Chaque appel reçoit donc l'espace **capturé au geste** et
 * le pose lui-même — `workspaceInterceptor` ne remplace pas un en-tête déjà
 * posé. Lu à l'envoi, après l'accalmie ou l'arrivée du jeton, il pourrait être
 * celui d'une bascule survenue entre-temps, et les lignes d'un espace
 * s'écriraient dans l'autre.
 */
@Injectable({ providedIn: 'root' })
export class ShopCartGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /** Le panier gardé pour cet espace, ou `null` si la personne n'y en a jamais posé. */
  load(workspace: string): Observable<ShopCartView | null> {
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<ShopCartResponse>(
          `${AUTH_CONFIG.apiBaseUrl}/shop/cart`,
          headers(token, workspace),
        ),
      ),
      map((response) => response.cart),
    );
  }

  /** Met le panier de cet espace de côté. Zéro ligne est un panier vide, pas un effacement. */
  save(payload: ShopCartPayload, workspace: string): Observable<ShopCartView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.put<ShopCartView>(
            `${AUTH_CONFIG.apiBaseUrl}/shop/cart`,
            payload,
            headers(token, workspace),
          ),
        ),
      );
  }
}

function headers(token: string, workspace: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}`, [WORKSPACE_HEADER]: workspace } };
}
