import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { OrderView, PlaceOrderPayload, PlacedOrderResponse } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * API des **commandes** côté front. Le checkout (panier → commande) et la liste
 * des commandes d'une entreprise passent par ici.
 *
 * Comme `AccountService`, ce service ne connaît qu'Auth0 via la façade (pour le
 * jeton) : les prix ne sont **jamais** envoyés par le client, seulement `sku` +
 * quantité — le serveur les ré-résout. Les types de fil viennent de
 * `@lfd/contracts` (imports de **type** uniquement : aucun zod dans le bundle).
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly _orders = signal<readonly OrderView[]>([]);
  readonly orders = this._orders.asReadonly();

  /**
   * Passe une commande — **zéro friction**. L'entreprise est optionnelle (dans le
   * payload : `companyId` `null` = commande personnelle). Le serveur ré-résout les
   * prix et décide si une carte est requise.
   */
  place(payload: PlaceOrderPayload): Observable<PlacedOrderResponse> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.post<PlacedOrderResponse>(
            `${AUTH_CONFIG.apiBaseUrl}/orders`,
            payload,
            headers(token),
          ),
        ),
      );
  }

  /** (Re)charge les commandes **personnelles** du client (sans entreprise). */
  loadMine(): void {
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<readonly OrderView[]>(
            `${AUTH_CONFIG.apiBaseUrl}/orders/mine`,
            headers(token),
          ),
        ),
      )
      .subscribe({
        next: (orders) => this._orders.set(orders),
        error: () => this._orders.set([]),
      });
  }

  /** (Re)charge les commandes d'une entreprise dans l'état. */
  loadOrders(companyId: string): void {
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<readonly OrderView[]>(
            `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/orders`,
            headers(token),
          ),
        ),
      )
      .subscribe({
        next: (orders) => this._orders.set(orders),
        error: () => this._orders.set([]),
      });
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}
